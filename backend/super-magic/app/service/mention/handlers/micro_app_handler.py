"""Micro-app mention handler (MCP-style).

@micro_app mention 经 magic-service 端 MicroAppMentionNormalizer 规范化后，会带上：
  - app_id / app_name / project_id（顶层）

handler 职责：
  1. handle(): 把 mention 摘要写入 <mentions> 上下文（micro_app:// typed link）
  2. get_tip(): 解析 app_id → project_id 并写入 metadata，推送 horizon 指引
"""
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from urllib.parse import quote

from app.service.mention.base import BaseMentionHandler
from app.service.mention.utils.micro_app_prompt import resolve_and_persist_micro_app_project_scope

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
        project_id = await resolve_and_persist_micro_app_project_scope(app_id)
        if not project_id:
            return f"Micro-app '{app_id}' could not be resolved. Do not call MagicBase."
        return (
            f"Micro-app '{app_id}' is explicitly referenced. Use the current authenticated user and "
            "the use-magicbase skill to inspect and operate its permitted data. Do not use display names "
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
