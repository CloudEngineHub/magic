from __future__ import annotations

from dataclasses import replace
from urllib.parse import urlparse

from playwright.async_api import Page

from magic_use.config import BrowserScriptConfig, ElementScanConfig
from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.interaction.ref_registry import RefRegistry
from magic_use.models.actions import ScreenshotResult
from magic_use.models.common import ElementScope
from magic_use.models.find import FindQuery, FindResult
from magic_use.models.elements import PageElements, ElementNode, ElementQuery
from magic_use.observation import (
    AccessibilityCollector,
    DOMSnapshotCollector,
    PageProbeCollector,
    ElementComposer,
    ElementSourceCollector,
    find_in_elements,
)
from magic_use.playwright.state import PlaywrightPageHandle
from magic_use.scripts import ScriptInjector, ScriptRegistry
from magic_use.userscripts import UserscriptRegistry, UserscriptRunAt


class PlaywrightObserver:
    def __init__(
        self,
        *,
        scripts: BrowserScriptConfig,
        elements_config: ElementScanConfig,
        refs: RefRegistry,
    ) -> None:
        self.registry = ScriptRegistry()
        self.injector = ScriptInjector(self.registry)
        self._scripts = scripts
        self._userscripts = UserscriptRegistry(scripts.userscripts)
        self._snapshot_config = elements_config
        self._refs = refs
        self._collector = ElementSourceCollector(
            accessibility=AccessibilityCollector(),
            dom_snapshot=DOMSnapshotCollector(),
            page_probe=PageProbeCollector(self.injector),
        )
        self._composer = ElementComposer(refs)
        self._snapshots: dict[str, PageElements] = {}

    async def inject_document_scripts(self, page: Page) -> None:
        hostname = urlparse(page.url).hostname or ""
        if self._scripts.pure.enabled_for(hostname):
            await self.injector.ensure(page, "pure")
        await self._run_userscripts(page, UserscriptRunAt.DOCUMENT_END)
        await self._run_userscripts(page, UserscriptRunAt.DOCUMENT_IDLE)

    async def _run_userscripts(self, page: Page, run_at: UserscriptRunAt) -> None:
        for script in self._userscripts.matching(page.url, run_at):
            try:
                await page.evaluate(
                    """
                    payload => {
                      const loaded = globalThis.__magicUseUserscripts || {};
                      if (loaded[payload.name] === payload.hash) return;
                      (0, eval)(payload.source);
                      globalThis.__magicUseUserscripts = globalThis.__magicUseUserscripts || {};
                      globalThis.__magicUseUserscripts[payload.name] = payload.hash;
                    }
                    """,
                    {"name": script.name, "hash": script.source_hash, "source": script.source},
                )
            except Exception:
                # Userscript 是页面增强插件，单个脚本失败不能阻断页面主流程。
                continue

    async def read_page(self, handle: PlaywrightPageHandle, scope: str) -> str:
        if not self._scripts.lens_enabled:
            raise BrowserSDKError(BrowserErrorCode.CAPABILITY_UNAVAILABLE, "Lens is disabled")
        if scope not in {"viewport", "all"}:
            raise ValueError("Lens scope must be 'viewport' or 'all'")
        await self.injector.ensure(handle.page, "lens")
        result = await handle.page.evaluate(
            "scope => globalThis.MagicLens.readAsMarkdown(scope)",
            scope,
        )
        if not isinstance(result, str):
            raise BrowserSDKError(BrowserErrorCode.SNAPSHOT_FAILED, "Lens returned a non-text result")
        plain_length = await handle.page.evaluate("() => (document.body?.innerText || '').length")
        if isinstance(plain_length, int) and plain_length > 500 and len(result) < plain_length * 0.2:
            result += (
                "\n\n[Most of this page's text is inside forms, buttons, lists, or iframes, "
                "which this reader skips. This is not a loading delay. "
                "Use browser_read_html to see the real markup.]"
            )
        return result

    async def read_html(
        self,
        handle: PlaywrightPageHandle,
        *,
        ref: str | None,
        detail: str,
        max_chars: int,
    ) -> tuple[str, bool]:
        if handle.cdp is None:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "HTML outline reading requires a Chromium CDP session",
            )
        await self.injector.ensure(handle.page, "outline")
        options = {"detail": detail, "max_chars": max_chars}
        if ref is None:
            result = await handle.page.evaluate(
                "options => globalThis.MagicOutline.read(document.body, options)",
                options,
            )
        else:
            record = self._refs.resolve(
                ref,
                page_id=handle.page_id,
                document_generation=handle.document_generation,
            )
            resolved = await handle.cdp.send(
                "DOM.resolveNode",
                {"backendNodeId": record.backend_node_id},
            )
            remote_object = resolved.get("object", {})
            object_id = remote_object.get("objectId") if isinstance(remote_object, dict) else None
            if not isinstance(object_id, str) or not object_id:
                raise BrowserSDKError(BrowserErrorCode.REF_NOT_FOUND, f"Cannot resolve element ref: {ref}")
            called = await handle.cdp.send(
                "Runtime.callFunctionOn",
                {
                    "objectId": object_id,
                    "functionDeclaration": "function(options) { return globalThis.MagicOutline.read(this, options); }",
                    "arguments": [{"value": options}],
                    "returnByValue": True,
                },
            )
            call_result = called.get("result", {})
            result = call_result.get("value") if isinstance(call_result, dict) else None
        if not isinstance(result, dict) or not isinstance(result.get("content"), str):
            raise BrowserSDKError(BrowserErrorCode.SNAPSHOT_FAILED, "HTML outline returned an invalid result")
        return result["content"], result.get("truncated") is True

    async def snapshot(
        self,
        *,
        session_id: str,
        handle: PlaywrightPageHandle,
        options: ElementQuery,
        update_baseline: bool = True,
    ) -> PageElements:
        if handle.cdp is None:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "Structured snapshots require a Chromium CDP session",
            )
        effective_options = ElementQuery(
            scope=options.scope,
            root_ref=options.root_ref,
            max_nodes=min(options.max_nodes, self._snapshot_config.max_nodes),
            max_depth=min(options.max_depth, self._snapshot_config.max_depth),
        )
        sources = await self._collector.collect(cdp=handle.cdp, page=handle.page)
        previous = self._snapshots.get(handle.page_id)
        projection_scope = self._projection_scope(options.scope, previous)
        snapshot = self._composer.compose(
            session_id=session_id,
            page_id=handle.page_id,
            document_generation=handle.document_generation,
            url=handle.page.url,
            title=await handle.page.title(),
            sources=sources,
            options=effective_options,
            previous=previous,
            projection_scope=projection_scope,
        )
        if update_baseline:
            self._snapshots[handle.page_id] = replace(
                snapshot,
                scope=projection_scope,
                diff=None,
            )
        return snapshot

    async def find(
        self,
        *,
        session_id: str,
        handle: PlaywrightPageHandle,
        query: FindQuery,
    ) -> FindResult:
        if handle.cdp is None:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "Semantic element finding requires a Chromium CDP session",
            )
        sources = await self._collector.collect(cdp=handle.cdp, page=handle.page)
        max_nodes = max(1, len(sources.accessibility) + len(sources.dom) + len(sources.probe))
        elements = self._composer.compose(
            session_id=session_id,
            page_id=handle.page_id,
            document_generation=handle.document_generation,
            url=handle.page.url,
            title=await handle.page.title(),
            sources=sources,
            options=ElementQuery(scope=ElementScope.FULL, max_nodes=max_nodes, max_depth=1_000),
            previous=None,
            projection_scope=ElementScope.FULL,
        )
        return find_in_elements(elements, query)

    async def screenshot(
        self,
        *,
        session_id: str,
        handle: PlaywrightPageHandle,
        full_page: bool,
        labels: bool,
    ) -> ScreenshotResult:
        if not labels:
            image = await handle.page.screenshot(full_page=full_page, type="png")
            return ScreenshotResult(page_id=handle.page_id, image=image, full_page=full_page)

        if not self._scripts.marker_enabled:
            raise BrowserSDKError(BrowserErrorCode.CAPABILITY_UNAVAILABLE, "Marker is disabled")
        if full_page:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "Labeled screenshots currently support the viewport only",
            )

        snapshot = await self.snapshot(
            session_id=session_id,
            handle=handle,
            options=ElementQuery(scope=ElementScope.INTERACTIVE),
            update_baseline=False,
        )
        marker_items: list[dict[str, object]] = []
        label_pairs: list[tuple[str, str]] = []
        for record in snapshot.refs:
            rect = record.bounding_box
            node = self._node_for_ref(snapshot, record.ref)
            if rect is None or node is None or not node.visible or not node.in_viewport or node.occluded:
                continue
            label = f"A{len(label_pairs) + 1}"
            label_pairs.append((label, record.ref))
            marker_items.append(
                {
                    "ref": record.ref,
                    "label": label,
                    "kind": self._marker_kind(record.role),
                    "disabled": "disabled" in node.states,
                    "rect": {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height},
                }
            )

        await self.injector.ensure(handle.page, "marker")
        try:
            await handle.page.evaluate("items => globalThis.MagicMarker.render(items)", marker_items)
            await handle.page.evaluate("() => new Promise(requestAnimationFrame)")
            image = await handle.page.screenshot(full_page=False, type="png")
        finally:
            await self.injector.clear_marker(handle.page)
        return ScreenshotResult(
            page_id=handle.page_id,
            image=image,
            full_page=False,
            labels=tuple(label_pairs),
        )

    def clear_page(self, page_id: str) -> None:
        self._snapshots.pop(page_id, None)
        self._refs.clear_page(page_id)

    def clear(self) -> None:
        self._snapshots.clear()
        self._refs.clear()

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
    def _marker_kind(role: str) -> str:
        if role in {"textbox", "searchbox", "combobox", "listbox"}:
            return "fill"
        return "click"

    @staticmethod
    def _node_for_ref(snapshot: PageElements, ref: str) -> ElementNode | None:
        stack = list(snapshot.root_nodes)
        while stack:
            node = stack.pop()
            if node.ref == ref:
                return node
            stack.extend(node.children)
        return None
