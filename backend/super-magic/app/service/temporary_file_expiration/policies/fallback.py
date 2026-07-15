"""临时文件兜底过期策略。"""

from __future__ import annotations

from pathlib import Path

from app.service.temporary_file_expiration.policies.base import TemporaryFileExpirationPolicy


class FallbackExpirationPolicy(TemporaryFileExpirationPolicy):
    """匹配所有未被其他策略处理的临时文件。"""

    def matches(self, file_path: Path) -> bool:
        """兜底策略始终匹配。"""
        return True
