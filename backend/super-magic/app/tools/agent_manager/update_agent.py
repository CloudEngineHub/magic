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

logger = get_logger(__name__)


class UpdateAgentParams(BaseToolParams):
    name_zh: Optional[str] = Field(default=None, description="员工中文名称")
    name_en: Optional[str] = Field(default=None, description="员工英文名称")
    description_zh: Optional[str] = Field(default=None, description="员工中文描述")
    description_en: Optional[str] = Field(default=None, description="员工英文描述")
    role_i18n: Optional[Dict[str, Any]] = Field(
        default=None, description="结构化多语言角色定义，键为 zh_CN、en_US"
    )
    prompt: Optional[str] = Field(default=None, description="新的系统提示词明文")
    icon_file_key: Optional[str] = Field(
        default=None, description="generate_images 返回并已同步到对象存储的 Logo file_key"
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
            return ToolResult(ok=False, content="未找到当前正在编辑的员工编号。")

        supplied_fields = [
            params.name_zh,
            params.name_en,
            params.description_zh,
            params.description_en,
            params.role_i18n,
            params.prompt,
            params.icon_file_key,
        ]
        if not any(value is not None for value in supplied_fields):
            return ToolResult(ok=False, content="至少需要提供一个要更新的字段。")

        name_i18n = self._build_i18n(params.name_zh, params.name_en)
        description_i18n = self._build_i18n(params.description_zh, params.description_en)
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
                name_i18n=name_i18n,
                description_i18n=description_i18n,
                role_i18n=params.role_i18n,
                prompt_shadow=prompt_shadow,
                icon=icon,
                icon_type=icon_type,
            )
            await get_magic_service_sdk().agent.update_agent_async(parameter)
            self._update_local_cache(agent_code, params, name_i18n, description_i18n, icon, icon_type)
            return ToolResult(
                content=f"员工 {agent_code} 的服务端配置已更新。",
                extra_info={"agent_code": agent_code},
            )
        except Exception as error:
            logger.error(f"Failed to update agent: {error}")
            return ToolResult(ok=False, content=f"更新员工信息失败：{error}")

    @staticmethod
    def _build_i18n(zh_value: Optional[str], en_value: Optional[str]) -> Optional[Dict[str, str]]:
        values = {}
        if zh_value is not None:
            values["zh_CN"] = zh_value
        if en_value is not None:
            values["en_US"] = en_value
        return values or None

    @staticmethod
    def _update_local_cache(
        agent_code: str,
        params: UpdateAgentParams,
        name_i18n: Optional[Dict[str, str]],
        description_i18n: Optional[Dict[str, str]],
        icon: Optional[Dict[str, Any]],
        icon_type: Optional[int],
    ) -> None:
        cache_path = PathManager.get_magic_dir() / "agent.json"
        if not cache_path.exists():
            return
        try:
            profile = json.loads(cache_path.read_text(encoding="utf-8"))
            if name_i18n:
                profile["name_i18n"] = {**profile.get("name_i18n", {}), **name_i18n}
            if description_i18n:
                profile["description_i18n"] = {
                    **profile.get("description_i18n", {}), **description_i18n
                }
            if params.role_i18n is not None:
                profile["role_i18n"] = params.role_i18n
            if params.prompt is not None:
                profile["prompt"] = params.prompt
            if icon is not None:
                profile["icon"] = icon
                profile["icon_type"] = icon_type
            cache_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as error:
            logger.warning(f"Failed to update local agent cache: {error}")