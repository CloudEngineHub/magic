"""CLI 管理器请求校验与冲突策略。"""

from __future__ import annotations

import os
from pathlib import Path

from app.service.cli_manager.constants import NAME_PATTERN, PROTECTED_COMMAND_NAMES
from app.service.cli_manager.models import CliManagerError, CliManagerPaths, CliRegistryData, CliRegistryItem
from app.service.cli_manager.path_utils import CliPathUtils
from app.service.runtime_cli_catalog import RUNTIME_MANAGED_CLI_COMMANDS
from app.utils.async_file_utils import async_which


class CliRequestValidator:
    """校验 CLI 管理器名称、请求字段和命令冲突。"""

    def __init__(self, paths: CliManagerPaths) -> None:
        """创建绑定到指定路径布局的请求校验器。"""
        self._paths = paths

    def validate_name(self, value: str, field_name: str) -> str:
        """校验注册表名称或命令名称。"""
        normalized = (value or "").strip()
        if not normalized:
            raise CliManagerError("invalid_name", f"{field_name} cannot be empty.", field=field_name)
        if not NAME_PATTERN.match(normalized) or "/" in normalized or "\\" in normalized or ".." in normalized:
            raise CliManagerError("invalid_name", f"Invalid {field_name}: {value}", field=field_name, value=value)
        return normalized

    def normalize_commands(self, commands: list[str]) -> list[str]:
        """校验并规范化命令名称。"""
        normalized = []
        for command in commands:
            command_name = self.validate_name(command, "command")
            if command_name in PROTECTED_COMMAND_NAMES:
                raise CliManagerError(
                    "command_name_reserved",
                    f"Command name is reserved: {command_name}",
                    command=command_name,
                )
            if command_name not in normalized:
                normalized.append(command_name)
        if not normalized:
            raise CliManagerError("command_required", "At least one command is required.")
        return normalized

    @staticmethod
    def ensure_user_managed_scope(name: str, commands: list[str]) -> None:
        """拒绝通过用户持久化流程接管运行时预置 CLI。"""
        for candidate in [name, *commands]:
            if candidate not in RUNTIME_MANAGED_CLI_COMMANDS:
                continue
            raise CliManagerError(
                "runtime_managed_cli",
                f"CLI is provided by the Super Magic runtime and must not be persisted: {candidate}",
                name=name,
                command=candidate,
                management_scope="runtime",
            )

    @staticmethod
    def normalize_env_keys(env_keys: list[str]) -> list[str]:
        """规范化环境变量名称，不存储变量值。"""
        result: list[str] = []
        for key in env_keys:
            normalized = (key or "").strip()
            if normalized and normalized not in result:
                result.append(normalized)
        return result

    @staticmethod
    def normalize_config_dirs(config_dirs: list[str]) -> list[str]:
        """规范化配置目录字符串，同时保留用户输入意图。"""
        result: list[str] = []
        for path in config_dirs:
            normalized = (path or "").strip()
            if normalized and normalized not in result:
                result.append(normalized)
        return result

    def ensure_registry_commands_available(self, name: str, commands: list[str], registry: CliRegistryData) -> None:
        """检查命令名是否与现有持久化 CLI 冲突。"""
        for data in registry["items"]:
            item = CliRegistryItem.from_dict(data)
            for command in commands:
                if command in item.commands and item.name != name:
                    raise CliManagerError(
                        "command_name_conflict",
                        f"Command is already owned by another persisted CLI: {command}",
                        conflict_type="persisted_cli",
                        command=command,
                        existing_owner=item.name,
                        existing_path=str(self._paths.bin_dir / command),
                        requested_name=name,
                        requested_path=str(self._paths.bin_dir / command),
                        resolution_options=["rename_command", "remove_existing", "cancel"],
                    )

    async def ensure_commands_do_not_shadow_path(self, commands: list[str]) -> None:
        """检查安装模式是否会遮蔽 PATH 中已有的非持久化命令。"""
        for command in commands:
            found = await async_which(command, path=os.environ.get("PATH", ""))
            if not found:
                continue
            existing_path = Path(found).resolve(strict=False)
            if CliPathUtils.is_under(existing_path, self._paths.root_dir):
                continue
            raise CliManagerError(
                "command_path_conflict",
                f"Command already exists on PATH: {command}",
                conflict_type="path_command",
                command=command,
                existing_path=str(existing_path),
                requested_path=str(self._paths.bin_dir / command),
                resolution_options=["adopt_existing", "rename_command", "cancel"],
            )

    async def ensure_command_targets_are_not_shadowed(self, command_targets: dict[str, Path]) -> None:
        """检查最终命令目标是否会被当前 PATH 中的非托管命令遮蔽。"""
        for command, target in command_targets.items():
            found = await async_which(command, path=os.environ.get("PATH", ""))
            if not found:
                continue
            existing_path = Path(found).resolve(strict=False)
            target_path = target.resolve(strict=False)
            if existing_path == target_path or CliPathUtils.is_under(existing_path, self._paths.root_dir):
                continue
            raise CliManagerError(
                "command_path_conflict",
                f"Command already exists on PATH and would shadow the persisted entry: {command}",
                conflict_type="path_command_shadow",
                command=command,
                existing_path=str(existing_path),
                selected_target=str(target_path),
                requested_path=str(self._paths.bin_dir / command),
                resolution_options=["adopt_existing", "remove_existing_path", "rename_command", "cancel"],
            )
