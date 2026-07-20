"""临时文件过期策略注册器。"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from app.service.temporary_file_expiration.constants import (
    DEFAULT_TTL_SECONDS,
    IMAGE_EXTENSIONS,
    IMAGE_TTL_SECONDS,
    TEXT_EXTENSIONS,
    TEXT_TTL_SECONDS,
)
from app.service.temporary_file_expiration.policies import (
    ExtensionExpirationPolicy,
    FallbackExpirationPolicy,
    TemporaryFileExpirationPolicy,
)


class TemporaryFileExpirationPolicyRegistry:
    """按注册顺序选择临时文件过期策略。"""

    def __init__(self, policies: Iterable[TemporaryFileExpirationPolicy]) -> None:
        """初始化策略列表。"""
        self._policies = tuple(policies)
        if not self._policies:
            raise ValueError("至少需要注册一个临时文件过期策略")

    def resolve(self, file_path: Path) -> TemporaryFileExpirationPolicy:
        """返回第一个匹配指定文件的过期策略。"""
        for policy in self._policies:
            if policy.matches(file_path):
                return policy
        raise RuntimeError(f"没有匹配的临时文件过期策略: {file_path}")

    @classmethod
    def create_default(cls) -> "TemporaryFileExpirationPolicyRegistry":
        """创建当前产品约定的默认过期策略集合。"""
        return cls(
            (
                ExtensionExpirationPolicy(
                    name="text",
                    ttl_seconds=TEXT_TTL_SECONDS,
                    extensions=TEXT_EXTENSIONS,
                ),
                ExtensionExpirationPolicy(
                    name="image",
                    ttl_seconds=IMAGE_TTL_SECONDS,
                    extensions=IMAGE_EXTENSIONS,
                ),
                FallbackExpirationPolicy(
                    name="default",
                    ttl_seconds=DEFAULT_TTL_SECONDS,
                ),
            )
        )
