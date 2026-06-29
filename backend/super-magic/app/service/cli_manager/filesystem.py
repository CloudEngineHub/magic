"""CLI 包、命令 shim 和配置软链的文件系统持久化。"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import time
from pathlib import Path

from agentlang.logger import get_logger
from app.service.cli_manager.constants import DEFAULT_TIMEOUT_SECONDS, MAX_APP_FILES, MAX_APP_SIZE_BYTES
from app.service.cli_manager.installer import CliInstaller
from app.service.cli_manager.models import (
    CliCommandValidation,
    CliConfigDir,
    CliManagerError,
    CliManagerPaths,
    CliPathLink,
    CliRegistryItem,
    CliValidationResult,
)
from app.service.cli_manager.path_utils import CliPathUtils
from app.utils.async_file_utils import (
    async_access,
    async_copy2,
    async_copytree,
    async_exists,
    async_is_dir,
    async_is_file,
    async_is_symlink,
    async_mkdir,
    async_read_bytes,
    async_readlink,
    async_rename,
    async_rmtree,
    async_scandir,
    async_stat,
    async_symlink,
    async_unlink,
    async_which,
    async_write_text,
)

logger = get_logger(__name__)


class CliFilesystemPersistence:
    """持久化 CLI 包根目录、配置目录和命令 shim。"""

    _STANDALONE_PROBE_ARGS = ("--version", "--help")
    _STANDALONE_PROBE_TIMEOUT_SECONDS = min(10, DEFAULT_TIMEOUT_SECONDS)
    _SENSITIVE_ENV_PATTERN = re.compile(r"(TOKEN|SECRET|PASSWORD|API[_-]?KEY|AUTH)", re.IGNORECASE)

    def __init__(self, paths: CliManagerPaths, installer: CliInstaller) -> None:
        """创建绑定到路径布局和安装器查找能力的文件系统持久化助手。"""
        self._paths = paths
        self._installer = installer

    async def prepare_app_dir(self, name: str, command_targets: dict[str, Path]) -> tuple[Path, dict[str, Path], list[CliPathLink]]:
        """通过分阶段复制包并在原位置创建软链来准备持久化应用目录。"""
        if command_targets and all(CliPathUtils.is_lexically_under(path, self._paths.root_dir) for path in command_targets.values()):
            common_root = await self._common_existing_root([self.infer_install_root(path) for path in command_targets.values()])
            return common_root if common_root else self._paths.root_dir, command_targets, []

        install_id = str(int(time.time()))
        app_dir = self._paths.apps_dir / name / install_id
        if await async_exists(app_dir):
            await async_rmtree(app_dir)
        await async_mkdir(app_dir, parents=True, exist_ok=True)
        bin_dir = app_dir / "bin"
        await async_mkdir(bin_dir, parents=True, exist_ok=True)

        moved_roots: dict[Path, Path] = {}
        app_links: list[CliPathLink] = []
        updated_targets: dict[str, Path] = {}
        for command, target in command_targets.items():
            root = self.infer_install_root(target)
            standalone_target = await self._try_persist_restricted_standalone_command(command, root, target, bin_dir)
            if standalone_target:
                moved_roots[target] = standalone_target
                app_links.append(CliPathLink(source=str(target), target=str(standalone_target)))
                updated_targets[command] = standalone_target
                continue
            await self.ensure_move_link_allowed(root, target, command)
            if root in moved_roots:
                dest = moved_roots[root]
                updated_targets[command] = dest / target.relative_to(root)
                continue
            if CliPathUtils.is_lexically_under(root, app_dir):
                updated_targets[command] = target
                continue
            dest = await self.build_unique_app_dest(app_dir, root)
            if await async_is_dir(root):
                relative_target = target.relative_to(root)
                await self._persist_path_with_staging(root, dest, target_is_directory=True)
                moved_roots[root] = dest
                app_links.append(CliPathLink(source=str(root), target=str(dest)))
                updated_targets[command] = dest / relative_target
            else:
                dest = bin_dir / command
                await self._persist_path_with_staging(root, dest, target_is_directory=False)
                await CliPathUtils.make_executable(dest)
                moved_roots[root] = dest
                app_links.append(CliPathLink(source=str(root), target=str(dest)))
                updated_targets[command] = dest

        return app_dir, updated_targets, app_links

    async def prepare_config_dirs(self, name: str, config_dirs: list[str]) -> list[CliConfigDir]:
        """将用户指定的配置目录持久化到状态目录并创建软链。"""
        mappings: list[CliConfigDir] = []
        for raw_source in config_dirs:
            source = CliPathUtils.expand_lexical(raw_source)
            if source == Path.home() or not CliPathUtils.is_under(source, Path.home()):
                raise CliManagerError(
                    "config_dir_not_allowed",
                    "Config directories must be under the current HOME.",
                    source=str(source),
                )
            if CliPathUtils.is_under(source, Path.home() / ".magic"):
                raise CliManagerError(
                    "config_dir_already_persistent",
                    "Config directory is already under ~/.magic and does not need linking.",
                    source=str(source),
            )
            relative = source.relative_to(Path.home())
            target = self._paths.state_dir / name / "home" / relative
            await async_mkdir(target.parent, parents=True, exist_ok=True)
            if await async_is_symlink(source) and source.resolve(strict=False) == target.resolve(strict=False):
                mappings.append(CliConfigDir(source=str(source), target=str(target)))
                continue
            if await async_exists(source) and not await async_exists(target):
                await self._copy_path_to_target_with_staging(source, target)
            elif not await async_exists(target):
                await async_mkdir(target, parents=True, exist_ok=True)

            if await async_exists(source) or await async_is_symlink(source):
                await self._replace_source_with_link(source, target)
            else:
                await async_mkdir(source.parent, parents=True, exist_ok=True)
                await async_symlink(target, source)
            mappings.append(CliConfigDir(source=str(source), target=str(target)))
        return mappings

    async def restore_item(self, item: CliRegistryItem, command_targets: dict[str, Path] | None = None) -> None:
        """根据注册表记录恢复命令 shim 和配置目录软链。"""
        await async_mkdir(self._paths.bin_dir, parents=True, exist_ok=True)
        targets = command_targets or {
            command: await self.resolve_command_target_from_item(item, command)
            for command in item.commands
        }
        for link in item.app_links:
            await self.restore_path_link(link)
        for command, target in targets.items():
            if not await async_exists(target) and not await async_is_symlink(target):
                continue
            await self.write_shim(command, target)
        for mapping in item.config_dirs:
            await self.restore_config_link(mapping)

    async def restore_path_link(self, link: CliPathLink) -> None:
        """恢复指向持久化存储的包路径软链。"""
        source = CliPathUtils.expand_lexical(link.source)
        target = CliPathUtils.expand(link.target)
        if not await async_exists(target) and not await async_is_symlink(target):
            raise CliManagerError(
                "app_link_target_missing",
                "Persisted CLI package target is missing.",
                source=str(source),
                target=str(target),
            )
        if await async_is_symlink(source) and source.resolve(strict=False) == target.resolve(strict=False):
            return
        if await async_exists(source) or await async_is_symlink(source):
            raise CliManagerError(
                "app_link_source_conflict",
                "Cannot restore CLI package symlink because source path already exists.",
                source=str(source),
                target=str(target),
                resolution_options=["remove_source", "cancel"],
            )
        await async_mkdir(source.parent, parents=True, exist_ok=True)
        await async_symlink(target, source, target_is_directory=await async_is_dir(target))

    async def restore_config_link(self, mapping: CliConfigDir) -> None:
        """恢复一个持久化配置目录软链。"""
        source = CliPathUtils.expand_lexical(mapping.source)
        target = CliPathUtils.expand(mapping.target)
        await async_mkdir(target, parents=True, exist_ok=True)
        if await async_is_symlink(source) and source.resolve(strict=False) == target.resolve(strict=False):
            return
        if await async_exists(source) or await async_is_symlink(source):
            if await async_is_dir(source) and not await async_is_symlink(source):
                await async_rmtree(source)
            else:
                await async_unlink(source)
        await async_mkdir(source.parent, parents=True, exist_ok=True)
        await async_symlink(target, source)

    async def remove_files(self, item: CliRegistryItem, remove_state: bool) -> list[str]:
        """移除单个 CLI 由本服务管理的 shim、应用载荷和可选状态。"""
        removed_paths: list[str] = []
        for command in item.commands:
            shim_path = self._paths.bin_dir / command
            if await async_exists(shim_path) or await async_is_symlink(shim_path):
                await async_unlink(shim_path)
                removed_paths.append(str(shim_path))

        for link in item.app_links:
            source = CliPathUtils.expand_lexical(link.source)
            target = CliPathUtils.expand(link.target)
            if await async_is_symlink(source) and source.resolve(strict=False) == target.resolve(strict=False):
                await async_unlink(source)
                removed_paths.append(str(source))

        app_dir = CliPathUtils.expand(item.app_dir)
        if CliPathUtils.is_under(app_dir, self._paths.apps_dir) and await async_exists(app_dir):
            if await async_is_dir(app_dir) and not await async_is_symlink(app_dir):
                await async_rmtree(app_dir)
            else:
                await async_unlink(app_dir)
            removed_paths.append(str(app_dir))

        if remove_state:
            state_path = self._paths.state_dir / item.name
            if await async_exists(state_path):
                await async_rmtree(state_path)
                removed_paths.append(str(state_path))
        return removed_paths

    async def write_shim(self, command: str, target: Path) -> None:
        """为已持久化命令创建稳定的 shell shim。"""
        await async_mkdir(self._paths.bin_dir, parents=True, exist_ok=True)
        shim_path = self._paths.bin_dir / command
        shim_content = "#!/usr/bin/env bash\n" f"exec {CliPathUtils.quote(target)} \"$@\"\n"
        await async_write_text(shim_path, shim_content, encoding="utf-8")
        await CliPathUtils.make_executable(shim_path)

    async def validate_item(self, item: CliRegistryItem) -> CliValidationResult:
        """校验注册表记录中的 shim 和目标命令是否存在。"""
        command_results: list[CliCommandValidation] = []
        ok = True
        for command in item.commands:
            shim_path = self._paths.bin_dir / command
            target = await self.resolve_command_target_from_item(item, command)
            command_ok = (
                await async_exists(shim_path)
                and await async_access(shim_path, os.X_OK)
                and await async_exists(target)
                and await async_access(target, os.X_OK)
            )
            if not command_ok:
                ok = False
            command_results.append(
                {
                    "command": command,
                    "shim_path": str(shim_path),
                    "target": str(target),
                    "ok": command_ok,
                }
            )
        return {"ok": ok, "commands": command_results}

    async def resolve_command_target_from_item(self, item: CliRegistryItem, command: str) -> Path:
        """解析某个命令的持久化目标可执行文件。"""
        registered_target = item.command_targets.get(command)
        if registered_target:
            target = CliPathUtils.expand(registered_target)
            if CliPathUtils.is_lexically_under(target, self._paths.root_dir):
                return target
            if (await async_exists(target) or await async_is_symlink(target)) and CliPathUtils.is_under(target, self._paths.root_dir):
                return target.resolve(strict=False)
            recovered_target = await self._find_persisted_command_candidate(item.name, command)
            if recovered_target:
                return recovered_target
            return target
        app_dir = CliPathUtils.expand(item.app_dir)
        direct = app_dir / "bin" / command
        if await async_exists(direct) or await async_is_symlink(direct):
            return direct.resolve(strict=False)
        prefix_candidate = await async_which(command, path=os.pathsep.join(self._installer.prefix_bin_paths()))
        if prefix_candidate:
            return Path(prefix_candidate).resolve(strict=False)
        return direct

    async def _find_persisted_command_candidate(self, name: str, command: str) -> Path | None:
        """从已复制的持久应用目录中查找可用于修复旧记录的命令目标。"""
        base_dir = self._paths.apps_dir / name
        if not await async_exists(base_dir):
            return None
        candidates: list[tuple[int, Path]] = []
        for entry in await async_scandir(base_dir):
            candidate = Path(entry.path) / "bin" / command
            if not await async_exists(candidate) and not await async_is_symlink(candidate):
                continue
            if not await async_access(candidate, os.X_OK):
                continue
            candidates.append(((await async_stat(candidate)).st_mtime_ns, candidate))
        if not candidates:
            return None
        return max(candidates, key=lambda item: item[0])[1]

    async def check_app_size(self, app_dir: Path) -> None:
        """对持久化应用目录执行保守的大小和文件数量限制。"""
        total_size = 0
        total_files = 0
        if not await async_exists(app_dir):
            return
        for path in await self._iter_files(app_dir):
            if await async_is_file(path):
                total_files += 1
                total_size += (await async_stat(path)).st_size
        if total_size > MAX_APP_SIZE_BYTES or total_files > MAX_APP_FILES:
            raise CliManagerError(
                "size_limit_exceeded",
                "Persisted CLI exceeds size or file-count limits.",
                total_size=total_size,
                total_files=total_files,
            )

    async def _persist_path_with_staging(self, source: Path, target: Path, *, target_is_directory: bool) -> None:
        """先复制到持久化临时目录，再用备份替换原路径为软链。"""
        try:
            await self._copy_path_to_target_with_staging(source, target)
            await self._replace_source_with_link(source, target, target_is_directory=target_is_directory)
        except Exception:
            if await async_exists(target) or await async_is_symlink(target):
                await self._remove_path(target)
            raise

    async def _copy_path_to_target_with_staging(self, source: Path, target: Path) -> None:
        """通过同目录 staging 复制路径，成功后原子切换为最终目标。"""
        staging = self._build_staging_path(target)
        if await async_exists(staging) or await async_is_symlink(staging):
            await self._remove_path(staging)
        if await async_exists(target) or await async_is_symlink(target):
            raise CliManagerError(
                "target_path_conflict",
                "Cannot persist CLI path because target path already exists.",
                source=str(source),
                target=str(target),
            )

        await async_mkdir(target.parent, parents=True, exist_ok=True)
        try:
            if await async_is_dir(source) and not await async_is_symlink(source):
                await async_copytree(source, staging, symlinks=True)
            else:
                await async_copy2(source, staging)
            await async_rename(staging, target)
        except Exception:
            if await async_exists(staging) or await async_is_symlink(staging):
                await self._remove_path(staging)
            raise

    async def _replace_source_with_link(self, source: Path, target: Path, *, target_is_directory: bool | None = None) -> None:
        """将原路径复制备份后替换为指向持久化目标的软链，失败时恢复备份。"""
        backup = self._build_backup_path(source)
        if await async_exists(backup) or await async_is_symlink(backup):
            await self._remove_path(backup)
        if not await async_exists(source) and not await async_is_symlink(source):
            await async_mkdir(source.parent, parents=True, exist_ok=True)
            await async_symlink(target, source, target_is_directory=await self._resolve_link_directory_flag(target, target_is_directory))
            return

        await self._copy_source_to_backup(source, backup)
        await self._remove_path(source)
        try:
            await async_symlink(target, source, target_is_directory=await self._resolve_link_directory_flag(target, target_is_directory))
        except Exception:
            if not await async_exists(source) and not await async_is_symlink(source):
                await self._restore_backup_to_source(backup, source)
            raise

        try:
            await self._remove_path(backup)
        except Exception as exc:
            logger.warning("清理 CLI 原路径备份失败，保留备份文件: %s, error=%s", backup, exc)

    async def _copy_source_to_backup(self, source: Path, backup: Path) -> None:
        """复制源路径为备份，保留文件、目录和软链形态。"""
        await async_mkdir(backup.parent, parents=True, exist_ok=True)
        if await async_is_symlink(source):
            await async_symlink(await async_readlink(source), backup)
            return
        if await async_is_dir(source):
            await async_copytree(source, backup, symlinks=True)
            return
        await async_copy2(source, backup)

    async def _restore_backup_to_source(self, backup: Path, source: Path) -> None:
        """从复制备份恢复源路径，并删除备份。"""
        await async_mkdir(source.parent, parents=True, exist_ok=True)
        if await async_is_symlink(backup):
            await async_symlink(await async_readlink(backup), source)
            await async_unlink(backup)
            return
        if await async_is_dir(backup):
            await async_copytree(backup, source, symlinks=True)
            await async_rmtree(backup)
            return
        await async_copy2(backup, source)
        await async_unlink(backup)

    async def _resolve_link_directory_flag(self, target: Path, target_is_directory: bool | None) -> bool:
        """解析创建软链时是否应声明目标为目录。"""
        if target_is_directory is not None:
            return target_is_directory
        return await async_is_dir(target)

    @staticmethod
    def _build_staging_path(target: Path) -> Path:
        """为持久化目标生成同目录临时复制路径。"""
        return target.parent / f".{target.name}.staging-{time.time_ns()}"

    @staticmethod
    def _build_backup_path(source: Path) -> Path:
        """为原路径生成同目录备份路径，便于软链失败时回滚。"""
        return source.parent / f".{source.name}.cli-manager-backup-{time.time_ns()}"

    @staticmethod
    async def _remove_path(path: Path) -> None:
        """删除文件、软链或目录。"""
        if await async_is_dir(path) and not await async_is_symlink(path):
            await async_rmtree(path)
        else:
            await async_unlink(path)

    async def _try_persist_restricted_standalone_command(
        self,
        command: str,
        root: Path,
        target: Path,
        bin_dir: Path,
    ) -> Path | None:
        """对宽泛安装根目录中的单文件命令执行隔离探测并尝试接管。"""
        if not self._is_restricted_install_root(root):
            return None
        if not await self._standalone_probe_passes(command, target):
            return None

        dest = bin_dir / command
        await self._persist_path_with_staging(target, dest, target_is_directory=False)
        await CliPathUtils.make_executable(dest)
        return dest

    def _is_restricted_install_root(self, root: Path) -> bool:
        """判断安装根目录是否过宽，不能整体迁移。"""
        root = root.resolve(strict=False)
        return (
            CliPathUtils.is_system_path(root)
            or root == Path.home()
            or root == Path.home() / ".local"
            or root in self._protected_home_roots()
        )

    async def _standalone_probe_passes(self, command: str, target: Path) -> bool:
        """复制命令到隔离探测目录并运行低风险启动参数。"""
        if await async_is_dir(target) and not await async_is_symlink(target):
            return False
        if not await async_exists(target) and not await async_is_symlink(target):
            return False
        if await self._looks_like_external_runtime_wrapper(target):
            return False

        probe_dir = self._paths.root_dir / ".probe" / f"{command}-{time.time_ns()}"
        probe_bin = probe_dir / "bin" / command
        try:
            await async_mkdir(probe_bin.parent, parents=True, exist_ok=True)
            await async_copy2(target, probe_bin)
            await CliPathUtils.make_executable(probe_bin)
            env = await self._build_standalone_probe_env(probe_dir)
            for arg in self._STANDALONE_PROBE_ARGS:
                if await self._run_standalone_probe(probe_bin, arg, probe_dir, env):
                    return True
            return False
        finally:
            if await async_exists(probe_dir):
                await async_rmtree(probe_dir)

    async def _build_standalone_probe_env(self, probe_dir: Path) -> dict[str, str]:
        """构建隔离探测环境，避免复用用户目录和敏感凭证。"""
        probe_home = probe_dir / "home"
        await async_mkdir(probe_home, parents=True, exist_ok=True)
        env = {
            key: value
            for key, value in os.environ.items()
            if not self._SENSITIVE_ENV_PATTERN.search(key)
        }
        env["HOME"] = str(probe_home)
        env["PATH"] = self._build_probe_path(env.get("PATH", ""))
        env["PYTHONNOUSERSITE"] = "1"
        env["PYTHONPATH"] = ""
        env["NODE_PATH"] = ""
        return env

    @staticmethod
    def _build_probe_path(current_path: str) -> str:
        """为单文件探测补齐基础系统 PATH。"""
        paths = [path for path in current_path.split(os.pathsep) if path]
        for path in ("/usr/local/bin", "/usr/bin", "/bin"):
            if path not in paths:
                paths.append(path)
        return os.pathsep.join(paths)

    async def _run_standalone_probe(self, executable: Path, arg: str, cwd: Path, env: dict[str, str]) -> bool:
        """运行一次单文件命令探测，超时或非零退出都视为失败。"""
        try:
            process = await asyncio.create_subprocess_exec(
                str(executable),
                arg,
                cwd=str(cwd),
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError:
            return False
        try:
            await asyncio.wait_for(process.communicate(), timeout=self._STANDALONE_PROBE_TIMEOUT_SECONDS)
        except TimeoutError:
            process.kill()
            with contextlib.suppress(Exception):
                await process.communicate()
            return False
        except Exception:
            return False
        return process.returncode == 0

    async def _looks_like_external_runtime_wrapper(self, target: Path) -> bool:
        """识别依赖外部包目录的脚本入口，避免误当成单文件命令。"""
        try:
            text = (await async_read_bytes(target, size=4096)).decode("utf-8", errors="ignore")
        except Exception:
            return False
        lines = text.splitlines()
        if not lines or not lines[0].startswith("#!"):
            return False
        shebang = lines[0].lower()
        if "python" in shebang:
            return any(
                marker in text
                for marker in (
                    "pkg_resources",
                    "load_entry_point(",
                    "importlib.metadata",
                    "__requires__",
                )
            ) or bool(re.search(r"(?m)^\s*from\s+[A-Za-z_][\w.]*\s+import\s+", text))
        if "node" in shebang:
            return "require(" in text or "import " in text
        if any(runtime in shebang for runtime in ("ruby", "perl")):
            return bool(re.search(r"(?m)^\s*(require|use)\s+", text))
        return False

    def infer_install_root(self, target: Path) -> Path:
        """根据命令目标路径推断用户级安装根目录。"""
        parts = target.parts
        if "node_modules" in parts:
            index = parts.index("node_modules")
            if index + 1 < len(parts):
                package_end = index + 2
                if parts[index + 1].startswith("@") and index + 2 < len(parts):
                    package_end = index + 3
                return Path(*parts[:package_end])
        if target.parent.name == "bin":
            return target.parent.parent
        return target.parent

    async def ensure_move_link_allowed(self, root: Path, target: Path, command: str) -> None:
        """拒绝对不安全或过宽泛安装根目录执行移动软链策略。"""
        root = root.resolve(strict=False)
        if not await async_exists(root):
            raise CliManagerError(
                "cannot_locate_install_root",
                f"Cannot locate install root for command: {command}",
                command=command,
                existing_path=str(target),
                inferred_root=str(root),
            )
        if CliPathUtils.is_under(root, self._paths.root_dir):
            return
        if CliPathUtils.is_system_path(root) or root == Path.home() or root == Path.home() / ".local":
            raise CliManagerError(
                "cannot_move_install_root",
                f"Refusing to move broad or system install root for command: {command}",
                command=command,
                existing_path=str(target),
                inferred_root=str(root),
                suggested_prefix_bin_dir=str(self._paths.prefixes_dir / command / "bin"),
                resolution_options=["install_with_prefix", "rename_command", "cancel"],
            )
        if root in self._protected_home_roots():
            raise CliManagerError(
                "cannot_move_install_root",
                f"Refusing to move shared package-manager root for command: {command}",
                command=command,
                existing_path=str(target),
                inferred_root=str(root),
                suggested_prefix_bin_dir=str(self._paths.prefixes_dir / command / "bin"),
                resolution_options=["install_with_prefix", "rename_command", "cancel"],
            )

    @staticmethod
    def _protected_home_roots() -> set[Path]:
        """返回不能整体迁移的用户级共享包管理目录。"""
        return {Path.home() / ".cargo", Path.home() / ".npm", Path.home() / ".cache"}

    @staticmethod
    async def build_unique_app_dest(app_dir: Path, root: Path) -> Path:
        """为被移动的安装根目录生成不冲突的目标路径。"""
        dest = app_dir / root.name
        if not await async_exists(dest):
            return dest
        index = 2
        while True:
            candidate = app_dir / f"{root.name}-{index}"
            if not await async_exists(candidate):
                return candidate
            index += 1

    @staticmethod
    async def _common_existing_root(paths: list[Path]) -> Path | None:
        """查找已在持久化目录下的路径公共根目录。"""
        if not paths:
            return None
        common = Path(os.path.commonpath([str(path) for path in paths]))
        if await async_exists(common) and await async_is_file(common):
            return common.parent
        if common.name == "bin":
            return common.parent
        return common if await async_exists(common) else common.parent

    async def _iter_files(self, root: Path) -> list[Path]:
        """递归收集目录下的文件路径。"""
        result: list[Path] = []
        entries = await async_scandir(root)
        for entry in entries:
            path = Path(entry.path)
            if await async_is_dir(path) and not await async_is_symlink(path):
                result.extend(await self._iter_files(path))
            elif await async_is_file(path):
                result.append(path)
        return result
