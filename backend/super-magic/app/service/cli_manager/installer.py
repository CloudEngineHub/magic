"""持久化第三方 CLI 的安装命令处理。"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Callable

from app.service.cli_manager.constants import CLI_PREFIX_BIN_RELATIVE_PATHS, DEFAULT_TIMEOUT_SECONDS
from app.service.cli_manager.models import CliManagerError, CliManagerPaths, CommandRunResult
from app.service.cli_manager.path_utils import CliPathUtils
from app.service.cli_manager.paths import CliManagerPathResolver
from app.utils.async_file_utils import async_exists, async_is_symlink, async_which


class CliInstaller:
    """负责检测、改写、执行和解析 CLI 安装命令。"""

    def __init__(
        self,
        paths: CliManagerPaths,
        command_runner: Callable[[str, Path, dict[str, str], int], CommandRunResult] | None = None,
    ) -> None:
        """创建绑定到指定路径布局的安装器，并支持注入命令执行器。"""
        self._paths = paths
        self._command_runner = command_runner or self.run_command

    def detect_strategy(self, install_command: str, preferred_strategy: str) -> str:
        """根据安装命令检测包管理器策略。"""
        if preferred_strategy and preferred_strategy != "auto":
            return preferred_strategy
        stripped = install_command.strip()
        if stripped.startswith("npm ") and " install " in f" {stripped} " and " -g" in f" {stripped} ":
            return "npm"
        if stripped.startswith("pipx install "):
            return "pipx"
        if stripped.startswith("uv tool install "):
            return "uv"
        if stripped.startswith("go install "):
            return "go"
        if stripped.startswith("cargo install "):
            return "cargo"
        return "shell"

    def rewrite_install_command(self, install_command: str, strategy: str) -> str:
        """将支持的安装命令改写为使用持久化 prefix。"""
        command = install_command.strip()
        if strategy == "npm" and "--prefix" not in command:
            return f"{command} --prefix {CliPathUtils.quote(self._paths.prefixes_dir / 'node')}"
        if strategy == "cargo" and "--root" not in command:
            return f"{command} --root {CliPathUtils.quote(self._paths.prefixes_dir / 'cargo')}"
        return command

    async def run_install(self, command: str) -> CommandRunResult:
        """在持久化根目录中执行安装命令。"""
        import asyncio

        return await asyncio.to_thread(
            self._command_runner,
            command,
            self._paths.root_dir,
            self.build_install_env(),
            DEFAULT_TIMEOUT_SECONDS,
        )

    def build_install_env(self) -> dict[str, str]:
        """构建指向持久化 prefix 的安装环境变量。"""
        env = dict(os.environ)
        env["PIPX_HOME"] = str(self._paths.prefixes_dir / "pipx" / "home")
        env["PIPX_BIN_DIR"] = str(self._paths.prefixes_dir / "pipx" / "bin")
        env["UV_TOOL_DIR"] = str(self._paths.prefixes_dir / "uv" / "tools")
        env["UV_TOOL_BIN_DIR"] = str(self._paths.prefixes_dir / "uv" / "bin")
        env["GOBIN"] = str(self._paths.prefixes_dir / "go" / "bin")
        CliManagerPathResolver.apply_path_to_env(env)
        env["PATH"] = os.pathsep.join([*self.prefix_bin_paths(), env.get("PATH", "")])
        return env

    def prefix_bin_paths(self, extra_bin_dirs: list[Path] | None = None) -> list[str]:
        """返回已知包管理器的持久化 bin 目录。"""
        paths = [str(self._paths.root_dir / relative) for relative in CLI_PREFIX_BIN_RELATIVE_PATHS]
        for path in extra_bin_dirs or []:
            normalized = str(path)
            if normalized not in paths:
                paths.append(normalized)
        return paths

    async def resolve_command_targets(
        self,
        commands: list[str],
        *,
        command_paths: dict[str, Path] | None = None,
        extra_bin_dirs: list[Path] | None = None,
    ) -> dict[str, Path]:
        """使用包含持久化目录的 PATH 查找命令入口。"""
        env_path = os.pathsep.join(
            [str(self._paths.bin_dir), *self.prefix_bin_paths(extra_bin_dirs), os.environ.get("PATH", "")]
        )
        targets: dict[str, Path] = {}
        for command in commands:
            target = await self._resolve_explicit_command_path(command, command_paths or {})
            if target is None:
                found = await async_which(command, path=env_path)
                if not found:
                    searched_paths = [path for path in env_path.split(os.pathsep) if path]
                    raise CliManagerError(
                        "command_not_found_after_install",
                        f"Command was not found after install: {command}",
                        command=command,
                        searched_paths=searched_paths,
                    )
                target = Path(found).absolute()
            if CliPathUtils.is_under(target, self._paths.bin_dir):
                raise CliManagerError(
                    "command_name_conflict",
                    f"Command already resolves to persistent shim: {command}",
                    conflict_type="persistent_shim",
                    command=command,
                    existing_path=str(target),
                    requested_path=str(target),
                    resolution_options=["remove_existing", "cancel"],
                )
            targets[command] = target
        return targets

    async def _resolve_explicit_command_path(self, command: str, command_paths: dict[str, Path]) -> Path | None:
        """优先解析调用方明确指定的命令路径。"""
        target = command_paths.get(command)
        if target is None:
            return None
        if not await async_exists(target) and not await async_is_symlink(target):
            raise CliManagerError(
                "command_path_missing",
                f"Explicit command path does not exist: {command}",
                command=command,
                command_path=str(target),
            )
        return target.absolute()

    @staticmethod
    def run_command(command: str, cwd: Path, env: dict[str, str], timeout: int) -> CommandRunResult:
        """在子进程中执行安装命令。"""
        process = subprocess.run(
            command,
            cwd=str(cwd),
            env=env,
            shell=True,
            executable="/bin/bash",
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return CommandRunResult(exit_code=process.returncode, stdout=process.stdout, stderr=process.stderr)
