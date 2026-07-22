"""第三方 CLI 持久化的高层编排服务。"""

from __future__ import annotations

import asyncio
import os
import re
import time
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from agentlang.logger import get_logger
from app.service.cli_manager.filesystem import CliFilesystemPersistence
from app.service.cli_manager.installer import CliInstaller
from app.service.cli_manager.models import (
    CliApplyRequest,
    CliApplyResult,
    CliConfigDir,
    CliInstallStep,
    CliListItem,
    CliListResult,
    CliManagerError,
    CliManagerPaths,
    CliPathLink,
    CliRegistryItem,
    CliRemoveResult,
    CliRestoreIssue,
    CliRestoreResult,
    CommandRunResult,
)
from app.service.cli_manager.path_utils import CliPathUtils
from app.service.cli_manager.paths import CliManagerPathResolver
from app.service.cli_manager.registry import CliRegistryStore
from app.service.cli_manager.validation import CliRequestValidator

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)


class CliManagerService:
    """管理位于 ~/.magic/cli 下的用户级第三方 CLI 持久化。"""

    def __init__(
        self,
        *,
        paths: CliManagerPaths | None = None,
        command_runner: Callable[[str, Path, dict[str, str], int], CommandRunResult] | None = None,
    ) -> None:
        """使用可选测试路径和命令执行器初始化服务。"""
        self._paths = paths or self.default_paths()
        self._installer = CliInstaller(self._paths, command_runner=command_runner)
        self._filesystem = CliFilesystemPersistence(self._paths, self._installer)
        self._registry = CliRegistryStore(self._paths)
        self._validator = CliRequestValidator(self._paths)
        self._lock = asyncio.Lock()

    @classmethod
    async def initialize_from_environment(cls, agent_context: AgentContext | None = None) -> None:
        """初始化沙箱内的 CLI 持久化能力，失败时降级为记录日志。"""
        try:
            restore_result = await cls().restore()
            logger.info(f"持久化 CLI 恢复完成: {restore_result}")
        except Exception as e:
            logger.warning(f"持久化 CLI 恢复失败，继续初始化流程: {e}")

        cls._schedule_initial_cli_status_detection(agent_context)

    @staticmethod
    def default_paths() -> CliManagerPaths:
        """从 PathManager 构建默认持久化布局。"""
        return CliManagerPathResolver.default_paths()

    @staticmethod
    def build_path_prefix() -> str:
        """返回需要追加到 PATH 前缀的持久化 CLI bin 目录。"""
        return CliManagerPathResolver.build_path_prefix()

    @classmethod
    def apply_path_to_env(cls, env_vars: dict[str, str]) -> None:
        """将持久化 CLI bin 目录追加到 PATH，失败时只记录日志。"""
        try:
            CliManagerPathResolver.apply_path_to_env(env_vars)
        except Exception as e:
            logger.warning(f"注入持久化 CLI PATH 失败: {e}")

    @staticmethod
    def _schedule_initial_cli_status_detection(agent_context: AgentContext | None) -> None:
        """调度 CLI 状态探测，失败时不影响工作区初始化。"""
        try:
            from app.service.cli_status import CliStatusFactory

            CliStatusFactory.schedule_initial_detection(agent_context)
        except Exception as e:
            logger.warning(f"CLI 状态后台检测启动失败，继续初始化流程: {e}")

    async def apply(self, request: CliApplyRequest) -> CliApplyResult:
        """安装或接管 CLI，并持久化命令入口。"""
        if not request.confirmed:
            raise CliManagerError(
                "confirmation_required",
                "CLI persistence requires explicit user confirmation.",
            )

        name = self._validator.validate_name(request.name, "name")
        commands = self._validator.normalize_commands(request.commands or [name])
        self._validator.ensure_user_managed_scope(name, commands)
        command_paths = self._normalize_command_paths(commands, request.command_paths)
        extra_bin_dirs = self._normalize_extra_bin_dirs(name, request.extra_bin_dirs)
        env_keys = self._validator.normalize_env_keys(request.env_keys)
        config_dirs = self._validator.normalize_config_dirs(request.config_dirs)
        steps: list[CliInstallStep] = []

        async with self._lock:
            registry = await self._registry.read()
            self._validator.ensure_registry_commands_available(name, commands, registry)
            await self._registry.ensure_directories()

            if request.mode == "install":
                await self._validator.ensure_commands_do_not_shadow_path(commands)
                strategy, install_strategy = await self._install(request, steps)
            elif request.mode == "adopt":
                strategy = "adopt"
                install_strategy = "adopt"
                steps.append({"stage": "adopt", "strategy": strategy})
            else:
                raise CliManagerError("invalid_mode", f"Unsupported mode: {request.mode}", mode=request.mode)

            command_targets = await self._installer.resolve_command_targets(
                commands,
                command_paths=command_paths,
                extra_bin_dirs=extra_bin_dirs,
            )
            await self._validator.ensure_command_targets_are_not_shadowed(command_targets)
            app_dir, updated_targets, app_links = await self._filesystem.prepare_app_dir(name, command_targets)
            await self._filesystem.check_app_size(app_dir)
            config_mappings = await self._filesystem.prepare_config_dirs(name, config_dirs)
            final_install_strategy = self._resolve_final_install_strategy(
                request.mode,
                strategy,
                install_strategy,
                updated_targets,
                app_links,
            )

            item = self._build_registry_item(
                name=name,
                commands=commands,
                install_strategy=final_install_strategy,
                package_manager=strategy,
                app_dir=app_dir,
                command_targets=updated_targets,
                app_links=app_links,
                config_dirs=config_mappings,
                env_keys=env_keys,
            )
            self._registry.upsert_item(registry, item)
            await self._registry.write(registry)
            await self._filesystem.restore_item(item, command_targets=updated_targets)
            validation = await self._filesystem.validate_item(item)

        return {
            "name": name,
            "commands": commands,
            "strategy": final_install_strategy,
            "package_manager": strategy,
            "steps": steps,
            "write_paths": {
                "root_dir": str(self._paths.root_dir),
                "bin_dir": str(self._paths.bin_dir),
                "app_dir": item.app_dir,
                "registry_file": str(self._paths.registry_file),
            },
            "command_targets": item.command_targets,
            "app_links": [link.to_dict() for link in app_links],
            "config_dirs": [mapping.to_dict() for mapping in config_mappings],
            "env_keys": env_keys,
            "status": "active",
            "validation": validation,
        }

    async def list_items(self, *, validate: bool = False) -> CliListResult:
        """列出已持久化 CLI 记录，并可选执行轻量校验。"""
        registry = await self._registry.read()
        items = [CliRegistryItem.from_dict(item) for item in registry["items"]]
        result_items: list[CliListItem] = []
        for item in items:
            result_items.append(await self._build_list_item(item, validate))
        return {"count": len(result_items), "items": result_items}

    async def remove(self, *, name: str, remove_state: bool = False, confirmed: bool = False) -> CliRemoveResult:
        """移除已持久化 CLI 注册表记录及其受管理的文件系统项。"""
        if not confirmed:
            raise CliManagerError("confirmation_required", "Removing a persisted CLI requires confirmation.")

        normalized_name = self._validator.validate_name(name, "name")
        async with self._lock:
            registry = await self._registry.read()
            item = self._registry.find_item(registry, normalized_name)
            if item is None:
                raise CliManagerError("not_found", f"CLI is not persisted: {normalized_name}", name=normalized_name)

            removed_paths = await self._filesystem.remove_files(item, remove_state)
            self._registry.remove_item(registry, normalized_name)
            await self._registry.write(registry)

        return {
            "name": normalized_name,
            "removed_paths": removed_paths,
            "remove_state": remove_state,
            "status": "removed",
        }

    async def restore(self) -> CliRestoreResult:
        """根据注册表恢复命令 shim 和配置目录软链。"""
        await self._registry.ensure_directories()
        registry = await self._registry.read()
        restored: list[str] = []
        broken: list[CliRestoreIssue] = []
        registry_changed = False
        for data in registry["items"]:
            item = CliRegistryItem.from_dict(data)
            if item.status != "active":
                continue
            try:
                command_targets = await self._resolve_restore_command_targets(item)
                item_changed = self._refresh_item_restore_paths(item, command_targets)
                await self._filesystem.restore_item(item, command_targets=command_targets)
                validation = await self._filesystem.validate_item(item)
                if validation["ok"]:
                    restored.append(item.name)
                    if item_changed:
                        self._registry.upsert_item(registry, item)
                        registry_changed = True
                else:
                    broken.append({"name": item.name, "validation": validation})
            except Exception as exc:
                logger.warning("[CliManager] restore failed for %s: %s", item.name, exc)
                broken.append({"name": item.name, "error": str(exc)})
        if registry_changed:
            await self._registry.write(registry)
        return {"restored": restored, "broken": broken}

    async def _install(self, request: CliApplyRequest, steps: list[CliInstallStep]) -> tuple[str, str]:
        """执行安装分支，并返回包管理器名称和持久化策略名称。"""
        if not request.install_command or not request.install_command.strip():
            raise CliManagerError("install_command_required", "install_command is required for install mode.")
        strategy = self._installer.detect_strategy(request.install_command, request.preferred_strategy)
        command = self._installer.rewrite_install_command(request.install_command, strategy)
        steps.append({"stage": "install", "strategy": strategy, "command": self._redact_command(command)})
        run_result = await self._installer.run_install(command)
        if not run_result.ok:
            raise CliManagerError(
                "install_command_failed",
                "CLI install command failed.",
                exit_code=run_result.exit_code,
                stdout=self._truncate(run_result.stdout),
                stderr=self._truncate(run_result.stderr),
            )
        return strategy, "prefix" if strategy != "shell" else "adopt"

    def _build_registry_item(
        self,
        *,
        name: str,
        commands: list[str],
        install_strategy: str,
        package_manager: str,
        app_dir: Path,
        command_targets: dict[str, Path],
        app_links: list[CliPathLink],
        config_dirs: list[CliConfigDir],
        env_keys: list[str],
    ) -> CliRegistryItem:
        """创建带时间戳和平台元数据的注册表记录。"""
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return CliRegistryItem(
            name=name,
            commands=commands,
            install_strategy=install_strategy,
            package_manager=package_manager,
            version="unknown",
            app_dir=str(app_dir),
            bin_dir=str(self._paths.bin_dir),
            command_targets={command: str(target) for command, target in command_targets.items()},
            app_links=app_links,
            config_dirs=config_dirs,
            env_keys=env_keys,
            platform={"os": os.uname().sysname.lower(), "arch": os.uname().machine},
            created_at=now,
            updated_at=now,
            status="active",
        )

    async def _resolve_restore_command_targets(self, item: CliRegistryItem) -> dict[str, Path]:
        """恢复前解析命令目标，允许文件系统层修复旧的外部路径记录。"""
        return {
            command: await self._filesystem.resolve_command_target_from_item(item, command)
            for command in item.commands
        }

    def _refresh_item_restore_paths(self, item: CliRegistryItem, command_targets: dict[str, Path]) -> bool:
        """将恢复时发现的真实持久化目标写回注册表对象。"""
        changed = False
        updated_targets = {command: str(target) for command, target in command_targets.items()}
        if item.command_targets != updated_targets:
            item.command_targets = updated_targets
            changed = True

        if command_targets and all(CliPathUtils.is_lexically_under(target, self._paths.root_dir) for target in command_targets.values()):
            app_dir = str(self._infer_app_dir_from_targets(command_targets))
            if item.app_dir != app_dir:
                item.app_dir = app_dir
                changed = True
        return changed

    def _infer_app_dir_from_targets(self, command_targets: dict[str, Path]) -> Path:
        """根据命令目标推断注册表中的应用目录。"""
        roots = [self._filesystem.infer_install_root(target) for target in command_targets.values()]
        if not roots:
            return self._paths.root_dir
        common_root = Path(os.path.commonpath([str(root) for root in roots]))
        return common_root.parent if common_root.name == "bin" else common_root

    def _resolve_final_install_strategy(
        self,
        mode: str,
        package_manager: str,
        initial_strategy: str,
        command_targets: dict[str, Path],
        app_links: list[CliPathLink],
    ) -> str:
        """根据命令最终落点修正注册表中的安装策略。"""
        if mode != "install":
            return initial_strategy
        if package_manager == "shell" and not app_links and command_targets:
            targets_in_named_prefix = all(
                CliPathUtils.is_under(target, self._paths.prefixes_dir)
                for target in command_targets.values()
            )
            if targets_in_named_prefix:
                return "shell_prefix"
        return initial_strategy

    def _normalize_command_paths(self, commands: list[str], command_paths: dict[str, str]) -> dict[str, Path]:
        """校验并展开调用方明确指定的命令路径。"""
        normalized: dict[str, Path] = {}
        command_set = set(commands)
        for raw_command, raw_path in command_paths.items():
            command = self._validator.validate_name(raw_command, "command")
            if command not in command_set:
                raise CliManagerError(
                    "command_path_unknown_command",
                    "Command path was provided for a command that is not being persisted.",
                    command=command,
                    commands=commands,
                )
            path_text = (raw_path or "").strip()
            if not path_text:
                raise CliManagerError(
                    "command_path_required",
                    "Command path cannot be empty.",
                    command=command,
                )
            normalized[command] = CliPathUtils.expand_lexical(path_text)
        return normalized

    def _normalize_extra_bin_dirs(self, name: str, extra_bin_dirs: list[str]) -> list[Path]:
        """生成命令查找时额外使用的持久化 bin 目录。"""
        result = [self._paths.prefixes_dir / name / "bin"]
        for raw_path in extra_bin_dirs:
            path_text = (raw_path or "").strip()
            if not path_text:
                continue
            path = CliPathUtils.expand_lexical(path_text)
            if path not in result:
                result.append(path)
        return result

    async def _build_list_item(self, item: CliRegistryItem, validate: bool) -> CliListItem:
        """构建列表接口返回的确定字段结构。"""
        item_view: CliListItem = {
            "name": item.name,
            "commands": list(item.commands),
            "install_strategy": item.install_strategy,
            "package_manager": item.package_manager,
            "version": item.version,
            "app_dir": item.app_dir,
            "bin_dir": item.bin_dir,
            "command_targets": dict(item.command_targets),
            "app_links": [link.to_dict() for link in item.app_links],
            "config_dirs": [mapping.to_dict() for mapping in item.config_dirs],
            "env_keys": list(item.env_keys),
            "platform": dict(item.platform),
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "status": item.status,
            "missing_env_keys": [key for key in item.env_keys if key not in os.environ],
        }
        if validate:
            item_view["validation"] = await self._filesystem.validate_item(item)
        return item_view

    @staticmethod
    def _truncate(text: str, limit: int = 4000) -> str:
        """截断面向模型返回的命令输出。"""
        if len(text) <= limit:
            return text
        return text[: limit // 2] + "\n... truncated ...\n" + text[-limit // 2 :]

    @staticmethod
    def _redact_command(command: str) -> str:
        """从命令字符串中脱敏疑似密钥内容。"""
        return re.sub(
            r"(?i)\b(token|secret|password|api[_-]?key|authorization)(\s*(?:=|:)\s*)\S+",
            r"\1\2***",
            command,
        )
