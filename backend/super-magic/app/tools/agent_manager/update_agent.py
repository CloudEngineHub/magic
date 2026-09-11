"""Update the current custom agent profile through Magic Service."""

import json
from typing import Any, Dict, Optional

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.shadow_code import ShadowCode
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool
from app.utils.async_file_utils import async_exists, async_read_text, async_write_text

logger = get_logger(__name__)


class UpdateAgentParams(BaseToolParams):
    name_i18n: Optional[Dict[str, str]] = Field(
        default=None, description='i18n name dict, e.g. {"zh_CN": "...", "en_US": "..."}'
    )
    description_i18n: Optional[Dict[str, str]] = Field(
        default=None, description='i18n description dict, e.g. {"zh_CN": "...", "en_US": "..."}'
    )
    role_i18n: Optional[Dict[str, Any]] = Field(
        default=None, description="Structured i18n role definition, keys are zh_CN and en_US"
    )
    prompt: Optional[str] = Field(default=None, description="New system prompt plain text")
    icon_file_key: Optional[str] = Field(
        default=None, description="Logo file_key returned by generate_images and synced to object storage"
    )


@tool()
class UpdateAgent(BaseTool[UpdateAgentParams]):
    """<!--zh
    更新当前正在编辑的员工服务端配置。支持名称、角色、描述、提示词和 Logo 的部分更新。
    Logo 应传入对象存储 file_key；工具会同步 icon、icon_type 和 file_key。
    -->
    Update the current employee's server profile, including identity, prompt, and logo.
    """

    async def execute(self, tool_context: ToolContext, params: UpdateAgentParams) -> ToolResult:
        from app.core.context.agent_context import AgentContext
        from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
        from app.infrastructure.sdk.magic_service.parameter.update_agent_parameter import UpdateAgentParameter

        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        agent_code = agent_context.get_agent_code() if agent_context else None
        if not agent_code:
            return ToolResult.error("No agent code found in current context.")

        if not any(
            value is not None
            for value in [
                params.name_i18n,
                params.description_i18n,
                params.role_i18n,
                params.prompt,
                params.icon_file_key,
            ]
        ):
            return ToolResult.error("At least one field must be provided.")

        prompt_shadow = None
        if params.prompt is not None:
            prompt_json = json.dumps(
                {"version": "1.0.0", "structure": {"string": params.prompt}},
                ensure_ascii=False,
            )
            prompt_shadow = ShadowCode.shadow(prompt_json)

        icon = None
        icon_type = None
        if params.icon_file_key is not None:
            icon = {"type": "Image", "value": params.icon_file_key}
            icon_type = 2

        try:
            parameter = UpdateAgentParameter(
                code=agent_code,
                name_i18n=params.name_i18n,
                description_i18n=params.description_i18n,
                role_i18n=params.role_i18n,
                prompt_shadow=prompt_shadow,
                icon=icon,
                icon_type=icon_type,
            )
            await get_magic_service_sdk().agent.update_agent_async(parameter)
            await self._update_local_cache(agent_code, params, icon, icon_type)
            return ToolResult(
                content=f"Agent {agent_code} profile updated successfully.",
                extra_info={"agent_code": agent_code},
            )
        except Exception as error:
            logger.error(f"Failed to update agent: {error}")
            return ToolResult.error(f"Failed to update agent: {error}")

    @staticmethod
    async def _update_local_cache(
        agent_code: str,
        params: UpdateAgentParams,
        icon: Optional[Dict[str, Any]],
        icon_type: Optional[int],
    ) -> None:
        cache_path = PathManager.get_magic_dir() / "agent.json"
        if not await async_exists(cache_path):
            return
        try:
            profile = json.loads(await async_read_text(cache_path))
            if params.name_i18n:
                profile["name_i18n"] = {**profile.get("name_i18n", {}), **params.name_i18n}
            if params.description_i18n:
                profile["description_i18n"] = {
                    **profile.get("description_i18n", {}), **params.description_i18n
                }
            if params.role_i18n is not None:
                profile["role_i18n"] = params.role_i18n
            if params.prompt is not None:
                profile["prompt"] = params.prompt
            if icon is not None:
                profile["icon"] = icon
                profile["icon_type"] = icon_type
            await async_write_text(cache_path, json.dumps(profile, ensure_ascii=False, indent=2))
        except Exception as error:
            logger.warning(f"Failed to update local agent cache: {error}")
