"""Agent 会话 ID 的统一分配与占用检查。"""

from __future__ import annotations

import asyncio

from agentlang.utils.file import generate_safe_filename
from app.tools.subagent_runtime_store import SubagentRuntimeStore
from app.tools.subagent_session_manager import subagent_session_manager


class AgentSessionIdService:
    """为新 Agent 会话分配可读且不复用的 ID。"""

    _lock = asyncio.Lock()
    _reserved: set[str] = set()
    _request_reservations: dict[tuple[str, str, str], str] = {}

    @classmethod
    async def session_exists(cls, agent_name: str, agent_id: str) -> bool:
        """检查可继续的运行中或持久化会话是否存在。"""
        if await subagent_session_manager.has_session(agent_name, agent_id):
            return True
        return await SubagentRuntimeStore.session_exists(agent_name, agent_id)

    @classmethod
    async def _persisted_cron_agent_ids(cls) -> set[str]:
        """读取尚未创建会话、但已由 Cron 配置预留的固定 ID。"""
        from app.service.cron.store import scan_jobs

        jobs, _ = await scan_jobs({})
        return {
            job.payload.agent_id
            for job in jobs
            if job.payload.agent_id is not None
        }

    @classmethod
    async def allocate(
        cls,
        agent_name: str,
        requested_id: str,
        request_id: str | None = None,
    ) -> str:
        """为 Agent 提供的可读 ID 追加序号，已结束会话的编号也不复用。"""
        base = generate_safe_filename(requested_id).replace("_", "-") or "agent"
        async with cls._lock:
            request_key = (
                (agent_name, requested_id, request_id)
                if request_id
                else None
            )
            if request_key is not None and request_key in cls._request_reservations:
                return cls._request_reservations[request_key]

            claimed_ids = set(cls._reserved)
            claimed_ids.update(await SubagentRuntimeStore.list_agent_ids())
            claimed_ids.update(await cls._persisted_cron_agent_ids())

            sequence = 1
            while True:
                agent_id = f"{base}-{sequence}"
                if agent_id not in claimed_ids:
                    cls._reserved.add(agent_id)
                    if request_key is not None:
                        cls._request_reservations[request_key] = agent_id
                    return agent_id
                sequence += 1


__all__ = ["AgentSessionIdService"]
