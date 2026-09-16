"""Update the current custom agent profile through Magic Service."""

import json
from pathlib import Path
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
            "<!--zh: Logo 图片文件路径（如 '.magic/avatars/agent-logo.png' 或 '.magic/avatars/agent-logo.jpg'）或公共对象存储 file_key。"
            "推荐做法：先使用 generate_images 在 .magic/avatars 目录生成图片，再将生成的本地路径直接传入此字段；"
            "update_agent 工具会自动将本地图片上传到公共对象存储并绑定为员工头像。-->"
            "Logo image: pass the local workspace path where generate_images saved the logo "
            "(e.g. '.magic/avatars/agent-logo.png' or '.magic/avatars/agent-logo.jpg') or a public object storage file_key. "
            "The tool automatically uploads the local file to public object storage and sets it as the employee logo."
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
        """将工作区相对/绝对路径上传为公共对象存储 file_key 并清理本地临时头像文件；若已是 key/url 则直接返回。"""
        import os
        from pathlib import Path
        from app.utils.public_storage_uploader import upload_file_to_public_storage

        workspace_dir = PathManager.get_workspace_dir()
        magic_dir = PathManager.get_magic_dir()

        clean_path = icon_file_key.strip().lstrip("/")

        # 1. 尝试工作区相对路径与常见变体（如 .magic/avatars、avatars、拼写容错等）
        path_obj = Path(clean_path)
        candidates = [
            workspace_dir / clean_path,
            magic_dir / clean_path,
            magic_dir / "avatars" / path_obj.name,
            workspace_dir / "avatars" / path_obj.name,
            workspace_dir / path_obj.name,
        ]
        if ".magics" in clean_path:
            fixed_clean_path = clean_path.replace(".magics", ".magic")
            candidates.insert(0, workspace_dir / fixed_clean_path)
            candidates.insert(1, magic_dir / fixed_clean_path.replace(".magic/", "").lstrip("/"))

        seen_paths = set()
        for candidate in candidates:
            cand_str = str(candidate)
            if cand_str in seen_paths:
                continue
            seen_paths.add(cand_str)
            if await async_exists(cand_str) and candidate.is_file():
                try:
                    public_key = await upload_file_to_public_storage(candidate)
                    logger.info(f"本地头像文件上传公共存储成功: {candidate} -> {public_key}")
                    # 上传成功后清理本地临时头像文件及空的 avatars 目录
                    await UpdateAgent._cleanup_local_avatar_file(candidate)
                    return public_key
                except Exception as e:
                    logger.error(f"上传本地头像到公共存储失败: {candidate} ({e})")
                    return None

        # 2. 尝试绝对路径
        if icon_file_key.startswith("/") and await async_exists(icon_file_key):
            abs_path = Path(icon_file_key)
            if abs_path.is_file():
                try:
                    public_key = await upload_file_to_public_storage(icon_file_key)
                    logger.info(f"本地头像绝对路径上传公共存储成功: {icon_file_key} -> {public_key}")
                    await UpdateAgent._cleanup_local_avatar_file(abs_path)
                    return public_key
                except Exception as e:
                    logger.error(f"上传本地头像到公共存储失败: {icon_file_key} ({e})")
                    return None

        # 3. HTTP / HTTPS URL 直接使用
        if icon_file_key.startswith("http://") or icon_file_key.startswith("https://"):
            logger.info(f"icon_file_key 视为直接 URL: {icon_file_key}")
            return icon_file_key

        # 4. 判断是否为本地文件路径特征（若具有本地路径特征但本地文件不存在，报错拦截，禁止误判为远程 key）
        image_extensions = (".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico")
        is_likely_local_path = (
            icon_file_key.startswith(".")
            or "/" in icon_file_key
            or any(icon_file_key.lower().endswith(ext) for ext in image_extensions)
        )
        if is_likely_local_path:
            # 只有具有本地路径前缀（. / avatars / .magic）或图片扩展名且本地不存在时，确认为丢失的本地文件
            if (
                icon_file_key.startswith(".")
                or icon_file_key.startswith("avatars/")
                or icon_file_key.startswith(".magic/")
                or any(icon_file_key.lower().endswith(ext) for ext in image_extensions)
            ):
                logger.error(f"本地头像文件未找到，无法上传: '{icon_file_key}'")
                return None

        # 5. 其他已是对象存储 key 的情况（向后兼容已有合法 key，如 DT001/...）
        if "/" in icon_file_key:
            logger.info(f"icon_file_key 视为已有对象存储 key: {icon_file_key}")
            return icon_file_key

        # 6. 裸文件名且非本地文件，无法确定来源
        logger.error(f"icon_file_key '{icon_file_key}' 无法解析为有效的文件路径或对象存储 key")
        return None

    @staticmethod
    async def _cleanup_local_avatar_file(avatar_path: Path) -> None:
        """上传成功后清理本地临时头像文件，并在 avatars 目录为空时连同目录一起清理。"""
        from app.utils.async_file_utils import async_exists, async_iterdir, async_rmdir, async_unlink
        try:
            if await async_exists(str(avatar_path)):
                await async_unlink(str(avatar_path))
                logger.info(f"已清理本地临时头像文件: {avatar_path}")
            # 若父目录名为 avatars 且已空，则一并清理
            parent_dir = avatar_path.parent
            if parent_dir.name == "avatars" and await async_exists(str(parent_dir)):
                children = await async_iterdir(parent_dir)
                if not children:
                    await async_rmdir(parent_dir)
                    logger.info(f"已清理空头像目录: {parent_dir}")
        except Exception as e:
            logger.warning(f"清理本地头像文件失败（不影响主流程）: {avatar_path} ({e})")

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
