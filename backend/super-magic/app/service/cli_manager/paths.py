"""CLI 管理器持久化布局的路径解析。"""

from __future__ import annotations

import os

from app.path_manager import PathManager
from app.service.cli_manager.models import CliManagerPaths


class CliManagerPathResolver:
    """解析默认路径，并负责运行时注入持久化 CLI PATH。"""

    @staticmethod
    def default_paths() -> CliManagerPaths:
        """从 PathManager 构建默认持久化布局。"""
        root_dir = PathManager.get_cli_manager_dir()
        return CliManagerPaths(
            root_dir=root_dir,
            bin_dir=PathManager.get_cli_manager_bin_dir(),
            apps_dir=root_dir / "apps",
            prefixes_dir=root_dir / "prefixes",
            state_dir=root_dir / "state",
            registry_file=PathManager.get_cli_manager_registry_file(),
        )

    @staticmethod
    def build_path_prefix() -> str:
        """返回需要追加到 PATH 前缀的持久化 CLI bin 目录。"""
        return str(PathManager.get_cli_manager_bin_dir())

    @classmethod
    def apply_path_to_env(cls, env_vars: dict[str, str]) -> None:
        """将持久化 CLI bin 目录追加到环境变量 PATH 前面。"""
        bin_dir = cls.build_path_prefix()
        current_path = env_vars.get("PATH", os.environ.get("PATH", ""))
        parts = [part for part in current_path.split(os.pathsep) if part]
        if bin_dir not in parts:
            env_vars["PATH"] = os.pathsep.join([bin_dir, *parts]) if parts else bin_dir
        else:
            env_vars["PATH"] = current_path
