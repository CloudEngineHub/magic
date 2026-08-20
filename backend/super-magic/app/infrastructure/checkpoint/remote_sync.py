# -*- coding: utf-8 -*-
"""
Checkpoint 远端同步

把 .checkpoints 的持久化从「整目录打一个 zip、全量上传、重启全量拉取」迁移为：
- 每轮只上传本轮 checkpoint 的单独 zip（checkpoints/{topic_id}/{checkpoint_id}.zip）
- 每轮上传小体积的 checkpoint_manifest.json（checkpoints/{topic_id}/manifest.json）
- 沙箱重启只拉 manifest，回滚时才按需拉对应 checkpoint 的 zip

旧的整目录归档 checkpoints_{topic_id}.zip 不再读写，属破坏性迁移，不做兼容。
"""

import asyncio
import os
import tempfile
import zipfile
import shutil
from pathlib import Path
from typing import List, Optional

from app.core.entity.checkpoint import VirtualCheckpoint
from app.infrastructure.checkpoint.metadata_manager import CheckpointMetadataManager
from app.infrastructure.checkpoint.storage import CheckpointStorage
from app.infrastructure.storage.base import BaseFileProcessor
from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_try_read_json,
    async_write_bytes,
    async_write_json,
)
from app.utils.init_client_message_util import InitClientMessageUtil
from app.utils.path_utils import get_storage_dir
from agentlang.logger import get_logger

logger = get_logger(__name__)


class CheckpointRemoteSync:
    """Checkpoint 远端同步器，负责单个 checkpoint 归档与 manifest 的上传/下载/删除。"""

    # 本地记录「上一次已上传的 checkpoint id 集合」，用于差异删除被清理的远端归档
    _SYNC_STATE_FILE_NAME = ".remote_sync_state.json"

    def __init__(self, storage_service, topic_id: str):
        self.storage_service = storage_service
        self.topic_id = topic_id
        self.storage = CheckpointStorage()
        self.metadata_manager = CheckpointMetadataManager()

    # ---------- 对象 key 构造 ----------

    def _base_key(self) -> str:
        base_path = get_storage_dir(self.storage_service.credentials)
        dir_path = BaseFileProcessor.combine_path(
            base_path, InitClientMessageUtil.get_checkpoints_dir()
        )
        return BaseFileProcessor.combine_path(dir_path, self.topic_id)

    def manifest_key(self) -> str:
        return BaseFileProcessor.combine_path(self._base_key(), "manifest.json")

    def checkpoint_key(self, checkpoint_id: str) -> str:
        return BaseFileProcessor.combine_path(self._base_key(), f"{checkpoint_id}.zip")

    # ---------- 本地路径 ----------

    def _checkpoint_dir(self, checkpoint_id: str) -> Path:
        return PathManager.get_checkpoint_dir(checkpoint_id)

    def _sync_state_file(self) -> Path:
        return PathManager.get_checkpoints_dir() / self._SYNC_STATE_FILE_NAME

    # ---------- 上传 ----------

    async def upload_checkpoint(self, checkpoint_id: str) -> bool:
        """只压缩并上传一个 checkpoint 目录。"""
        checkpoint_dir = self._checkpoint_dir(checkpoint_id)
        info_file = checkpoint_dir / "checkpoint_info.json"
        if not await async_exists(info_file):
            logger.warning(f"checkpoint 目录不完整，跳过上传: {checkpoint_id}")
            return False

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                archive_base = os.path.join(temp_dir, checkpoint_id)
                zip_path = await asyncio.to_thread(
                    shutil.make_archive, archive_base, "zip", str(checkpoint_dir)
                )
                await self.storage_service.upload(
                    file=zip_path,
                    key=self.checkpoint_key(checkpoint_id),
                    options=None,
                )
            logger.info(f"上传 checkpoint 归档成功: {self.checkpoint_key(checkpoint_id)}")
            return True
        except Exception as e:
            logger.error(f"上传 checkpoint 归档失败: {checkpoint_id}: {e}")
            return False

    async def upload_manifest(self) -> bool:
        """上传本地 checkpoint_manifest.json。"""
        manifest_file = self.storage.get_checkpoint_manifest_file_path()
        if not await async_exists(manifest_file):
            logger.info("本地 checkpoint manifest 不存在，跳过上传")
            return False
        try:
            await self.storage_service.upload(
                file=str(manifest_file),
                key=self.manifest_key(),
                options=None,
            )
            logger.info(f"上传 checkpoint manifest 成功: {self.manifest_key()}")
            return True
        except Exception as e:
            logger.error(f"上传 checkpoint manifest 失败: {e}")
            return False

    # ---------- 下载 ----------

    async def download_manifest(self) -> bool:
        """拉取远端 manifest 写入本地，作为沙箱重启后 checkpoint 系统的唯一恢复内容。"""
        key = self.manifest_key()
        try:
            if not await self.storage_service.exists(key):
                logger.info(f"远端 checkpoint manifest 不存在: {key}")
                return False
            stream = await self.storage_service.download(key=key, options=None)
            manifest_file = self.storage.get_checkpoint_manifest_file_path()
            await async_write_bytes(manifest_file, stream.read())
            logger.info(f"已恢复 checkpoint manifest: {manifest_file}")
            return True
        except Exception as e:
            logger.error(f"下载 checkpoint manifest 失败: {key}: {e}")
            return False

    async def ensure_checkpoints_available(self, checkpoint_ids: List[str]) -> None:
        """确保给定 checkpoint 在本地可用，缺失的从远端下载并解压。

        回滚前调用；本地已有（或远端不存在）的 checkpoint 静默跳过，
        由回滚执行器原有的「跳过无效 checkpoint」逻辑兜底。
        """
        for checkpoint_id in checkpoint_ids:
            if checkpoint_id == VirtualCheckpoint.INITIAL:
                continue
            info_file = self.storage.get_checkpoint_info_file_path(checkpoint_id)
            if await async_exists(info_file):
                continue
            await self._download_checkpoint(checkpoint_id)

    async def _download_checkpoint(self, checkpoint_id: str) -> bool:
        key = self.checkpoint_key(checkpoint_id)
        temp_file = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        temp_file_path = temp_file.name
        temp_file.close()
        try:
            if not await self.storage_service.exists(key):
                logger.warning(f"远端 checkpoint 归档不存在，无法按需拉取: {key}")
                return False
            await self.storage_service.download_file_by_stream(
                key=key, dest_path=temp_file_path
            )
            target_dir = self._checkpoint_dir(checkpoint_id)
            await async_mkdir(target_dir, parents=True, exist_ok=True)
            with zipfile.ZipFile(temp_file_path, "r") as zip_ref:
                await asyncio.to_thread(zip_ref.extractall, target_dir)
            logger.info(f"已按需拉取 checkpoint 归档: {checkpoint_id}")
            return True
        except Exception as e:
            logger.error(f"按需拉取 checkpoint 归档失败: {checkpoint_id}: {e}")
            return False
        finally:
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass

    # ---------- manifest 同步与差异删除 ----------

    async def sync_manifest_and_evicted(self) -> None:
        """上传本地 manifest，并删除「已上传但已不在 manifest」的远端归档。

        全程 best-effort：任何一步失败只记日志，不阻断后续步骤。
        """
        if self.storage_service is None:
            return

        manifest = await self.metadata_manager.load_checkpoint_manifest()
        if manifest is None:
            logger.info("本地 checkpoint manifest 不存在，跳过同步")
            return

        current_ids = [
            cp_id for cp_id in manifest.checkpoints if cp_id != VirtualCheckpoint.INITIAL
        ]

        prev_ids = await self._load_sync_state() or []

        await self.upload_manifest()

        evicted_ids = [cp_id for cp_id in prev_ids if cp_id not in current_ids]
        for checkpoint_id in evicted_ids:
            await self.delete_checkpoint(checkpoint_id)

        await self._save_sync_state(current_ids)

    async def delete_checkpoint(self, checkpoint_id: str) -> bool:
        """删除远端单个 checkpoint 归档。"""
        try:
            await self.storage_service.delete(
                key=self.checkpoint_key(checkpoint_id), options=None
            )
            logger.info(f"删除远端 checkpoint 归档成功: {self.checkpoint_key(checkpoint_id)}")
            return True
        except Exception as e:
            logger.error(f"删除远端 checkpoint 归档失败: {checkpoint_id}: {e}")
            return False

    async def _load_sync_state(self) -> Optional[List[str]]:
        data = await async_try_read_json(self._sync_state_file())
        if data and isinstance(data.get("uploaded_checkpoint_ids"), list):
            return data["uploaded_checkpoint_ids"]
        return None

    async def _save_sync_state(self, checkpoint_ids: List[str]) -> None:
        try:
            await async_write_json(
                self._sync_state_file(),
                {"uploaded_checkpoint_ids": checkpoint_ids},
                ensure_ascii=False,
                indent=2,
            )
        except Exception as e:
            logger.error(f"保存 checkpoint 同步状态失败: {e}")
