"""Mention context builder"""
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from app.service.mention.base import BaseMentionHandler
from app.service.mention.handlers import (
    AgentHandler,
    DesignMarkerHandler,
    FileHandler,
    MCPHandler,
    ProjectDirectoryHandler,
    ProjectHandler,
    SkillHandler,
    ToolHandler,
)

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MentionContextBuilder:
    """构建mentions的系统上下文信息"""

    # 文件类型的mention类型列表
    FILE_TYPES = ['file', 'project_file', 'upload_file']

    def _create_handlers(self) -> Dict[str, BaseMentionHandler]:
        """为当前构建创建独立的 mention handler，避免并发请求共享聚合状态。"""
        handlers: Dict[str, BaseMentionHandler] = {}

        # 文件处理器处理多种文件类型
        file_handler = FileHandler()
        for file_type in self.FILE_TYPES:
            handlers[file_type] = file_handler

        # 其他处理器
        handlers['mcp'] = MCPHandler()
        handlers['agent'] = AgentHandler()
        handlers['tool'] = ToolHandler()
        handlers['design_marker'] = DesignMarkerHandler()
        handlers['project_directory'] = ProjectDirectoryHandler()
        handlers['project'] = ProjectHandler()
        handlers['skill'] = SkillHandler()
        return handlers

    async def build(self, mentions: List[Dict[str, Any]], agent_context: Optional["AgentContext"] = None) -> str:
        """构建mentions的系统上下文信息（异步）

        Args:
            mentions: mentions字段中的信息列表
            agent_context: 可选的 AgentContext 实例，传给 handler 以支持 horizon 通知注入

        Returns:
            str: 格式化的mentions上下文信息
        """
        if not mentions:
            return ""

        handlers = self._create_handlers()

        # 初始化上下文行
        context_lines = [
            "<mentions>",
            "Referenced files and resources:",
        ]



        # 收集所有 tip 文本（保留顺序，后续去重）
        tip_texts = []
        used_handlers = []
        used_handler_ids = set()

        # 处理每个mention（异步）
        for i, mention in enumerate(mentions, 1):
            mention_type = mention.get('type', 'unknown')

            # 使用对应的handler处理mention（异步）
            handler = handlers.get(mention_type)
            if handler:
                handler_id = id(handler)
                if handler_id not in used_handler_ids:
                    used_handler_ids.add(handler_id)
                    used_handlers.append(handler)

                # 收集 tip 文本，将 agent_context 传给 handler 以支持 horizon push_notification
                tip_text = await handler.get_tip(mention, agent_context)
                if tip_text:  # 只添加非空的 tip
                    tip_texts.append(tip_text)

                # 处理 mention 内容
                lines = await handler.handle(mention, i, agent_context)
                context_lines.extend(lines)
            else:
                # 未知类型的mention
                context_lines.append(f"{i}. reference: {mention}")

        # handler 完成本轮所有 mention 后，收集需要统一生成的提示文本
        for handler in used_handlers:
            final_tip_text = await handler.get_final_tip(agent_context)
            if final_tip_text:
                tip_texts.append(final_tip_text)

        # 添加结束标签
        context_lines.append("")
        context_lines.append("</mentions>")

        # 去重并保留顺序的 tips
        tips = self._deduplicate_tips(tip_texts)
        if tips:
            context_lines.append("")
            context_lines.append("Before proceeding: " + " ".join(tips))

        return "\n".join(context_lines)

    @staticmethod
    def _deduplicate_tips(tip_texts: List[str]) -> List[str]:
        """去重 tip 文本，保留首次出现的顺序

        Args:
            tip_texts: tip 文本列表

        Returns:
            List[str]: 去重后的 tip 文本列表
        """
        seen = set()
        result = []
        for tip in tip_texts:
            if tip not in seen:
                seen.add(tip)
                result.append(tip)
        return result
