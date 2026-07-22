"""Agent 控制接口。

提供 Agent 生命周期管理能力：停止/继续/重启、聊天记录重载、上下文压缩。
沙盒内部使用，端口不对外暴露，无需鉴权。
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agentlang.logger import get_logger
from app.api.http_dto.response import BaseResponse, create_error_response, create_success_response

router = APIRouter(prefix="/v1/agent", tags=["Agent 控制"])
logger = get_logger(__name__)


# ── 请求模型 ────────────────────────────────────────────

class ContinueRequest(BaseModel):
    message: str = Field(default="Continue", description="发送给 Agent 的消息内容")


# ── 内部工具 ────────────────────────────────────────────

def _get_dispatcher():
    from app.service.agent_dispatcher import AgentDispatcher
    return AgentDispatcher.get_instance()


def _get_agent_context():
    return _get_dispatcher().agent_context


def _get_runtime():
    from app.service.agent_runtime import AgentRuntime
    return AgentRuntime.get_instance()


def _get_first_agent():
    """获取主 Context 的缓存 Agent。"""
    context = _get_agent_context()
    if context is None:
        return None
    return _get_runtime().get_cached_agent(context.context_id)


# ── 端点 ─────────────────────────────────────────────────

@router.post("/stop", response_model=BaseResponse)
async def stop_agent() -> BaseResponse:
    """打断当前正在运行的 Agent。

    等价于用户点击"停止"按钮。Agent 会停止当前运行并进入空闲状态。
    如果 Agent 已经空闲，此操作无副作用。
    """
    agent_context = _get_agent_context()
    if not agent_context:
        return create_success_response(data={"stopped": False, "reason": "无活跃的 AgentContext"})

    await agent_context.stop_run(reason="maintenance_stop")
    agent_context.reset_run_state()

    return create_success_response(
        message="Agent 已停止",
        data={"stopped": True},
    )


@router.post("/continue", response_model=BaseResponse)
async def continue_agent(request: ContinueRequest = ContinueRequest()) -> BaseResponse:
    """向 Agent 发送一条消息并让它继续运行。

    等价于用户在聊天框输入消息并发送。会先打断当前运行（如有），
    然后以 CONTINUE 语义提交新消息，触发 Agent 新一轮执行。

    如果之前调用了 restart，此操作会自动重建 Agent 实例。
    """
    from app.core.entity.message.client_message import ChatClientMessage, ContextType

    dispatcher = _get_dispatcher()
    if not dispatcher.is_workspace_initialized:
        return create_error_response(message="工作区未初始化，无法发送消息")

    message = ChatClientMessage(
        message_id=str(uuid.uuid4()),
        prompt=request.message,
        context_type=ContextType.CONTINUE,
    )
    await dispatcher.submit_message(message)

    return create_success_response(
        message="消息已提交，Agent 开始运行",
        data={"message_id": message.message_id, "prompt": request.message},
    )


@router.post("/restart", response_model=BaseResponse)
async def restart_agent() -> BaseResponse:
    """销毁并重建 Agent 实例。不会触发运行。

    销毁缓存的 Agent 实例后，下次收到消息（包括 continue 接口）时
    会自动创建新的 Agent，从磁盘重新加载聊天记录、重新初始化所有状态。

    适用于 Agent 内部状态异常、需要完全重建的情况。
    如果只是想重载聊天记录，用 reload-chat-history 更轻量。
    """
    # 先停止运行
    agent_context = _get_agent_context()
    if agent_context:
        await agent_context.stop_run(reason="maintenance_restart")
        agent_context.reset_run_state()

    if agent_context is None:
        return create_success_response(
            message="无缓存的 Agent 实例，无需重启",
            data={"destroyed": []},
        )

    destroyed = await _get_runtime().invalidate_context(
        agent_context.context_id,
        reason="maintenance_restart",
    )
    if not destroyed:
        return create_success_response(
            message="无缓存的 Agent 实例，无需重启",
            data={"destroyed": []},
        )

    return create_success_response(
        message=f"已销毁 {len(destroyed)} 个 Agent 实例，下次消息时自动重建",
        data={"destroyed": list(destroyed)},
    )


@router.post("/reload-chat-history", response_model=BaseResponse)
async def reload_chat_history() -> BaseResponse:
    """从磁盘重新加载聊天记录到内存。

    典型用法：先 stop → 改文件 → reload。
    会自动先停止当前运行，防止 save() 竞争覆盖你的修改。

    注意：只重载聊天记录，不重建 Agent 实例。如果 Agent 本身状态异常，用 restart。
    """
    # 先停止运行
    agent_context = _get_agent_context()
    if agent_context:
        await agent_context.stop_run(reason="maintenance_reload")
        agent_context.reset_run_state()

    if agent_context is None:
        return create_error_response(message="无缓存的 Agent 实例，无聊天记录可重载")

    agents = _get_runtime().list_cached_agents(agent_context.context_id)
    if not agents:
        return create_error_response(message="无缓存的 Agent 实例，无聊天记录可重载")

    results = {}
    for agent in agents:
        agent_type = agent.agent_name
        ch = agent.chat_history

        old_count = len(ch.messages)
        await ch.reload_from_disk()
        new_count = len(ch.messages)

        results[agent_type] = {
            "reloaded": True,
            "file_path": str(ch._history_file_path),
            "messages_before": old_count,
            "messages_after": new_count,
        }

    return create_success_response(
        message="聊天记录已从磁盘重新加载",
        data={"agents": results},
    )


@router.post("/compact", response_model=BaseResponse)
async def compact_agent() -> BaseResponse:
    """触发上下文压缩。

    向 Agent 聊天记录注入压缩请求，下一次 Agent 运行时会执行压缩。
    如果 Agent 当前空闲，需要再调用 continue 来触发实际压缩执行。

    等价于用户发送 /compact 命令。
    """
    agent = _get_first_agent()
    if not agent:
        return create_error_response(message="无缓存的 Agent 实例")

    message_count = len(agent.chat_history.messages)
    if message_count < 4:
        return create_error_response(
            message=f"消息数过少（{message_count} 条），无法压缩",
        )

    triggered = await agent._try_compact_chat_history_force()
    if not triggered:
        return create_error_response(message="压缩请求注入失败")

    return create_success_response(
        message="压缩请求已注入，调用 continue 接口触发实际执行",
        data={"message_count": message_count},
    )
