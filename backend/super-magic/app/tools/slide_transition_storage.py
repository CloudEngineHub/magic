"""过渡配置的版本保护保存；远端 CAS 是写入保护，读回只用于确认结果。"""

import asyncio
from dataclasses import dataclass
from pathlib import Path

import aiohttp

from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.exceptions import ApiError
from app.service.file_service import FileService
from app.utils.async_file_utils import (
    async_read_text,
    get_file_id_from_xattr,
    get_metadata_version_from_xattr,
)


class TransitionStorageError(ValueError):
    def __init__(self, message: str, outcome: str = "not_saved"):
        super().__init__(message)
        self.outcome = outcome


@dataclass(frozen=True)
class ProjectSnapshot:
    file_id: str
    revision: int
    content: str


async def read_project_snapshot(client: MagicServiceClient, path: Path) -> ProjectSnapshot:
    file_id = await get_file_id_from_xattr(path)
    if not file_id:
        raise TransitionStorageError("The project file is not synchronized yet. Wait and reread it before trying again.")
    before = await client.get_file_metadata(file_id)
    revision = before.get("version")
    if type(revision) is not int or revision < 0 or str(before.get("id")) != file_id:
        raise TransitionStorageError("The file service did not return a matching file identity and metadata revision.")
    if before.get("is_directory") or before.get("name") != "magic.project.js":
        raise TransitionStorageError("The file identity no longer points to the project configuration.")
    mounted_revision = await get_metadata_version_from_xattr(path)
    remote_content = await _read_remote_content(path)
    content = await async_read_text(path)
    mounted_after = await get_metadata_version_from_xattr(path)
    identity_after = await get_file_id_from_xattr(path)
    after = await client.get_file_metadata(file_id)
    if (
        mounted_revision != str(revision) or mounted_after != str(revision)
        or identity_after != file_id or before != after or content != remote_content
    ):
        raise TransitionStorageError("The project changed or its mounted copy is not synchronized. Reread it before saving.", "conflict")
    return ProjectSnapshot(file_id, revision, content)


async def _read_remote_content(path: Path) -> str:
    # 统一按 xattr 中的真实 S3 key 取 URL，禁止根据路径猜对象 key。
    url = await FileService().get_workspace_file_url(path, expires_in=60)
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
        async with session.get(url, headers={"Cache-Control": "no-cache"}) as response:
            response.raise_for_status()
            chunks = []
            size = 0
            async for chunk in response.content.iter_chunked(65536):
                size += len(chunk)
                if size > 2 * 1024 * 1024:
                    raise TransitionStorageError("The project configuration exceeds the supported size.")
                chunks.append(chunk)
            return b"".join(chunks).decode("utf-8")


async def save_project_snapshot(
    client: MagicServiceClient, path: Path, snapshot: ProjectSnapshot, content: str
) -> ProjectSnapshot:
    current = await read_project_snapshot(client, path)
    if current != snapshot:
        raise TransitionStorageError("The project changed before saving. Reread it and resolve the requested scope again.", "conflict")
    if content == snapshot.content:
        return snapshot
    try:
        result = await client.save_file_content(snapshot.file_id, content, snapshot.revision)
    except ApiError as exc:
        if str((exc.response_data or {}).get("code")) == "51152":
            raise TransitionStorageError("Version conflict: reread the deck and resolve the requested scope again.", "conflict") from exc
        if exc.status_code in {401, 403}:
            raise TransitionStorageError("User authorization or edit permission was rejected. No changes were saved.", "permission") from exc
        # 服务端响应异常也可能发生在写入之后。只确认，不重复提交。
        return await _confirm_save(client, path, snapshot, content)
    except (aiohttp.ClientError, TimeoutError, ValueError):
        return await _confirm_save(client, path, snapshot, content)
    errors = result.get("error_files", [])
    for error in errors:
        if str(error.get("file_id")) == snapshot.file_id:
            if str(error.get("error_code")) == "51152":
                raise TransitionStorageError("Version conflict: the project was updated. Reread it; do not retry the old payload.", "conflict")
            raise TransitionStorageError("The save was rejected or failed. Reread the project before deciding how to proceed.", "unknown")
    return await _confirm_save(client, path, snapshot, content)


async def _confirm_save(
    client: MagicServiceClient, path: Path, snapshot: ProjectSnapshot, content: str
) -> ProjectSnapshot:
    for attempt in range(3):
        if attempt:
            await asyncio.sleep(0.25)
        try:
            current = await read_project_snapshot(client, path)
            if current.file_id == snapshot.file_id and current.revision > snapshot.revision and current.content == content:
                return current
        except (ValueError, ApiError, aiohttp.ClientError, OSError, TimeoutError):
            continue
    raise TransitionStorageError(
        "Save outcome is unknown: the new content and metadata revision could not be confirmed in the mounted project. "
        "The save may already have committed. Reread the project; do not retry this payload or report success.", "unknown"
    )
