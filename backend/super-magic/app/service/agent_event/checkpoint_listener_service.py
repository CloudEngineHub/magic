# -*- coding: utf-8 -*-
"""
Checkpoint事件监听服务

这个模块负责监听主代理运行事件与聊天历史变更事件：
- 每个用户回合开始前创建 checkpoint，并保存聊天历史 initial 整目录快照
  （= 上一回合结束状态，作为 undo 恢复源）。
- 每次聊天记录保存后，把整个聊天历史目录重新复制进当前 checkpoint 的
  latest 快照（作为 redo 恢复源）。

聊天历史运行期位于本地普通目录（``.chat_history/``），不在 magicfs
挂载范围内，magicfs 无法按文件记录内容帧，因此由 Python 侧整目录复制
补充进 checkpoint；回滚时由 RollbackExecutor 按方向恢复。
"""

from pathlib import Path

from app.core.context.agent_context import AgentContext
from app.service.checkpoint_service import CheckpointService
from app.service.agent_event.base_listener_service import BaseListenerService
from app.utils.checkpoint_utils import CheckpointUtils
from app.infrastructure.checkpoint.chat_history_snapshot_manager import ChatHistorySnapshotManager
from app.infrastructure.checkpoint.storage import CheckpointStorage
from app.path_manager import PathManager
from agentlang.event.event import Event, EventType
from agentlang.event.data import BeforeMainAgentRunEventData, ChatHistoryChangedEventData
from agentlang.logger import get_logger

logger = get_logger(__name__)


class CheckpointListenerService:
    """Checkpoint 事件监听服务。

    checkpoint 只由主 Agent 创建。checkpoint 创建本身只是登记 manifest
    与目录骨架；挂载内的工作区与 topic 变更由 magicfs 的 checkpoint hook
    依据 manifest 自动入账，聊天历史则由本监听器整目录快照进 checkpoint。
    """

    @staticmethod
    def register_standard_listeners(agent_context: AgentContext) -> None:
        """注册checkpoint相关的事件监听器"""
        event_listeners = {
            EventType.BEFORE_MAIN_AGENT_RUN: CheckpointListenerService._handle_before_main_agent_run,
            EventType.CHAT_HISTORY_CHANGED: CheckpointListenerService._handle_chat_history_changed,
        }

        BaseListenerService.register_listeners(agent_context, event_listeners)
        logger.info("已注册checkpoint事件监听器")

    @staticmethod
    async def _handle_before_main_agent_run(event: Event[BeforeMainAgentRunEventData]) -> None:
        """处理主代理运行前事件，创建checkpoint"""
        try:
            agent_context = event.data.agent_context

            # 创建checkpoint
            checkpoint_service = CheckpointService()
            await checkpoint_service.initialize()

            # 检查是否需要创建checkpoint
            if not await CheckpointUtils.should_create_checkpoint(agent_context):
                logger.info("不需要创建checkpoint，跳过")
                return

            # 获取消息ID
            message_id = CheckpointUtils.get_current_checkpoint_context(agent_context)
            checkpoint_info = await checkpoint_service.create_checkpoint(message_id)

            # 在 checkpoint 创建后，保存 initial chat_history 快照
            await CheckpointListenerService._save_initial_chat_history_snapshot(message_id, agent_context)

            # 将checkpoint信息存储到代理上下文中供后续使用
            CheckpointUtils.set_current_checkpoint(agent_context, checkpoint_info)

            logger.info(f"为消息创建checkpoint: {message_id}")

        except Exception as e:
            logger.error(f"创建checkpoint失败: {e}")

    @staticmethod
    async def _save_initial_chat_history_snapshot(checkpoint_id: str, agent_context: AgentContext) -> None:
        """保存 initial chat_history 快照（在 checkpoint 创建时调用）。

        此时用户消息尚未追加，目录内容即上一回合结束状态，回滚到此
        checkpoint 之前时以它为 undo 恢复源。
        """
        try:
            storage = CheckpointStorage()
            chat_history_manager = ChatHistorySnapshotManager()

            initial_snapshot_dir = storage.get_initial_chat_history_snapshots_dir(checkpoint_id)

            success = await chat_history_manager.create_initial_chat_history_snapshot(
                initial_snapshot_dir,
                agent_name=agent_context.agent_name,
                agent_id=agent_context.get_agent_id() or "main",
                chat_history_dir=Path(PathManager.get_chat_history_dir()),
            )

            if success:
                logger.info(f"成功保存 initial chat_history 快照到 checkpoint {checkpoint_id}")
            else:
                logger.error(f"保存 initial chat_history 快照到 checkpoint {checkpoint_id} 失败")

        except Exception as e:
            logger.error(f"保存 initial chat_history 快照失败: {e}", exc_info=True)

    @staticmethod
    async def _handle_chat_history_changed(event: Event[ChatHistoryChangedEventData]) -> None:
        """处理聊天历史变更事件，把整个聊天历史目录重新备份进当前checkpoint。

        快照源取规范目录而非事件携带的目录，保证与恢复目标对称；
        事件数据只用于日志定位。
        """
        try:
            event_data = event.data
            logger.debug(f"处理聊天历史变更事件: agent={event_data.agent_name}, file={event_data.file_path}")

            # 获取当前checkpoint ID
            current_checkpoint_id = await CheckpointUtils.get_current_checkpoint_position()

            if not current_checkpoint_id:
                logger.debug("当前没有活跃的checkpoint，跳过聊天历史备份")
                return

            storage = CheckpointStorage()
            chat_history_manager = ChatHistorySnapshotManager()

            latest_snapshot_dir = storage.get_latest_chat_history_snapshots_dir(current_checkpoint_id)

            success = await chat_history_manager.create_latest_chat_history_snapshot(
                latest_snapshot_dir,
                agent_name=event_data.agent_name,
                agent_id=event_data.agent_id,
                chat_history_dir=Path(PathManager.get_chat_history_dir()),
            )

            if success:
                logger.debug(f"成功备份 latest chat_history 到 checkpoint {current_checkpoint_id}")
            else:
                logger.error(f"备份 latest chat_history 到 checkpoint {current_checkpoint_id} 失败")

        except Exception as e:
            logger.error(f"处理聊天历史变更事件失败: {e}", exc_info=True)
