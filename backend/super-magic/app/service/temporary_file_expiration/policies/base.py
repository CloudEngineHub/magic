"""临时文件过期策略基类。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class TemporaryFileExpirationPolicy(ABC):
    """定义临时文件过期策略的统一接口。"""

    def __init__(self, name: str, ttl_seconds: int) -> None:
        """初始化策略名称和存活时间。"""
        if ttl_seconds <= 0:
            raise ValueError("临时文件存活时间必须大于 0")
        self.name = name
        self.ttl_seconds = ttl_seconds

    @abstractmethod
    def matches(self, file_path: Path) -> bool:
        """判断当前策略是否匹配指定文件。"""

    def is_expired(self, modified_at: float, current_time: float) -> bool:
        """根据文件修改时间判断是否已经过期。"""
        return current_time - modified_at >= self.ttl_seconds
