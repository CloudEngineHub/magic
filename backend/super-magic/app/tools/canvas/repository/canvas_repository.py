"""Canvas 主文件和 sidecar 仓储实现。"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path
from typing import Awaitable, Callable, TypeVar

from app.tools.canvas.infrastructure.persistence.canvas_codec import CanvasCodec
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.repository.canvas_path_resolver import CanvasPathResolver
from app.tools.canvas.infrastructure.persistence.element_details_codec import ElementDetailsCodec
from app.utils.async_file_utils import (
    async_close_fd,
    async_exists,
    async_mkstemp,
    async_read_bytes,
    async_read_text,
    async_replace,
    async_unlink,
    async_write_bytes,
    async_write_text,
)

T = TypeVar("T")

class CanvasRepository(CanvasRepositoryInterface):
    """负责 Canvas 主文件和 sidecar 的读取、写入与项目级锁。"""

    _locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def __init__(self, workspace: Path):
        """初始化工作区级仓储。"""
        self.workspace = workspace

    async def initialize(self, project_path: str) -> tuple[Path, bool]:
        """创建空项目；已存在合法项目时返回未修改状态。"""
        path = CanvasPathResolver.resolve(self.workspace, project_path)
        from app.utils.async_file_utils import async_mkdir

        await async_mkdir(path, parents=True, exist_ok=True)
        project_file = path / "magic.project.js"
        if await async_exists(project_file):
            await self.read(project_path)
            return path, False
        await self._atomic_write_text(
            project_file, CanvasCodec.encode(CanvasCodec.empty_project(path.name))
        )
        return path, True

    async def read(self, project_path: str) -> CanvasProject:
        """读取并校验当前项目。"""
        path = CanvasPathResolver.resolve(self.workspace, project_path)
        project_file = path / "magic.project.js"
        if not await async_exists(project_file):
            raise FileNotFoundError("PROJECT_NOT_FOUND")
        return CanvasCodec.decode(await async_read_text(project_file, encoding="utf-8"))

    async def transaction(
        self,
        project_path: str,
        mutator: Callable[[CanvasProject], T | Awaitable[T]],
    ) -> T:
        """在项目锁内读取、修改、校验并写回主文件。"""
        path = CanvasPathResolver.resolve(self.workspace, project_path)
        lock = self._locks[str(path)]
        async with lock:
            project = await self.read(project_path)
            result = mutator(project)
            if asyncio.iscoroutine(result):
                result = await result
            project.canvas.validate()
            await self._write(path, project)
            return result

    async def transaction_with_sidecar(
        self,
        project_path: str,
        mutator: Callable[[CanvasProject, dict], T | Awaitable[tuple[T, dict]]],
        filename: str = "element-details.json",
    ) -> T:
        """在同一项目锁内协调主文件和 sidecar 写入。

        两个文件无法由普通文件系统提供真正的跨文件事务，因此这里使用临时文件、
        顺序替换和失败回滚，避免把半完成的结构暴露给后续 Canvas 调用。
        """
        path = CanvasPathResolver.resolve(self.workspace, project_path)
        lock = self._locks[str(path)]
        async with lock:
            project = await self.read(project_path)
            sidecar = await self._read_sidecar_strict(path / filename)
            if filename != "element-details-user.json":
                await self._read_sidecar_strict(path / "element-details-user.json")
            result = mutator(project, sidecar)
            if asyncio.iscoroutine(result):
                result = await result
            if not isinstance(result, tuple) or len(result) != 2:
                raise TypeError("transaction_with_sidecar mutator must return (result, sidecar)")
            value, updated_sidecar = result
            project.canvas.validate()
            await self._write_bundle(path, project, updated_sidecar, filename)
            return value

    async def _write(self, path: Path, project: CanvasProject) -> None:
        """原子写入主文件并保留 sidecar 的已有内容。"""
        encoded = CanvasCodec.encode(project)
        await self._atomic_write_text(path / "magic.project.js", encoded)

    async def read_sidecar(self, project_path: str, filename: str = "element-details.json") -> dict:
        """读取可选 sidecar；不存在或非法时返回空对象。"""
        path = CanvasPathResolver.resolve(self.workspace, project_path) / filename
        return await self._read_sidecar_strict(path, missing_ok=True)

    async def write_sidecar(self, project_path: str, data: dict, filename: str = "element-details.json") -> None:
        """原子写入 Canvas 侧车元数据，不把内部字段写入主协议。"""
        path = CanvasPathResolver.resolve(self.workspace, project_path) / filename
        await self._atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2))

    async def _read_sidecar_strict(self, path: Path, missing_ok: bool = True) -> dict:
        """严格读取 sidecar，损坏或非对象结构不静默覆盖。"""
        if not await async_exists(path):
            if missing_ok:
                return {}
            raise ValueError("INVALID_ELEMENT_DETAILS")
        try:
            data = await async_read_text(path, encoding="utf-8")
            value = json.loads(data)
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("INVALID_ELEMENT_DETAILS") from exc
        if not isinstance(value, dict):
            raise ValueError("INVALID_ELEMENT_DETAILS")
        return ElementDetailsCodec.validate(value)

    async def _write_bundle(
        self, path: Path, project: CanvasProject, sidecar: dict, filename: str
    ) -> None:
        """以临时文件和备份实现主文件、sidecar 的可恢复写入。"""
        project_file = path / "magic.project.js"
        sidecar_file = path / filename
        encoded = CanvasCodec.encode(project)
        ElementDetailsCodec.validate(sidecar)
        sidecar_text = json.dumps(sidecar, ensure_ascii=False, indent=2)
        temp_files: list[Path] = []
        backups: dict[Path, bytes | None] = {}
        try:
            for target, content in ((project_file, encoded), (sidecar_file, sidecar_text)):
                fd, raw_path = await async_mkstemp(prefix=f".{target.name}.", dir=path)
                await async_close_fd(fd)
                temp_path = Path(raw_path)
                await async_write_text(temp_path, content, encoding="utf-8")
                temp_files.append(temp_path)
                backups[target] = await async_read_bytes(target) if await async_exists(target) else None
            await async_replace(temp_files[0], project_file)
            await async_replace(temp_files[1], sidecar_file)
            persisted_project = await async_read_text(project_file, encoding="utf-8")
            CanvasCodec.decode(persisted_project)
            persisted_sidecar = json.loads(await async_read_text(sidecar_file, encoding="utf-8"))
            ElementDetailsCodec.validate(persisted_sidecar)
        except Exception:
            for target, original in backups.items():
                try:
                    if original is None:
                        await async_unlink(target)
                    else:
                        await async_write_bytes(target, original)
                except OSError:
                    pass
            raise
        finally:
            for temp_path in temp_files:
                await async_unlink(temp_path)

    @staticmethod
    async def _atomic_write_text(target: Path, content: str) -> None:
        """通过同目录临时文件和原子替换写入单个文件。"""
        fd, raw_path = await async_mkstemp(prefix=f".{target.name}.", dir=target.parent)
        await async_close_fd(fd)
        temp_path = Path(raw_path)
        try:
            await async_write_text(temp_path, content, encoding="utf-8")
            await async_replace(temp_path, target)
        finally:
            await async_unlink(temp_path)
