"""Update the current custom agent profile through Magic Service."""

import json
from typing import Any, Dict, Optional

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.shadow_code import ShadowCode
from pydantic import Field, field_validator

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool
from app.utils.async_file_utils import async_exists, async_read_text, async_write_text

logger = get_logger(__name__)


def _parse_i18n_json_string(value: Any) -> Any:
    """兼容模型将 i18n 字段误传为 JSON 字符串的情况，自动解析为 dict。"""
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"expected a JSON object, got an unparsable string: {value!r}"
            ) from error
        if not isinstance(parsed, dict):
            raise ValueError(f"expected a JSON object, got {type(parsed).__name__}: {parsed!r}")
        return parsed
    return value


def _normalize_role_i18n(value: Any) -> Any:
    """将角色 i18n 的单个字符串兼容为 Magic Service 要求的数组。"""
    if not isinstance(value, dict):
        return value
    return {
        locale: [locale_value] if isinstance(locale_value, str) else locale_value
        for locale, locale_value in value.items()
    }


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
        default=None,
        description=(
            "<!--zh: Logo 图片路径（工作区相对路径）或公共对象存储 file_key。"
            "推荐做法：先用 generate_images 生成图片，再将返回的工作区相对路径（如 'avatars/logo.png'）传入此字段；"
            "工具会自动将本地图片上传到公共对象存储并解析为公共 file_key。"
            "禁止传入不含路径分隔符的裸文件名（如 'logo.jpg'），否则会报错。-->"
            "Logo image: pass the workspace-relative path returned by generate_images "
            "(e.g. 'avatars/logo.png'). The tool automatically uploads the local file "
            "to public object storage and resolves it to the public file_key. Do NOT pass a bare filename without a "
            "path separator (e.g. 'logo.jpg') — use generate_images first."
        ),
    )

    _parse_name_i18n = field_validator("name_i18n", mode="before")(_parse_i18n_json_string)
    _parse_description_i18n = field_validator("description_i18n", mode="before")(
        _parse_i18n_json_string
    )
    _parse_role_i18n = field_validator("role_i18n", mode="before")(_parse_i18n_json_string)
    _normalize_role_i18n = field_validator("role_i18n", mode="after")(_normalize_role_i18n)


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
            resolved_key = await self._resolve_icon_key(params.icon_file_key)
            if resolved_key is None:
                return ToolResult.error(
                    f"Image '{params.icon_file_key}' is not a valid workspace path or object storage file_key. "
                    "Please use generate_images first, then pass the returned workspace-relative path."
                )
            icon = {"type": "Image", "value": resolved_key}
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
                file_key=resolved_key if params.icon_file_key is not None else None,
            )
            await get_magic_service_sdk().agent.update_agent_async(parameter)
            await self._update_local_cache(agent_code, params, icon, icon_type)
            return ToolResult(
                content=f"Agent {agent_code} profile updated successfully.",
                data={"code": agent_code},
                extra_info={"agent_code": agent_code},
            )
        except Exception as error:
            logger.error(f"Failed to update agent: {error}")
            return ToolResult.error(f"Failed to update agent: {error}")

    @staticmethod
    async def _resolve_icon_key(icon_file_key: str) -> Optional[str]:
        """将工作区相对/绝对路径上传为公共对象存储 file_key；若已是 key/url 则直接返回。"""
        from app.utils.public_storage_uploader import upload_file_to_public_storage

        workspace_dir = PathManager.get_workspace_dir()

        # 1. 尝试工作区相对路径
        candidate = workspace_dir / icon_file_key.lstrip("/")
        if await async_exists(str(candidate)):
            try:
                public_key = await upload_file_to_public_storage(candidate)
                logger.info(f"本地头像文件上传公共存储成功: {candidate} -> {public_key}")
                return public_key
            except Exception as e:
                logger.error(f"上传本地头像到公共存储失败: {candidate} ({e})")
                return None

        # 2. 尝试绝对路径
        if icon_file_key.startswith("/") and await async_exists(icon_file_key):
            try:
                public_key = await upload_file_to_public_storage(icon_file_key)
                logger.info(f"本地头像绝对路径上传公共存储成功: {icon_file_key} -> {public_key}")
                return public_key
            except Exception as e:
                logger.error(f"上传本地头像到公共存储失败: {icon_file_key} ({e})")
                return None

        # 3. HTTP / HTTPS URL 直接使用
        if icon_file_key.startswith("http://") or icon_file_key.startswith("https://"):
            logger.info(f"icon_file_key 视为直接 URL: {icon_file_key}")
            return icon_file_key

        # 4. 含路径分隔符且非本地文件，视为已是对象存储 key（向后兼容）
        if "/" in icon_file_key:
            logger.info(f"icon_file_key 视为对象存储 key（直接使用）: {icon_file_key}")
            return icon_file_key

        # 5. 裸文件名（无路径分隔符），无法确定来源
        logger.error(f"icon_file_key '{icon_file_key}' 是裸文件名，既不是工作区路径也不是 file_key")
        return None

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
