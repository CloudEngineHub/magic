"""CLI 管理器共享的文件系统路径工具。"""

from __future__ import annotations

import os
import shlex
import stat
from pathlib import Path

from app.service.cli_manager.constants import SYSTEM_ROOTS
from app.utils.async_file_utils import async_chmod, async_read_bytes, async_stat


class CliPathUtils:
    """提供安全的路径规范化和文件系统辅助方法。"""

    @staticmethod
    def expand(value: str) -> Path:
        """展开文件路径中的用户目录和环境变量。"""
        return Path(os.path.expandvars(os.path.expanduser(value))).resolve(strict=False)

    @staticmethod
    def expand_lexical(value: str) -> Path:
        """展开路径字符串但保留软链本身，不解析到真实目标。"""
        return Path(os.path.expandvars(os.path.expanduser(value))).absolute()

    @staticmethod
    def is_under(path: Path, root: Path) -> bool:
        """返回解析后的 path 是否位于 root 目录下。"""
        try:
            path.resolve(strict=False).relative_to(root.resolve(strict=False))
            return True
        except ValueError:
            return False

    @staticmethod
    def is_lexically_under(path: Path, root: Path) -> bool:
        """返回 path 字面路径是否位于 root 下，不解析路径中的软链。"""
        try:
            path.absolute().relative_to(root.absolute())
            return True
        except ValueError:
            return False

    @classmethod
    def is_system_path(cls, path: Path) -> bool:
        """返回路径是否位于系统目录下。"""
        return any(cls.is_under(path, root) for root in SYSTEM_ROOTS)

    @staticmethod
    async def make_executable(path: Path) -> None:
        """确保文件对当前用户具备可执行权限。"""
        mode = (await async_stat(path)).st_mode
        await async_chmod(path, mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    @staticmethod
    def quote(path: Path | str) -> str:
        """对 shell 路径或参数进行安全引用。"""
        return shlex.quote(str(path))

    @staticmethod
    async def looks_like_standalone_binary(path: Path) -> bool:
        """启发式判断系统路径命令是否可作为独立二进制复制。"""
        try:
            head = (await async_read_bytes(path, size=128))[:128]
        except OSError:
            return False
        return not head.startswith(b"#!")
