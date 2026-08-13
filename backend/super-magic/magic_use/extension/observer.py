from __future__ import annotations

import base64
from collections.abc import Callable
from dataclasses import replace

from magic_use.config import BrowserRuntimeConfig
from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.extension.page_registry import ExtensionPageRegistry
from magic_use.extension.peer import ExtensionPeer
from magic_use.interaction import RefRegistry, RefResolver
from magic_use.interaction.resolver import ResolvedRef
from magic_use.models import (
    BoundingBox,
    BrowserPage,
    ActionTarget,
    PageElements,
    ScreenshotResult,
    ElementNode,
    ElementQuery,
    ElementScope,
    FindQuery,
    FindResult,
)
from magic_use.models.common import JsonValue
from magic_use.observation import (
    AccessibilityCollector,
    DOMSnapshotCollector,
    PageProbeCollector,
    ElementComposer,
    ElementSourceCollector,
    find_in_elements,
)
from magic_use.observation.sources import ElementSources
from magic_use.remote_protocol import RemoteMethod
from magic_use.scripts import ScriptInjector, ScriptRegistry


class ChromeExtensionObserver:
    def __init__(
        self,
        *,
        config: BrowserRuntimeConfig,
        pages: ExtensionPageRegistry,
        peer_provider: Callable[[], ExtensionPeer],
        logical_session_id: str,
        binary_timeout_seconds: float,
    ) -> None:
        self._config = config
        self._pages = pages
        self._peer_provider = peer_provider
        self._logical_session_id = logical_session_id
        self._binary_timeout_seconds = binary_timeout_seconds
        self._refs = RefRegistry()
        self._resolver = RefResolver(self._refs)
        self._registry = ScriptRegistry()
        self._injector = ScriptInjector(self._registry)
        self._collector = ElementSourceCollector(
            accessibility=AccessibilityCollector(),
            dom_snapshot=DOMSnapshotCollector(),
            page_probe=PageProbeCollector(self._injector),
        )
        self._composer = ElementComposer(self._refs)
        self._snapshots: dict[str, PageElements] = {}

    async def register_document_scripts(self, peer: ExtensionPeer) -> None:
        if self._config.scripts.mask_enabled:
            mask = await self._registry.get("mask")
            await peer.request(
                RemoteMethod.SCRIPT_REGISTER,
                {
                    "name": mask.name,
                    "version": mask.version,
                    "source": mask.source,
                    "source_hash": mask.source_hash,
                    "policy": mask.injection_policy.value,
                    "enabled": True,
                    "disabled_domains": [],
                    "session_override": None,
                },
                logical_session_id=self._logical_session_id,
            )
        pure = await self._registry.get("pure")
        config = self._config.scripts.pure
        await peer.request(
            RemoteMethod.SCRIPT_REGISTER,
            {
                "name": pure.name,
                "version": pure.version,
                "source": pure.source,
                "source_hash": pure.source_hash,
                "policy": pure.injection_policy.value,
                "enabled": config.enabled,
                "disabled_domains": sorted(config.disabled_domains),
                "session_override": config.session_override,
            },
            logical_session_id=self._logical_session_id,
        )
        for script in self._config.scripts.userscripts:
            await peer.request(
                RemoteMethod.SCRIPT_REGISTER,
                {
                    "name": script.name,
                    "version": script.version or "",
                    "source": script.source,
                    "source_hash": script.source_hash,
                    "policy": script.run_at.value.replace("-", "_"),
                    "enabled": script.enabled,
                    "match_patterns": list(script.match_patterns),
                    "exclude_patterns": list(script.exclude_patterns),
                },
                logical_session_id=self._logical_session_id,
            )

    async def evaluate(self, page_id: str, expression: str, argument: JsonValue = None) -> JsonValue:
        return await self.evaluate_token(self._pages.require_token(page_id), expression, argument)

    async def evaluate_token(self, page_token: str, expression: str, argument: JsonValue) -> JsonValue:
        result = await self._peer_provider().request(
            RemoteMethod.PAGE_EVALUATE,
            {"page_token": page_token, "expression": expression, "argument": argument},
            logical_session_id=self._logical_session_id,
        )
        return result.get("result")

    async def read_page(self, page_id: str, scope: str) -> str:
        if not self._config.scripts.lens_enabled:
            raise BrowserSDKError(BrowserErrorCode.CAPABILITY_UNAVAILABLE, "Lens is disabled")
        if scope not in {"viewport", "all"}:
            raise ValueError("Lens scope must be 'viewport' or 'all'")
        page = _RemotePage(self, self._pages.require_token(page_id))
        await self._injector.ensure(page, "lens")
        result = await page.evaluate("scope => globalThis.MagicLens.readAsMarkdown(scope)", scope)
        if not isinstance(result, str):
            raise BrowserSDKError(BrowserErrorCode.SNAPSHOT_FAILED, "Lens returned a non-text result")
        plain_length = await page.evaluate("() => (document.body?.innerText || '').length")
        if isinstance(plain_length, int) and plain_length > 500 and len(result) < plain_length * 0.2:
            result += (
                "\n\n[Most of this page's text is inside forms, buttons, lists, or iframes, "
                "which this reader skips. This is not a loading delay. "
                "Use browser_read_html to see the real markup.]"
            )
        return result

    async def read_html(
        self,
        page: BrowserPage,
        *,
        ref: str | None,
        detail: str,
        max_chars: int,
    ) -> tuple[str, bool]:
        page_token = self._pages.require_token(page.id)
        remote_page = _RemotePage(self, page_token)
        await self._injector.ensure(remote_page, "outline")
        options = {"detail": detail, "max_chars": max_chars}
        if ref is None:
            result = await remote_page.evaluate(
                "options => globalThis.MagicOutline.read(document.body, options)",
                options,
            )
        else:
            record = self._refs.resolve(
                ref,
                page_id=page.id,
                document_generation=page.document_generation,
            )
            payload = await self._peer_provider().request(
                RemoteMethod.OBSERVATION_OUTLINE,
                {
                    "page_token": page_token,
                    "backend_node_id": record.backend_node_id,
                    "options": options,
                },
                logical_session_id=self._logical_session_id,
            )
            result = payload.get("result")
        if not isinstance(result, dict) or not isinstance(result.get("content"), str):
            raise BrowserSDKError(BrowserErrorCode.SNAPSHOT_FAILED, "HTML outline returned an invalid result")
        return result["content"], result.get("truncated") is True

    async def snapshot(
        self,
        page: BrowserPage,
        options: ElementQuery,
        *,
        update_baseline: bool = True,
    ) -> PageElements:
        sources = await self.collect_sources(page.id)
        effective_options = ElementQuery(
            scope=options.scope,
            root_ref=options.root_ref,
            max_nodes=min(options.max_nodes, self._config.elements.max_nodes),
            max_depth=min(options.max_depth, self._config.elements.max_depth),
        )
        previous = self._snapshots.get(page.id)
        projection_scope = self._projection_scope(options.scope, previous)
        snapshot = self._composer.compose(
            session_id=page.session_id,
            page_id=page.id,
            document_generation=page.document_generation,
            url=page.url,
            title=page.title,
            sources=sources,
            options=effective_options,
            previous=previous,
            projection_scope=projection_scope,
        )
        if update_baseline:
            self._snapshots[page.id] = replace(
                snapshot,
                scope=projection_scope,
                diff=None,
            )
        return snapshot

    async def find(self, page: BrowserPage, query: FindQuery) -> FindResult:
        sources = await self.collect_sources(page.id)
        max_nodes = max(1, len(sources.accessibility) + len(sources.dom) + len(sources.probe))
        elements = self._composer.compose(
            session_id=page.session_id,
            page_id=page.id,
            document_generation=page.document_generation,
            url=page.url,
            title=page.title,
            sources=sources,
            options=ElementQuery(scope=ElementScope.FULL, max_nodes=max_nodes, max_depth=1_000),
            previous=None,
            projection_scope=ElementScope.FULL,
        )
        return find_in_elements(elements, query)

    async def resolve_ref(self, page: BrowserPage, ref: str) -> ResolvedRef:
        sources = await self.collect_sources(page.id)
        return self._resolver.resolve(
            ref,
            page_id=page.id,
            document_generation=page.document_generation,
            dom_nodes=sources.dom,
            accessibility_nodes=sources.accessibility,
        )

    def describe_ref(self, page: BrowserPage, ref: str) -> ActionTarget:
        record = self._refs.resolve(
            ref,
            page_id=page.id,
            document_generation=page.document_generation,
        )
        return ActionTarget.from_ref_record(record)

    async def screenshot(self, page: BrowserPage, *, full_page: bool, labels: bool) -> ScreenshotResult:
        page_token = self._pages.require_token(page.id)
        if not labels:
            result = await self._peer_provider().request(
                RemoteMethod.PAGE_SCREENSHOT,
                {"page_token": page_token, "full_page": full_page},
                logical_session_id=self._logical_session_id,
            )
            return ScreenshotResult(
                page_id=page.id,
                image=await self._decode_image(result),
                full_page=full_page,
            )
        return await self._labeled_screenshot(page, page_token, full_page)

    async def collect_sources(self, page_id: str) -> ElementSources:
        page_token = self._pages.require_token(page_id)
        return await self._collector.collect(
            cdp=_RemoteCDPClient(self._peer_provider(), self._logical_session_id, page_token),
            page=_RemotePage(self, page_token),
        )

    def clear_page(self, page_id: str) -> None:
        self._snapshots.pop(page_id, None)
        self._refs.clear_page(page_id)

    def clear(self) -> None:
        for page_id in self._pages.page_ids:
            self.clear_page(page_id)

    async def _labeled_screenshot(
        self,
        page: BrowserPage,
        page_token: str,
        full_page: bool,
    ) -> ScreenshotResult:
        if not self._config.scripts.marker_enabled:
            raise BrowserSDKError(BrowserErrorCode.CAPABILITY_UNAVAILABLE, "Marker is disabled")
        if full_page:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "Labeled screenshots currently support the viewport only",
            )
        snapshot = await self.snapshot(
            page,
            ElementQuery(scope=ElementScope.INTERACTIVE),
            update_baseline=False,
        )
        marker_items: list[dict[str, JsonValue]] = []
        labels: list[tuple[str, str]] = []
        for record in snapshot.refs:
            node = self._node_for_ref(snapshot, record.ref)
            if (
                record.bounding_box is None
                or node is None
                or not node.visible
                or not node.in_viewport
                or node.occluded
            ):
                continue
            label = f"A{len(labels) + 1}"
            labels.append((label, record.ref))
            marker_items.append(
                {
                    "ref": record.ref,
                    "label": label,
                    "kind": "fill" if record.role in {"textbox", "searchbox", "combobox", "listbox"} else "click",
                    "disabled": "disabled" in node.states,
                    "rect": rect_payload(record.bounding_box),
                }
            )
        remote_page = _RemotePage(self, page_token)
        await self._injector.ensure(remote_page, "marker")
        try:
            await remote_page.evaluate("items => globalThis.MagicMarker.render(items)", marker_items)
            await remote_page.evaluate("() => new Promise(requestAnimationFrame)")
            result = await self._peer_provider().request(
                RemoteMethod.PAGE_SCREENSHOT,
                {"page_token": page_token, "full_page": False},
                logical_session_id=self._logical_session_id,
            )
        finally:
            await self._injector.clear_marker(remote_page)
        return ScreenshotResult(
            page_id=page.id,
            image=await self._decode_image(result),
            full_page=False,
            labels=tuple(labels),
        )

    async def _decode_image(self, payload: dict[str, JsonValue]) -> bytes:
        transfer = payload.get("binary_transfer")
        if isinstance(transfer, dict):
            transfer_id = transfer.get("transfer_id")
            chunk_count = transfer.get("chunk_count")
            if isinstance(transfer_id, str) and isinstance(chunk_count, int) and chunk_count > 0:
                return await self._peer_provider().receive_binary_transfer(
                    transfer_id=transfer_id,
                    chunk_count=chunk_count,
                    timeout_seconds=self._binary_timeout_seconds,
                )
        encoded = payload.get("image_base64")
        if not isinstance(encoded, str):
            raise BrowserSDKError(BrowserErrorCode.SCREENSHOT_FAILED, "Chrome extension returned no screenshot data")
        return base64.b64decode(encoded, validate=True)

    @staticmethod
    def _projection_scope(scope: ElementScope, previous: PageElements | None) -> ElementScope:
        if scope is not ElementScope.CHANGES:
            return scope
        if previous is not None and previous.scope in {
            ElementScope.INTERACTIVE,
            ElementScope.VIEWPORT,
            ElementScope.FULL,
        }:
            return previous.scope
        return ElementScope.INTERACTIVE

    @staticmethod
    def _node_for_ref(snapshot: PageElements, ref: str) -> ElementNode | None:
        stack = list(snapshot.root_nodes)
        while stack:
            node = stack.pop()
            if node.ref == ref:
                return node
            stack.extend(node.children)
        return None


class _RemoteCDPClient:
    def __init__(self, peer: ExtensionPeer, logical_session_id: str, page_token: str) -> None:
        self._peer = peer
        self._logical_session_id = logical_session_id
        self._page_token = page_token

    async def send(self, method: str, params: dict[str, JsonValue] | None = None) -> dict[str, JsonValue]:
        remote_method = {
            "Accessibility.getFullAXTree": RemoteMethod.OBSERVATION_ACCESSIBILITY,
            "DOMSnapshot.captureSnapshot": RemoteMethod.OBSERVATION_DOM_SNAPSHOT,
        }.get(method)
        if remote_method is None:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                f"The Chrome extension backend does not expose CDP method: {method}",
            )
        return await self._peer.request(
            remote_method,
            {"page_token": self._page_token, "params": params or {}},
            logical_session_id=self._logical_session_id,
        )


class _RemotePage:
    def __init__(self, observer: ChromeExtensionObserver, page_token: str) -> None:
        self._observer = observer
        self._page_token = page_token

    async def evaluate(self, expression: str, arg: JsonValue = None) -> JsonValue:
        return await self._observer.evaluate_token(self._page_token, expression, arg)


def rect_payload(rect: BoundingBox) -> dict[str, JsonValue]:
    return {
        "x": rect.x,
        "y": rect.y,
        "width": rect.width,
        "height": rect.height,
    }
