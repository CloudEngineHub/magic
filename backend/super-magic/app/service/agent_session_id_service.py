"""Agent 会话 ID 的统一分配与占用检查。"""

from __future__ import annotations

import asyncio

from agentlang.utils.file import generate_safe_filename
from app.tools.subagent_runtime_store import SubagentRuntimeStore
from app.tools.subagent_session_manager import subagent_session_manager


class AgentSessionIdService:
    """为新 Agent 会话分配可读且不复用的 ID。

    Agent 只提供基础名称，例如 ``market-research``；本服务返回真正的会话地址，
    例如 ``market-research-2``。后续等待或恢复必须使用这个最终 ID，不能再次使用基础名称。

    分配过程可以看成一个全局通讯录：

        请求名 `market-research`
                    │
                    ├─ 已占用 `market-research-1`
                    ├─ 已被 cron 配置预留 `market-research-2`
                    └─ 返回新的 `market-research-3`

    这个序号只解决“新建时找一个不冲突的名字”；它不代表继续旧会话。继续旧会话必须
    直接提供完整最终 ID，并显式使用 `resume=true`。
    """

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
            # 同一个工具调用可能因为网络重试再次进入这里。重试必须拿到第一次分配的 ID，
            # 否则一次调用可能先创建 `research-1`，重试时又误创建 `research-2`。
            request_key = (
                (agent_name, requested_id, request_id)
                if request_id
                else None
            )
            if request_key is not None and request_key in cls._request_reservations:
                return cls._request_reservations[request_key]

            # ID 需要全局唯一，而不是只在某个 agent_name 下唯一：wait_for_subagents
            # 只接收 agent_id，`magic<research-1>` 和 `explore<research-1>` 无法被安全区分。
            claimed_ids = set(cls._reserved)
            claimed_ids.update(await SubagentRuntimeStore.list_agent_ids())
            claimed_ids.update(await cls._persisted_cron_agent_ids())

            # Cron 可能已经把最终 ID 写入任务文件，但任务尚未第一次执行；这种 ID
            # 也必须算作已占用，否则服务重启后新增任务会重复得到相同的会话地址。
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
