"""Micro-app mention handler (MCP-style).

@micro_app mention 经 magic-service 端 MicroAppMentionNormalizer 规范化后，会带上：
  - app_id / app_name / project_id（顶层）

handler 职责：
  1. handle(): 把 mention 摘要写入 <mentions> 上下文（micro_app:// typed link）
  2. get_tip(): 在已绑定 scope 后给出 MagicBase 使用指引
"""
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from urllib.parse import quote

from app.service.mention.base import BaseMentionHandler
from app.service.mention.utils.micro_app_prompt import (
    MULTI_MICRO_APP_SCOPE_TIP,
    USE_MAGICBASE_SKILL_TIP,
    get_mentioned_micro_app_ids,
    get_micro_app_project_scopes,
    has_bound_micro_app_project_scope,
)

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MicroAppHandler(BaseMentionHandler):
    """Expose the referenced app identity without trusting display metadata."""

    def get_type(self) -> str:
        return "micro_app"

    async def get_tip(
        self, mention: Dict[str, Any], agent_context: Optional["AgentContext"] = None
    ) -> str:
        app_id = str(mention.get("app_id") or mention.get("id") or "").strip()
        if not app_id:
            return "The referenced micro-app is invalid because app_id is missing. Do not call MagicBase."
        if not has_bound_micro_app_project_scope():
            return ""

        scopes = get_micro_app_project_scopes()
        if app_id not in scopes:
            return ""

        mentioned_ids = get_mentioned_micro_app_ids()
        incomplete = bool(mentioned_ids) and set(mentioned_ids) != set(scopes.keys())
        if len(scopes) > 1 or incomplete:
            app_list = ", ".join(
                f"{entry['app_name']} (micro_app://{scope_app_id})"
                for scope_app_id, entry in scopes.items()
            )
            return (
                f"{MULTI_MICRO_APP_SCOPE_TIP} Referenced: {app_list}. "
                f"{USE_MAGICBASE_SKILL_TIP} Do not use display names as authority."
            )

        return (
            f"Micro-app '{app_id}' is explicitly referenced. Use the current authenticated user. "
            f"{USE_MAGICBASE_SKILL_TIP} Inspect and operate its permitted data. Do not use display names "
            "or user-supplied identity fields as authority."
        )

    async def handle(
        self, mention: Dict[str, Any], index: int, agent_context: Optional["AgentContext"] = None
    ) -> List[str]:
        app_id = str(mention.get("app_id") or mention.get("id") or "").strip()
        if not app_id:
            return [f"{index}. micro-app reference is invalid (missing app_id)."]

        app_name = str(mention.get("app_name") or mention.get("name") or app_id).strip()
        label = app_name.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
        target = quote(app_id, safe="-._~")
        return [f"{index}. [{label}](micro_app://{target})"]
