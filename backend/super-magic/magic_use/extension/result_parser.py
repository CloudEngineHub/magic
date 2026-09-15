from __future__ import annotations

from datetime import datetime, timezone

from magic_use.extension.page_registry import ExtensionPageRegistry
from magic_use.models import BrowserEvent, BrowserEventType, ConsoleEntry, NetworkEntry
from magic_use.models.common import JsonValue
from magic_use.remote_protocol.messages import PageDescriptor


class ExtensionResultParser:
    def __init__(self, session_id: str, pages: ExtensionPageRegistry) -> None:
        self._session_id = session_id
        self._pages = pages

    def event(self, payload: dict[str, JsonValue]) -> BrowserEvent | None:
        method = payload.get("method")
        params = payload.get("params", {})
        if not isinstance(method, str) or not isinstance(params, dict):
            return None
        event_type = _EVENT_TYPES.get(method)
        if event_type is None:
            return None
        page_id = self._pages.page_id_for_token(params.get("page_token"))
        page = None
        if event_type is BrowserEventType.PAGE_OPENED and isinstance(params.get("page"), dict):
            page = self._pages.from_descriptor(PageDescriptor.from_payload(params["page"]))
            page_id = page.id
        event = BrowserEvent(
            type=event_type,
            session_id=self._session_id,
            page_id=page_id,
            occurred_at=datetime.now(timezone.utc),
            data=self._sanitize_event_data(params, page_id=page_id),
        )
        if event_type is BrowserEventType.PAGE_CLOSED and page_id is not None:
            self._pages.forget(page_id)
        return event

    def _sanitize_event_data(
        self,
        value: dict[str, JsonValue],
        *,
        page_id: str | None,
    ) -> dict[str, JsonValue]:
        result: dict[str, JsonValue] = {}
        for key, item in value.items():
            if key in {"page_token", "opener_page_token"}:
                continue
            if key == "page" and isinstance(item, dict):
                result[key] = self._sanitize_page_descriptor(item, page_id)
                continue
            result[key] = self._sanitize_value(item)
        return result

    def _sanitize_page_descriptor(
        self,
        value: dict[str, JsonValue],
        page_id: str | None,
    ) -> dict[str, JsonValue]:
        opener_page_id = self._pages.page_id_for_token(value.get("opener_page_token"))
        return {
            "id": page_id,
            "url": value.get("url") if isinstance(value.get("url"), str) else "",
            "title": value.get("title") if isinstance(value.get("title"), str) else "",
            "active": value.get("active") if isinstance(value.get("active"), bool) else False,
            "document_generation": (
                value.get("document_generation")
                if isinstance(value.get("document_generation"), int)
                else 0
            ),
            "opener_page_id": opener_page_id,
        }

    def _sanitize_value(self, value: JsonValue) -> JsonValue:
        if isinstance(value, dict):
            return {
                key: self._sanitize_value(item)
                for key, item in value.items()
                if key not in {"page_token", "opener_page_token"}
            }
        if isinstance(value, list):
            return [self._sanitize_value(item) for item in value]
        return value

    @classmethod
    def console_entries(cls, page_id: str, value: JsonValue) -> tuple[ConsoleEntry, ...]:
        if not isinstance(value, list):
            return ()
        return tuple(cls._console_entry(page_id, item) for item in value if isinstance(item, dict))

    @classmethod
    def network_entries(cls, page_id: str, value: JsonValue) -> tuple[NetworkEntry, ...]:
        if not isinstance(value, list):
            return ()
        return tuple(cls._network_entry(page_id, item) for item in value if isinstance(item, dict))

    @staticmethod
    def string_tuple(value: JsonValue) -> tuple[str, ...]:
        return tuple(item for item in value if isinstance(item, str)) if isinstance(value, list) else ()

    @classmethod
    def _console_entry(cls, page_id: str, value: dict[str, JsonValue]) -> ConsoleEntry:
        return ConsoleEntry(
            page_id=page_id,
            level=value.get("level") if isinstance(value.get("level"), str) else "log",
            text=value.get("text") if isinstance(value.get("text"), str) else "",
            occurred_at=cls._timestamp(value.get("occurred_at")),
        )

    @classmethod
    def _network_entry(cls, page_id: str, value: dict[str, JsonValue]) -> NetworkEntry:
        status = value.get("status")
        error = value.get("error")
        return NetworkEntry(
            page_id=page_id,
            phase=value.get("phase") if isinstance(value.get("phase"), str) else "request",
            method=value.get("method") if isinstance(value.get("method"), str) else "",
            url=value.get("url") if isinstance(value.get("url"), str) else "",
            status=status if isinstance(status, int) else None,
            error=error if isinstance(error, str) else None,
            occurred_at=cls._timestamp(value.get("occurred_at")),
        )

    @staticmethod
    def _timestamp(value: JsonValue) -> datetime:
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        return datetime.now(timezone.utc)


_EVENT_TYPES = {
    "page.opened": BrowserEventType.PAGE_OPENED,
    "page.closed": BrowserEventType.PAGE_CLOSED,
    "page.activated": BrowserEventType.PAGE_ACTIVATED,
    "navigation.started": BrowserEventType.NAVIGATION_STARTED,
    "navigation.committed": BrowserEventType.NAVIGATION_COMMITTED,
    "navigation.completed": BrowserEventType.NAVIGATION_COMPLETED,
    "navigation.failed": BrowserEventType.NAVIGATION_FAILED,
    "frame.attached": BrowserEventType.FRAME_ATTACHED,
    "frame.detached": BrowserEventType.FRAME_DETACHED,
    "frame.navigated": BrowserEventType.FRAME_NAVIGATED,
    "dialog.opened": BrowserEventType.DIALOG_OPENED,
    "dialog.closed": BrowserEventType.DIALOG_CLOSED,
    "download.started": BrowserEventType.DOWNLOAD_STARTED,
    "download.completed": BrowserEventType.DOWNLOAD_COMPLETED,
    "download.failed": BrowserEventType.DOWNLOAD_FAILED,
    "console": BrowserEventType.CONSOLE,
    "network.request": BrowserEventType.NETWORK_REQUEST,
    "network.response": BrowserEventType.NETWORK_RESPONSE,
    "network.failed": BrowserEventType.NETWORK_FAILED,
}
