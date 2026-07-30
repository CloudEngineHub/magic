"""IM 渠道自动连接监听器，在 AFTER_INIT 后按当前沙箱配置触发自动连接。

仅 magiclaw（Claw）模式的长寿命沙箱允许自动连接 IM 渠道。
非 Claw 沙箱是任务型的（执行完即退出），若启动长连接会导致保活循环阻止沙箱正常退出。
"""
import asyncio

from agentlang.event.data import AfterInitEventData
from agentlang.event.event import Event, EventType
from agentlang.logger import get_logger

from app.core.context.agent_context import AgentContext
from app.service.agent_event.base_listener_service import BaseListenerService

logger = get_logger(__name__)


class ChannelStartupListenerService:

    @staticmethod
    def register_standard_listeners(agent_context: AgentContext) -> None:
        BaseListenerService.register_listeners(agent_context, {
            EventType.AFTER_INIT: ChannelStartupListenerService._handle_after_init,
        })
        logger.info("已注册 IM 渠道自动连接监听器")

    @staticmethod
    async def _handle_after_init(event: Event[AfterInitEventData]) -> None:
        from app.core.keepalive_registry import KeepaliveRegistry

        agent_context = event.data.agent_context
        if not event.data.success or agent_context is None:
            logger.warning("[ChannelStartup] 初始化未成功或 AgentContext 不可用，跳过生命周期与 IM 自动连接")
            return

        keepalive_registry = KeepaliveRegistry.get_instance()
        if not agent_context.is_magiclaw():
            # 非 Claw 沙箱：禁用保活机制并跳过自动连接。
            # 即使 channel 被其他路径手动连接，保活也不会阻止沙箱退出。
            keepalive_registry.set_enabled(False)
            logger.info("[ChannelStartup] 非 magiclaw 模式，已禁用保活并跳过 IM 渠道自动连接")
            return

        try:
            keepalive_registry.set_enabled(True)
            keepalive_registry.notify_activity("magiclaw:init")
            logger.info("[ChannelStartup] MagicClaw 初始化完成，已启动 72 小时滚动保活")
        except Exception as e:
            logger.warning(f"[ChannelStartup] MagicClaw 初始化保活失败，继续连接 IM 渠道: {e}")

        async def _run() -> None:
            try:
                from app.channel.startup import auto_connect_channels_for_current_sandbox
                await auto_connect_channels_for_current_sandbox()
            except Exception as e:
                logger.warning(f"[ChannelStartup] IM 自动连接失败，不影响初始化流程: {e}")

        asyncio.create_task(_run())
