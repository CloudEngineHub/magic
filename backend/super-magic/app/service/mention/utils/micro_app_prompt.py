"""Resolve micro-app mention scope for MagicBase operations."""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.resolve_micro_app_parameter import (
    ResolveMicroAppParameter,
)
from app.path_manager import PathManager
from app.utils.async_file_utils import async_chmod, async_unlink, async_write_json
from app.utils.init_client_message_util import InitClientMessageUtil
from app.utils.runtime_storage import ensure_runtime_directory

SCOPE_CAPABILITY_DIR = "micro-app"
SCOPE_FILE_NAME = "scope.json"

MULTI_MICRO_APP_SCOPE_TIP = (
    "Multiple micro-apps are referenced. Pass app_id from the mention on each MagicBase tool call. "
    "For comparison tasks, query each app separately."
)


@dataclass(frozen=True)
class MicroAppProjectScope:
    app_id: str
    project_id: str
    app_name: str

    def to_entry(self) -> Dict[str, str]:
        return {"project_id": self.project_id, "app_name": self.app_name}


def extract_micro_app_mentions(mentions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        mention
        for mention in mentions
        if isinstance(mention, dict) and mention.get("type") == "micro_app"
    ]


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
            if (
                value.get("type") == "mention"
                and isinstance(attrs, dict)
                and attrs.get("type") == "micro_app"
                and isinstance(data, dict)
            ):
                app_id = str(data.get("app_id") or "").strip()
                if app_id and app_id not in seen:
                    seen.add(app_id)
                    found.append(app_id)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(document)
    return found


def _mention_app_id(mention: Dict[str, Any]) -> str:
    return str(mention.get("app_id") or mention.get("id") or "").strip()


def _scope_file() -> Path:
    return PathManager.get_runtime_dir() / SCOPE_CAPABILITY_DIR / SCOPE_FILE_NAME


def _load_scope_document() -> Dict[str, Any]:
    path = _scope_file()
    try:
        if not path.is_file():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _normalize_scopes(raw_scopes: Any) -> Dict[str, Dict[str, str]]:
    if not isinstance(raw_scopes, dict):
        return {}

    scopes: Dict[str, Dict[str, str]] = {}
    for app_id, entry in raw_scopes.items():
        normalized_app_id = str(app_id or "").strip()
        if not normalized_app_id or not isinstance(entry, dict):
            continue
        project_id = str(entry.get("project_id") or "").strip()
        if not project_id:
            continue
        scopes[normalized_app_id] = {
            "project_id": project_id,
            "app_name": str(entry.get("app_name") or normalized_app_id).strip(),
        }
    return scopes


def get_micro_app_project_scopes() -> Dict[str, Dict[str, str]]:
    return _normalize_scopes(_load_scope_document().get("scopes"))


def get_mentioned_micro_app_ids() -> List[str]:
    raw_ids = _load_scope_document().get("mentioned_app_ids") or []
    if not isinstance(raw_ids, list):
        return []

    found: List[str] = []
    seen: set[str] = set()
    for raw_id in raw_ids:
        app_id = str(raw_id or "").strip()
        if app_id and app_id not in seen:
            seen.add(app_id)
            found.append(app_id)
    return found


def has_bound_micro_app_project_scope() -> bool:
    return bool(get_micro_app_project_scopes())


def resolve_magicbase_project_id(app_id: Optional[str] = None) -> str:
    """Resolve the trusted MagicBase project_id for the current mention scope."""
    normalized_app_id = str(app_id or "").strip()
    scopes = get_micro_app_project_scopes()
    mentioned_ids = get_mentioned_micro_app_ids()

    if normalized_app_id:
        if normalized_app_id in scopes:
            return scopes[normalized_app_id]["project_id"]
        raise ValueError(
            f"Micro-app '{normalized_app_id}' is not in the current mention scope. "
            "Use an app_id from this message's @micro_app mentions."
        )

    if scopes:
        complete = (not mentioned_ids) or (set(mentioned_ids) == set(scopes.keys()))
        if len(scopes) == 1 and complete:
            return next(iter(scopes.values()))["project_id"]
        app_list = ", ".join(sorted(set(mentioned_ids) | set(scopes.keys())))
        raise ValueError(
            "Multiple micro-apps are referenced "
            f"({app_list}). Pass app_id from the mention on this MagicBase tool call."
        )

    return ""


async def persist_micro_app_project_scopes(
    scopes: Dict[str, Dict[str, str]],
    mentioned_app_ids: Optional[List[str]] = None,
) -> None:
    """Persist the trusted micro-app registry for MagicBase operations."""
    normalized_mentioned = [
        str(app_id).strip()
        for app_id in (mentioned_app_ids if mentioned_app_ids is not None else scopes.keys())
        if str(app_id).strip()
    ]
    mentioned = list(dict.fromkeys(normalized_mentioned))
    document: Dict[str, Any] = {
        "scopes": scopes,
        "mentioned_app_ids": mentioned,
    }

    scope_file = _scope_file()
    await ensure_runtime_directory(scope_file.parent)
    await async_write_json(scope_file, document, ensure_ascii=False, indent=2)
    await async_chmod(scope_file, 0o600)


async def clear_micro_app_project_scope() -> None:
    """Remove the current-message MagicBase mention scope file."""
    await async_unlink(_scope_file())


async def resolve_micro_app_project_id(app_id: str) -> Optional[str]:
    """Resolve app_id to project_id without persisting scope."""
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
        return str(
            mapping.get("project_id") or mapping.get("project", {}).get("id") or ""
        ).strip() or None
    except Exception:
        return None


async def _scope_entry_from_mention(mention: Dict[str, Any]) -> Optional[MicroAppProjectScope]:
    app_id = _mention_app_id(mention)
    if not app_id:
        return None

    project_id = await resolve_micro_app_project_id(app_id) or ""
    if not project_id:
        return None

    app_name = str(mention.get("app_name") or mention.get("name") or app_id).strip()
    return MicroAppProjectScope(app_id=app_id, project_id=project_id, app_name=app_name)


async def sync_micro_app_scope_from_mentions(
    mentions: List[Dict[str, Any]],
) -> Dict[str, Dict[str, str]]:
    """Bind MagicBase scopes for all structured micro_app mentions in one message."""
    micro_app_mentions = extract_micro_app_mentions(mentions)
    if not micro_app_mentions:
        await clear_micro_app_project_scope()
        return {}

    mentioned_app_ids: List[str] = []
    scopes: Dict[str, Dict[str, str]] = {}
    for mention in micro_app_mentions:
        app_id = _mention_app_id(mention)
        if app_id and app_id not in mentioned_app_ids:
            mentioned_app_ids.append(app_id)
        entry = await _scope_entry_from_mention(mention)
        if entry is None:
            continue
        scopes[entry.app_id] = entry.to_entry()

    if not scopes:
        await clear_micro_app_project_scope()
        return {}

    await persist_micro_app_project_scopes(scopes, mentioned_app_ids=mentioned_app_ids)
    return scopes


async def sync_micro_app_project_scope_from_prompt(prompt: str) -> Optional[str]:
    app_ids = extract_micro_app_app_ids(prompt)
    if not app_ids:
        await clear_micro_app_project_scope()
        return None

    scopes: Dict[str, Dict[str, str]] = {}
    for app_id in app_ids:
        project_id = await resolve_micro_app_project_id(app_id)
        if not project_id:
            continue
        scopes[app_id] = {"project_id": project_id, "app_name": app_id}

    if not scopes:
        await clear_micro_app_project_scope()
        return None

    await persist_micro_app_project_scopes(scopes, mentioned_app_ids=app_ids)
    if len(scopes) == 1 and len(app_ids) == 1:
        return next(iter(scopes.values()))["project_id"]
    return None
