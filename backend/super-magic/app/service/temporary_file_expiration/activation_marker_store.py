"""临时文件过期清理启用标记存储。"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

from agentlang.logger import get_logger
from app.service.temporary_file_expiration.constants import (
    ACTIVATION_MARKER_FILE_NAME,
    ACTIVATION_MARKER_SCHEMA_VERSION,
)
from app.utils.async_file_utils import (
    async_create_json,
    async_exists,
    async_is_symlink,
    async_read_json,
)

logger = get_logger(__name__)


class TemporaryFileExpirationActivationMarkerStore:
    """负责创建、读取和校验临时文件清理启用标记。"""

    def __init__(self, temporary_directory: Path) -> None:
        """初始化临时目录和启用标记路径。"""
        self._marker_path = temporary_directory / ACTIVATION_MARKER_FILE_NAME

    @property
    def marker_path(self) -> Path:
        """返回启用标记文件路径。"""
        return self._marker_path

    async def resolve_cleanup_boundary(self, enabled_at: float) -> Optional[float]:
        """返回已有标记的清理边界；首次创建或标记异常时返回 None。"""
        if await async_is_symlink(self._marker_path):
            logger.warning(f"临时文件清理启用标记是软链接，本轮不执行清理: {self._marker_path}")
            return None

        if not await async_exists(self._marker_path):
            await self._create_marker(enabled_at)
            return None

        try:
            marker_data = await async_read_json(self._marker_path)
        except Exception as error:
            logger.warning(f"读取临时文件清理启用标记失败，本轮不执行清理: {self._marker_path}, 错误: {error}")
            return None

        return self._parse_enabled_at(marker_data)

    async def _create_marker(self, enabled_at: float) -> None:
        """排他创建启用标记；发生并发竞争时保留先创建的边界。"""
        marker_data = {
            "schema_version": ACTIVATION_MARKER_SCHEMA_VERSION,
            "enabled_at": enabled_at,
        }
        try:
            await async_create_json(
                self._marker_path,
                marker_data,
                ensure_ascii=False,
                indent=2,
            )
            logger.info(f"已创建临时文件清理启用标记: {self._marker_path}")
        except FileExistsError:
            logger.info(f"临时文件清理启用标记已由其他任务创建: {self._marker_path}")
        except Exception as error:
            logger.warning(f"创建临时文件清理启用标记失败，本轮不执行清理: {self._marker_path}, 错误: {error}")

    def _parse_enabled_at(self, marker_data: Any) -> Optional[float]:
        """校验标记版本和启用时间，返回可用于比较的时间戳。"""
        if not isinstance(marker_data, dict):
            logger.warning(f"临时文件清理启用标记格式无效，本轮不执行清理: {self._marker_path}")
            return None

        if marker_data.get("schema_version") != ACTIVATION_MARKER_SCHEMA_VERSION:
            logger.warning(f"临时文件清理启用标记版本不支持，本轮不执行清理: {self._marker_path}")
            return None

        enabled_at = marker_data.get("enabled_at")
        if isinstance(enabled_at, bool) or not isinstance(enabled_at, (int, float)):
            logger.warning(f"临时文件清理启用时间格式无效，本轮不执行清理: {self._marker_path}")
            return None

        normalized_enabled_at = float(enabled_at)
        if normalized_enabled_at < 0 or not math.isfinite(normalized_enabled_at):
            logger.warning(f"临时文件清理启用时间数值无效，本轮不执行清理: {self._marker_path}")
            return None
        return normalized_enabled_at
