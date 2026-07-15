"""文件扩展名过期策略。"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from app.service.temporary_file_expiration.policies.base import TemporaryFileExpirationPolicy


class ExtensionExpirationPolicy(TemporaryFileExpirationPolicy):
    """按扩展名集合匹配临时文件。"""

    def __init__(self, name: str, ttl_seconds: int, extensions: Iterable[str]) -> None:
        """初始化扩展名策略。"""
        super().__init__(name, ttl_seconds)
        self._extensions = frozenset(extension.lower() for extension in extensions)

    def matches(self, file_path: Path) -> bool:
        """判断文件扩展名是否属于当前策略。"""
        return file_path.suffix.lower() in self._extensions
