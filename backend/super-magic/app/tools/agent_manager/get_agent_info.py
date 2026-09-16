"""Read the current custom agent profile from Magic Service."""

import asyncio
import json

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.shadow_code import ShadowCode

from app.tools.core import BaseTool, BaseToolParams, tool

logger = get_logger(__name__)


class GetAgentInfoParams(BaseToolParams):
    """No arguments are required; the target comes from AgentContext."""


@tool()
class GetAgentInfo(BaseTool[GetAgentInfoParams]):
    """<!--zh
    获取当前正在编辑的员工详情，包括名称、角色、描述、提示词、Logo 和已绑定技能。
    -->
    Get the current employee profile, including identity, prompt, logo, and bound skills.
    """

    async def execute(self, tool_context: ToolContext, params: GetAgentInfoParams) -> ToolResult:
        from app.core.context.agent_context import AgentContext
        from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
        from app.infrastructure.sdk.magic_service.parameter.get_agent_openapi_parameter import GetAgentOpenApiParameter

        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        agent_code = agent_context.get_agent_code() if agent_context else None
        if not agent_code:
            return ToolResult.error("No agent code found in current context.")

        try:
            sdk = get_magic_service_sdk()
            result = await asyncio.to_thread(
                sdk.agent.get_agent_by_code,
                GetAgentOpenApiParameter(code=agent_code),
            )

            prompt = result.get_prompt_string()
            if prompt:
                try:
                    prompt = ShadowCode.unshadow(prompt)
                except Exception as error:
                    logger.warning(f"Failed to decode agent prompt: {error}")

            profile = {
                "code": result.code,
                "name_i18n": result.name_i18n,
                "role_i18n": result.role_i18n,
                "description_i18n": result.description_i18n,
                "prompt": prompt or "",
                "icon": result.icon,
                "icon_type": result.icon_type,
                "skills": [skill.to_dict() for skill in result.skills],
            }

            return ToolResult(content=json.dumps(profile, ensure_ascii=False, indent=2))
        except Exception as error:
            logger.error(f"Failed to get agent info: {error}")
            return ToolResult.error(f"Failed to get agent info: {error}")
