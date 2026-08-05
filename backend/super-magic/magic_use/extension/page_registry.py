from __future__ import annotations

from uuid import uuid4

from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.models import BrowserPage, PageReadiness, PageState
from magic_use.models.common import JsonValue
from magic_use.remote_protocol import PageDescriptor


class ExtensionPageRegistry:
    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._page_id_by_token: dict[str, str] = {}
        self._page_token_by_id: dict[str, str] = {}

    @property
    def page_ids(self) -> tuple[str, ...]:
        return tuple(self._page_token_by_id)

    def from_descriptor(self, descriptor: PageDescriptor) -> BrowserPage:
        page_id = self._page_id_by_token.get(descriptor.page_token)
        if page_id is None:
            page_id = f"page_{uuid4().hex}"
            self._page_id_by_token[descriptor.page_token] = page_id
            self._page_token_by_id[page_id] = descriptor.page_token
        opener_page_id = (
            self._page_id_by_token.get(descriptor.opener_page_token)
            if descriptor.opener_page_token is not None
            else None
        )
        return BrowserPage(
            id=page_id,
            session_id=self._session_id,
            target_id=f"extension:{page_id}",
            url=descriptor.url,
            title=descriptor.title,
            state=PageState.OPEN,
            active=descriptor.active,
            opener_page_id=opener_page_id,
            document_generation=descriptor.document_generation,
            readiness=PageReadiness.UNKNOWN,
        )

    def from_payload(self, value: JsonValue) -> tuple[BrowserPage, ...]:
        if not isinstance(value, list):
            return ()
        return tuple(
            self.from_descriptor(PageDescriptor.from_payload(item))
            for item in value
            if isinstance(item, dict)
        )

    def sync_payload(self, value: JsonValue) -> tuple[BrowserPage, ...]:
        if not isinstance(value, list):
            return ()
        descriptors = tuple(PageDescriptor.from_payload(item) for item in value if isinstance(item, dict))
        active_tokens = {descriptor.page_token for descriptor in descriptors}
        for page_token, page_id in tuple(self._page_id_by_token.items()):
            if page_token not in active_tokens:
                self.forget(page_id)
        return tuple(self.from_descriptor(descriptor) for descriptor in descriptors)

    def require_token(self, page_id: str) -> str:
        page_token = self._page_token_by_id.get(page_id)
        if page_token is None:
            raise BrowserSDKError(BrowserErrorCode.PAGE_NOT_FOUND, f"Browser page does not exist: {page_id}")
        return page_token

    def page_id_for_token(self, page_token: JsonValue) -> str | None:
        return self._page_id_by_token.get(page_token) if isinstance(page_token, str) else None

    def forget(self, page_id: str) -> None:
        page_token = self._page_token_by_id.pop(page_id, None)
        if page_token is not None:
            self._page_id_by_token.pop(page_token, None)

    def clear(self) -> None:
        self._page_id_by_token.clear()
        self._page_token_by_id.clear()
