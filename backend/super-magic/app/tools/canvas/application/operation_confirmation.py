"""仅用于画布删除和批量文件改名的真人确认记录。"""

from __future__ import annotations

import asyncio
import hashlib
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic import JsonValue as PydanticJsonValue

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from app.core.context.agent_context import AgentContext
from app.path_manager import PathManager
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.types import JsonObject
from app.utils.async_file_utils import (
    async_chmod,
    async_exists,
    async_mkdir,
    async_read_json,
    async_scandir,
    async_unlink,
    async_write_json,
)


class PreparedCanvasOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prepared_tool_call_id: str
    topic_id: str
    workspace: str
    operation: Literal["delete", "rename"]
    payload: dict[str, PydanticJsonValue]
    fingerprint: str
    question: str
    created_at: float = Field(default_factory=time.time)
    state: Literal["prepared", "waiting", "approved", "consumed", "rejected"] = "prepared"
    confirmation_tool_call_id: str | None = None
    question_id: str | None = None


@dataclass(frozen=True)
class CanvasOperationPreparation:
    payload: JsonObject
    fingerprint: str


class CanvasOperationConfirmation:
    # 同一准备记录只绑定一次真人提问、消费一次；并发 SDK 调用不能重复执行。
    _locks: dict[str, asyncio.Lock] = {}
    MAX_RECORDS = 256
    RETENTION_SECONDS = 24 * 60 * 60

    def __init__(self, agent_context: AgentContext):
        self.agent_context = agent_context
        self.topic_id = str(agent_context.get_metadata().get("topic_id") or "")
        if not self.topic_id:
            raise CanvasDomainError("CONFIRMATION_UNAVAILABLE", "An interactive topic is required for this operation.")
        self.workspace = os.path.abspath(agent_context.get_workspace_dir())
        self.directory = (
            PathManager.get_runtime_dir() / "canvas-operations" / hashlib.sha256(self.topic_id.encode()).hexdigest()
        )

    @classmethod
    def from_tool(cls, context: ToolContext) -> CanvasOperationConfirmation:
        agent = context.get_extension_typed("agent_context", AgentContext)
        if agent is None or not agent.is_interactive_main_agent_context():
            raise CanvasDomainError(
                "CONFIRMATION_UNAVAILABLE", "Canvas deletion and batch file rename require the interactive main Agent."
            )
        return cls(agent)

    def _path(self, prepared_id: str) -> Path:
        if not prepared_id:
            raise CanvasDomainError("CONFIRMATION_REQUIRED", "Supply the prepared tool call ID returned by prepare.")
        return self.directory / (hashlib.sha256(prepared_id.encode()).hexdigest() + ".json")

    async def save(self, record: PreparedCanvasOperation) -> None:
        await async_mkdir(self.directory, parents=True, exist_ok=True)
        await async_chmod(self.directory, 0o700)
        path = self._path(record.prepared_tool_call_id)
        await async_write_json(path, record.model_dump(), ensure_ascii=False)
        await async_chmod(path, 0o600)

    async def read(self, prepared_id: str) -> PreparedCanvasOperation:
        path = self._path(prepared_id)
        if not await async_exists(path):
            raise CanvasDomainError(
                "CONFIRMATION_REQUIRED", "The prepared operation is missing or expired. Prepare it again."
            )
        record = PreparedCanvasOperation.model_validate(await async_read_json(path))
        if record.topic_id != self.topic_id or record.workspace != self.workspace:
            raise CanvasDomainError(
                "CONFIRMATION_MISMATCH", "The prepared operation belongs to another topic or workspace."
            )
        return record

    async def prepare(
        self,
        prepared_id: str,
        operation: Literal["delete", "rename"],
        payload: JsonObject,
        fingerprint: str,
        question: str,
    ) -> PreparedCanvasOperation:
        await async_mkdir(self.directory, parents=True, exist_ok=True)
        entries = await async_scandir(self.directory)
        remaining = 0
        for entry in entries:
            if not entry.name.endswith(".json"):
                continue
            raw = PreparedCanvasOperation.model_validate(await async_read_json(entry.path))
            if raw.state == "rejected" or (
                raw.state in {"prepared", "consumed"} and time.time() - raw.created_at > self.RETENTION_SECONDS
            ):
                await async_unlink(entry.path)
                self._locks.pop(str(Path(entry.path)), None)
            else:
                remaining += 1
        if remaining >= self.MAX_RECORDS or await async_exists(self._path(prepared_id)):
            raise CanvasDomainError(
                "CONFIRMATION_PENDING",
                "An existing preparation must be completed or cancelled before preparing another operation in this tool call.",
            )
        record = PreparedCanvasOperation(
            prepared_tool_call_id=prepared_id,
            topic_id=self.topic_id,
            workspace=self.workspace,
            operation=operation,
            payload=payload,
            fingerprint=fingerprint,
            question=question,
        )
        await self.save(record)
        return record

    async def bind(self, prepared_id: str, confirmation_id: str, question_id: str) -> None:
        async with self._locks.setdefault(str(self._path(prepared_id)), asyncio.Lock()):
            record = await self.read(prepared_id)
            if record.state != "prepared":
                raise CanvasDomainError(
                    "CONFIRMATION_PENDING", "This preparation is already bound or consumed. Prepare a new operation."
                )
            record.state, record.confirmation_tool_call_id, record.question_id = "waiting", confirmation_id, question_id
            await self.save(record)

    async def answer(self, prepared_id: str, confirmation_id: str, status: str, answers: dict[str, object]) -> None:
        async with self._locks.setdefault(str(self._path(prepared_id)), asyncio.Lock()):
            record = await self.read(prepared_id)
            if record.state != "waiting" or record.confirmation_tool_call_id != confirmation_id:
                raise CanvasDomainError("CONFIRMATION_MISMATCH", "The human response does not match this preparation.")
            # 前端 confirm 的稳定值是「是／否」；不能把默认答案、跳过或超时当同意。
            approved = status == "answered" and len(answers) == 1 and answers.get(record.question_id or "") == "是"
            record.state = "approved" if approved else "rejected"
            await self.save(record)
            if not approved:
                await self.discard(record)

    async def discard(self, record: PreparedCanvasOperation) -> None:
        # 完成／拒绝后不保留无用途快照；清理失败由下次 prepare 的机会式淘汰处理。
        try:
            await async_unlink(self._path(record.prepared_tool_call_id))
            self._locks.pop(str(self._path(record.prepared_tool_call_id)), None)
        except OSError:
            get_logger(__name__).warning("Canvas operation record cleanup failed", exc_info=True)

    async def consume(
        self, prepared_id: str, confirmation_id: str, operation: str, fingerprint: str
    ) -> PreparedCanvasOperation:
        async with self._locks.setdefault(str(self._path(prepared_id)), asyncio.Lock()):
            record = await self.read(prepared_id)
            if (
                record.state != "approved"
                or record.confirmation_tool_call_id != confirmation_id
                or record.operation != operation
            ):
                raise CanvasDomainError(
                    "CONFIRMATION_REQUIRED",
                    "A matching, explicit human confirmation is required; skipped, timed-out and consumed confirmations cannot authorize execution.",
                )
            if record.fingerprint != fingerprint:
                raise CanvasDomainError(
                    "CONFIRMATION_STALE",
                    "The affected files, versions or descendants changed. Prepare and confirm the current scope again.",
                )
            record.state = "consumed"
            await self.save(record)
            return record
