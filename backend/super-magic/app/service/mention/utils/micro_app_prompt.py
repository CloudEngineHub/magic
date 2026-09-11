"""Resolve micro-app mention scope for MagicBase operations."""
import json
from typing import Any, List, Optional

from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.resolve_micro_app_parameter import (
    ResolveMicroAppParameter,
)
from app.utils.init_client_message_util import InitClientMessageUtil


def extract_micro_app_app_ids(prompt: str) -> List[str]:
    try:
        document = json.loads(prompt)
    except (TypeError, json.JSONDecodeError):
        return []
    found: List[str] = []
    seen: set[str] = set()
    def visit(value: Any) -> None:
        if isinstance(value, dict):
            attrs = value.get("attrs")
            data = attrs.get("data") if isinstance(attrs, dict) else None
            if value.get("type") == "mention" and isinstance(attrs, dict) and attrs.get("type") == "micro_app" and isinstance(data, dict):
                app_id = str(data.get("app_id") or "").strip()
                if app_id and app_id not in seen:
                    seen.add(app_id); found.append(app_id)
            for child in value.values(): visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    visit(document)
    return found


async def sync_micro_app_project_scope_from_prompt(prompt: str) -> Optional[str]:
    app_ids = extract_micro_app_app_ids(prompt)
    if len(app_ids) != 1:
        return None
    return await resolve_and_persist_micro_app_project_scope(app_ids[0])


async def resolve_and_persist_micro_app_project_scope(app_id: str) -> Optional[str]:
    """Resolve app_id to project_id and persist trusted MagicBase scope."""
    normalized_app_id = str(app_id or "").strip()
    if not normalized_app_id:
        return None
    try:
        metadata = InitClientMessageUtil.get_metadata()
        mapping = await get_magic_service_sdk().micro_app.resolve_project_async(
            normalized_app_id,
            ResolveMicroAppParameter(
                authorization=InitClientMessageUtil.get_user_authorization(),
                organization_code=metadata.get("organization_code"),
            ),
        )
        project_id = str(
            mapping.get("project_id") or mapping.get("project", {}).get("id") or ""
        ).strip()
        if project_id:
            metadata["micro_app_project_id"] = project_id
            InitClientMessageUtil.save_metadata(metadata, source="micro_app_mention")
        return project_id or None
    except Exception:
        return None
