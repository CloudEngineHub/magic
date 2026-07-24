"""Agent 可重启上下文的统一捕获与 fork 服务。"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TypeAlias

from agentlang.chat_history.chat_history import ChatHistory, ChatHistoryForkData
from agentlang.chat_history.chat_history_models import ChatMessage
from agentlang.logger import get_logger
from app.core.context.agent_context import AgentContext
from app.core.context.agent_context_registry import AgentContextRegistry
from app.core.horizon.models import HorizonState
from app.core.horizon.store import HorizonStore
from app.core.models.agent_session import AgentSessionRef
from app.utils.async_file_utils import async_exists, async_rename, async_unlink

logger = get_logger(__name__)


AgentForkSource: TypeAlias = AgentContext | AgentSessionRef


class AgentContextSnapshotError(RuntimeError):
    """上下文快照捕获或写入失败。"""


class AgentContextSnapshotSourceError(AgentContextSnapshotError):
    """来源会话不完整、损坏或身份不匹配。"""


class AgentContextSnapshotMaterializeError(AgentContextSnapshotError):
    """目标会话快照提交失败。"""


class AgentSessionAlreadyExistsError(AgentContextSnapshotError):
    """目标会话已经存在，不能通过 fork 覆盖。"""


@dataclass(frozen=True, slots=True)
class AgentContextSnapshot:
    """一个时间点上的完整可重启 Agent 上下文。

    当前可重启上下文由三份持久化内容组成：

        AgentContextSnapshot
        ├─ ChatHistory messages
        ├─ ChatHistory session document  (模型配置、模式等)
        └─ HorizonState                  (已读文件、Skill、通知、环境快照等)

    `AgentContext` 里的 streams、活动任务、tool call、取消状态和运行句柄属于当前
    进程，不应被复制到新 Agent。
    """

    source: AgentSessionRef
    chat_history: ChatHistoryForkData
    horizon_state: HorizonState

    @property
    def messages(self) -> tuple[ChatMessage, ...]:
        """提供给后台压缩做 count、digest 和引用提取。"""
        return self.chat_history.messages


@dataclass(frozen=True, slots=True)
class _TargetFiles:
    history: Path
    session: Path
    horizon: Path

    def values(self) -> tuple[Path, Path, Path]:
        return self.history, self.session, self.horizon


class AgentContextSnapshotService:
    """完整 fork 的唯一编排入口。

    所有 fork 都走同一条路径，调用方不再自己复制 ChatHistory 或 Horizon：

        source
          │
          ├─ live AgentContext      -> 读当前内存 + 当前持久化配置
          └─ AgentSessionRef         -> 读已落盘的 ChatHistory + Horizon
                         │
                         ▼
                    AgentContextSnapshot
                         │
                         ▼
          写三份临时文件 -> 逐份检查目标 -> 移动为正式文件
                         │
                         └─ 任一步失败：删除本次文件，不留下半个会话

    目标会话已有任意一份正式文件时，fork 失败；fork 的语义是创建独立新会话，不是
    覆盖或恢复旧会话。恢复已有会话由调用方明确选择 resume 路径完成。
    """

    _target_locks: dict[tuple[str, str, str], asyncio.Lock] = {}

    async def capture(self, source: AgentForkSource) -> AgentContextSnapshot:
        """优先从 live context 捕获，否则从会话持久化文件恢复。

        当定时任务引用一个当前仍在运行的来源会话时，优先读取 live context，避免把
        尚未落盘的本轮消息误认为不存在；如果来源已经结束，则从 `AgentSessionRef`
        指向的文件恢复，保证 cron 可以在之后独立启动。
        """
        if isinstance(source, AgentSessionRef):
            live_context = self._find_live_context(source)
            if live_context is not None:
                try:
                    return await self._capture_live(live_context)
                except AgentContextSnapshotSourceError:
                    if self._find_live_context(source) is live_context:
                        raise
            return await self._capture_persisted(source)
        if isinstance(source, AgentContext):
            return await self._capture_live(source)
        raise TypeError(f"Unsupported Agent fork source: {type(source)}")

    async def materialize(
        self,
        snapshot: AgentContextSnapshot,
        target: AgentSessionRef,
    ) -> None:
        """把同一快照的全部组件提交为目标会话文件。

        这里采用“先准备，后提交”的顺序：

            [history.tmp, session.tmp, horizon.tmp]
                    │ 三份都写成功
                    ▼
            [history, session, horizon]

        目标文件只允许从不存在变成存在，不允许从旧内容变成新内容。这样两个并发 fork
        不会互相覆盖，也不会让子 Agent 读到只有 ChatHistory 没有 Horizon 的半套上下文。
        """
        target_files = self._target_files(target)
        lock = self._target_lock(target)
        async with lock:
            await self._materialize_snapshot(snapshot, target, target_files)

    async def fork(
        self,
        source: AgentForkSource,
        target: AgentSessionRef,
    ) -> AgentContextSnapshot:
        """捕获来源并立即写入目标会话。"""
        snapshot = await self.capture(source)
        await self.materialize(snapshot, target)
        return snapshot

    async def _capture_live(self, context: AgentContext) -> AgentContextSnapshot:
        """从当前运行中的 Agent 捕获内存中的消息和持久化状态。"""
        source_ref = self._session_ref_from_context(context)
        chat_history = getattr(context, "chat_history", None)
        if not isinstance(chat_history, ChatHistory):
            raise AgentContextSnapshotSourceError(
                f"Live AgentContext has no ChatHistory: {source_ref.target.agent_name}<{source_ref.agent_id}>"
            )

        chat_data = await chat_history.export_fork_data()
        horizon_state = await context.horizon.export_fork_state()
        if horizon_state.agent_id != source_ref.agent_id:
            raise AgentContextSnapshotSourceError(
                f"Live Horizon identity mismatch: expected {source_ref.agent_id}, got {horizon_state.agent_id}"
            )
        return self._build_snapshot(source_ref, chat_data, horizon_state)

    async def _capture_persisted(self, source: AgentSessionRef) -> AgentContextSnapshot:
        """从已经落盘的会话捕获快照，不启动来源 Agent，也不修改来源文件。"""
        try:
            chat_data = await ChatHistory.load_fork_data(
                source.target.agent_name,
                source.agent_id,
                source.chat_history_dir,
            )
            horizon_state = await HorizonStore.load_for_session(
                source.target.agent_name,
                source.agent_id,
                source.chat_history_dir,
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            raise AgentContextSnapshotSourceError(
                f"Failed to load persisted Agent session: {source.target.agent_name}<{source.agent_id}>"
            ) from error

        if horizon_state.agent_id != source.agent_id:
            raise AgentContextSnapshotSourceError(
                f"Persisted Horizon identity mismatch: expected {source.agent_id}, got {horizon_state.agent_id}"
            )
        return self._build_snapshot(source, chat_data, horizon_state)

    @staticmethod
    def _build_snapshot(
        source: AgentSessionRef,
        chat_data: ChatHistoryForkData,
        horizon_state: HorizonState,
    ) -> AgentContextSnapshot:
        return AgentContextSnapshot(
            source=source,
            chat_history=chat_data,
            horizon_state=horizon_state,
        )

    @staticmethod
    def _session_ref_from_context(context: AgentContext) -> AgentSessionRef:
        target = context.get_agent_target()
        agent_id = context.get_agent_id()
        chat_history_dir = context.get_chat_history_dir()
        if target is None:
            raise AgentContextSnapshotSourceError("Live AgentContext has no AgentTarget")
        if not agent_id:
            raise AgentContextSnapshotSourceError("Live AgentContext has no agent_id")
        if not chat_history_dir:
            raise AgentContextSnapshotSourceError("Live AgentContext has no chat history directory")
        return AgentSessionRef(
            target=target,
            agent_id=agent_id,
            chat_history_dir=Path(chat_history_dir),
        )

    def _find_live_context(self, source: AgentSessionRef) -> AgentContext | None:
        for context in AgentContextRegistry.get_instance().list_contexts():
            try:
                live_ref = self._session_ref_from_context(context)
            except AgentContextSnapshotSourceError:
                continue
            if live_ref == source:
                return context
        return None

    @staticmethod
    def _target_files(target: AgentSessionRef) -> _TargetFiles:
        return _TargetFiles(
            history=ChatHistory.history_path_for_session(
                target.target.agent_name,
                target.agent_id,
                target.chat_history_dir,
            ),
            session=ChatHistory.session_path_for_session(
                target.target.agent_name,
                target.agent_id,
                target.chat_history_dir,
            ),
            horizon=HorizonStore.path_for_session(
                target.target.agent_name,
                target.agent_id,
                target.chat_history_dir,
            ),
        )

    @classmethod
    def _target_lock(cls, target: AgentSessionRef) -> asyncio.Lock:
        key = (
            str(target.chat_history_dir),
            target.target.agent_name,
            target.agent_id,
        )
        return cls._target_locks.setdefault(key, asyncio.Lock())

    async def _materialize_snapshot(
        self,
        snapshot: AgentContextSnapshot,
        target: AgentSessionRef,
        target_files: _TargetFiles,
    ) -> None:
        # fork 只创建新会话，不覆盖旧会话。先写带 generation 的临时文件，
        # 再移动到正式文件；这样中途失败时，目标不会留下半套 ChatHistory/Horizon。
        generation = uuid.uuid4().hex
        temp_files = self._generation_files(target_files, generation, "tmp")
        committed: set[Path] = set()

        try:
            if await self._any_target_file_exists(target_files):
                raise AgentSessionAlreadyExistsError(
                    f"Agent session already exists: {target.target.agent_name}<{target.agent_id}>"
                )
            await self._prepare_snapshot_files(snapshot, target, temp_files)
            await self._commit_snapshot_files(target_files, temp_files, committed)
        except asyncio.CancelledError:
            try:
                await asyncio.shield(self._remove_committed_files(committed))
            except Exception as cleanup_error:
                logger.exception(
                    "Failed to clean Agent session after snapshot cancellation: %s",
                    cleanup_error,
                )
            raise
        except AgentSessionAlreadyExistsError:
            await self._remove_committed_files(committed)
            raise
        except Exception as error:
            try:
                await self._remove_committed_files(committed)
            except Exception as cleanup_error:
                raise AgentContextSnapshotMaterializeError(
                    f"Failed to clean up Agent session after materialization failure: "
                    f"{target.target.agent_name}<{target.agent_id}>"
                ) from cleanup_error
            raise AgentContextSnapshotMaterializeError(
                f"Failed to materialize Agent session: {target.target.agent_name}<{target.agent_id}>"
            ) from error
        finally:
            await self._cleanup_files(temp_files.values())

    @staticmethod
    async def _any_target_file_exists(target_files: _TargetFiles) -> bool:
        """只要三个正式文件中有一个存在，就把目标视为已被使用。"""
        for path in target_files.values():
            if await async_exists(path):
                return True
        return False

    @staticmethod
    async def _prepare_snapshot_files(
        snapshot: AgentContextSnapshot,
        target: AgentSessionRef,
        temp_files: _TargetFiles,
    ) -> None:
        """先完整写好三个临时文件，任一失败都不会触碰目标会话。"""
        await ChatHistory.write_fork_data(
            snapshot.chat_history,
            history_path=temp_files.history,
            session_path=temp_files.session,
        )
        await HorizonStore.write_fork_state(
            snapshot.horizon_state,
            target_agent_id=target.agent_id,
            horizon_path=temp_files.horizon,
        )

    @staticmethod
    async def _commit_snapshot_files(
        target_files: _TargetFiles,
        temp_files: _TargetFiles,
        committed: set[Path],
    ) -> None:
        """将已准备好的临时文件移动到不存在的目标路径。

        开头的检查不够：另一个任务可能在准备临时文件期间创建目标。因此每次移动前
        再检查一次，发现竞争时终止，并删除本次已经移动的文件。
        """
        for target_path, temp_path in zip(
            target_files.values(),
            temp_files.values(),
            strict=True,
        ):
            if await async_exists(target_path):
                raise AgentSessionAlreadyExistsError(
                    f"Agent session file appeared during fork: {target_path}"
                )
            await async_rename(temp_path, target_path)
            committed.add(target_path)

    @staticmethod
    def _generation_files(files: _TargetFiles, generation: str, suffix: str) -> _TargetFiles:
        def generation_path(path: Path) -> Path:
            return path.with_name(f".{path.name}.{generation}.{suffix}")

        return _TargetFiles(
            history=generation_path(files.history),
            session=generation_path(files.session),
            horizon=generation_path(files.horizon),
        )

    @staticmethod
    async def _remove_committed_files(committed: set[Path]) -> None:
        """删除本次已提交文件，避免失败后留下只有部分组件的会话。"""
        for path in committed:
            if await async_exists(path):
                await async_unlink(path)

    @staticmethod
    async def _cleanup_files(paths: tuple[Path, Path, Path]) -> None:
        for path in paths:
            try:
                await async_unlink(path)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("Failed to clean Agent snapshot temporary file %s: %s", path, error)


__all__ = [
    "AgentContextSnapshot",
    "AgentContextSnapshotError",
    "AgentContextSnapshotMaterializeError",
    "AgentContextSnapshotService",
    "AgentContextSnapshotSourceError",
    "AgentForkSource",
    "AgentSessionAlreadyExistsError",
]
