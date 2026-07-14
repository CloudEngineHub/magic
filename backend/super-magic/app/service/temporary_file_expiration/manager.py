"""工作区临时文件过期管理器。"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Callable, ClassVar, Optional

from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.service.temporary_file_expiration.cleanup_result import TemporaryFileCleanupResult
from app.service.temporary_file_expiration.policy_registry import TemporaryFileExpirationPolicyRegistry
from app.utils.async_file_utils import (
    async_exists,
    async_is_symlink,
    async_rmdir,
    async_scandir,
    async_stat,
    async_unlink,
)

logger = get_logger(__name__)


class TemporaryFileExpirationManager:
    """根据策略异步清理 `.workspace/.tmp` 下的过期文件。"""

    _instance: ClassVar[Optional["TemporaryFileExpirationManager"]] = None

    def __init__(
        self,
        policy_registry: Optional[TemporaryFileExpirationPolicyRegistry] = None,
        temporary_directory: Optional[Path] = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        """初始化过期策略、临时目录和时钟。"""
        self._policy_registry = policy_registry or TemporaryFileExpirationPolicyRegistry.create_default()
        self._temporary_directory = temporary_directory
        self._clock = clock
        self._cleanup_task: Optional[asyncio.Task[TemporaryFileCleanupResult]] = None

    @classmethod
    def get_instance(cls) -> "TemporaryFileExpirationManager":
        """获取进程内临时文件过期管理器单例。"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def trigger(self) -> None:
        """异步触发清理；已有清理任务运行时不重复启动。"""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            logger.info("临时文件过期检查正在运行，跳过重复触发")
            return

        self._cleanup_task = asyncio.create_task(self.cleanup_expired_files())
        self._cleanup_task.add_done_callback(self._handle_cleanup_done)

    async def cleanup_expired_files(self) -> TemporaryFileCleanupResult:
        """扫描临时目录，并按文件对应策略删除已过期文件。"""
        result = TemporaryFileCleanupResult()
        temporary_directory = self._temporary_directory or PathManager.get_tmp_dir()

        if await async_is_symlink(temporary_directory):
            logger.warning(f"临时目录是软链接，跳过过期检查: {temporary_directory}")
            return result

        if not await async_exists(temporary_directory):
            logger.debug(f"临时目录不存在，跳过过期检查: {temporary_directory}")
            return result

        current_time = self._clock()
        await self._cleanup_directory(temporary_directory, current_time, result)

        if result.deleted_files > 0 or result.deleted_directories > 0 or result.failed_files > 0:
            logger.info(
                "临时文件过期检查完成: "
                f"扫描 {result.scanned_files} 个文件, "
                f"删除 {result.deleted_files} 个文件, "
                f"删除 {result.deleted_directories} 个空目录, "
                f"失败 {result.failed_files} 个文件"
            )
        return result

    async def _cleanup_directory(
        self,
        directory: Path,
        current_time: float,
        result: TemporaryFileCleanupResult,
    ) -> None:
        """递归扫描目录并清理过期文件，不跟随软链接。"""
        try:
            entries = await async_scandir(directory)
        except FileNotFoundError:
            return
        except Exception as error:
            logger.warning(f"扫描临时目录失败，跳过当前目录: {directory}, 错误: {error}")
            return

        for entry in entries:
            entry_path = Path(entry.path)
            try:
                if entry.is_symlink():
                    logger.warning(f"临时目录中存在软链接，跳过处理: {entry_path}")
                    continue
                if entry.is_dir():
                    await self._cleanup_directory(entry_path, current_time, result)
                    await self._remove_directory_if_empty(entry_path, result)
                    continue
                if not entry.is_file():
                    continue

                result.scanned_files += 1
                await self._cleanup_file(entry_path, current_time, result)
            except FileNotFoundError:
                continue
            except Exception as error:
                result.failed_files += 1
                logger.warning(f"处理临时文件失败: {entry_path}, 错误: {error}")

    async def _remove_directory_if_empty(
        self,
        directory: Path,
        result: TemporaryFileCleanupResult,
    ) -> None:
        """删除清理后已经为空的子目录，临时目录根路径由调用方保留。"""
        try:
            remaining_entries = await async_scandir(directory)
            if remaining_entries:
                return

            await async_rmdir(directory)
            result.deleted_directories += 1
            logger.info(f"已删除空的临时子目录: {directory}")
        except FileNotFoundError:
            return
        except OSError as error:
            logger.debug(f"临时子目录当前无法删除，跳过处理: {directory}, 错误: {error}")

    async def _cleanup_file(
        self,
        file_path: Path,
        current_time: float,
        result: TemporaryFileCleanupResult,
    ) -> None:
        """按匹配策略判断并删除单个过期临时文件。"""
        file_stat = await async_stat(file_path)
        policy = self._policy_registry.resolve(file_path)
        if not policy.is_expired(file_stat.st_mtime, current_time):
            return

        await async_unlink(file_path)
        result.deleted_files += 1
        logger.info(f"已删除过期临时文件: {file_path.name}, 策略: {policy.name}")

    @staticmethod
    def _handle_cleanup_done(task: asyncio.Task[TemporaryFileCleanupResult]) -> None:
        """记录后台清理任务未被内部处理的异常。"""
        if task.cancelled():
            logger.info("临时文件过期检查已取消")
            return
        try:
            task.result()
        except Exception as error:
            logger.warning(f"临时文件过期检查异常结束: {error}", exc_info=True)
