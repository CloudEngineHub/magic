from __future__ import annotations

from playwright.async_api import CDPSession, Page

from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.models.actions import ActionRequest
from magic_use.models.common import ActionKind, JsonValue
from magic_use.models.refs import ElementRefRecord


class PlaywrightActionDispatcher:
    async def dispatch(
        self,
        *,
        page: Page,
        cdp: CDPSession,
        request: ActionRequest,
        record: ElementRefRecord | None,
        backend_node_id: int | None,
    ) -> None:
        if request.action is ActionKind.SCROLL and record is None:
            if request.delta_x == 0 and request.delta_y == 0:
                raise BrowserSDKError(
                    BrowserErrorCode.ACTION_FAILED,
                    "Page scrolling requires a non-zero delta when no element ref is provided",
                )
            await page.mouse.wheel(request.delta_x, request.delta_y)
            return
        if request.action is ActionKind.PRESS and record is None:
            if request.key is None:
                raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Press requires a key")
            await page.keyboard.press(request.key)
            return
        if record is None or backend_node_id is None:
            raise BrowserSDKError(BrowserErrorCode.REF_NOT_FOUND, "This action requires an element ref")
        if request.action is ActionKind.HOVER:
            await self._hover(cdp, backend_node_id)
            return
        if request.action is ActionKind.SCROLL:
            await self._scroll(page, cdp, request, backend_node_id)
            return
        if request.action is ActionKind.UPLOAD:
            if not request.file_paths:
                raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Upload requires at least one file path")
            await cdp.send(
                "DOM.setFileInputFiles",
                {"backendNodeId": backend_node_id, "files": list(request.file_paths)},
            )
            return

        object_id = await self._resolve_object(cdp, backend_node_id)
        try:
            if request.action is ActionKind.CLICK:
                await self._click(cdp, backend_node_id)
            elif request.action is ActionKind.FILL:
                if request.text is None:
                    raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Fill requires text")
                await self._call(
                    cdp,
                    object_id,
                    """
                    function(value) {
                      this.focus();
                      if (this.isContentEditable) {
                        this.textContent = value;
                      } else {
                        const prototype = Object.getPrototypeOf(this);
                        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                        if (descriptor?.set) descriptor.set.call(this, value);
                        else this.value = value;
                      }
                      this.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
                      this.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    """,
                    [request.text],
                )
            elif request.action is ActionKind.PRESS:
                if request.key is None:
                    raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Press requires a key")
                await self._call(cdp, object_id, "function() { this.focus(); }")
                await page.keyboard.press(request.key)
            elif request.action is ActionKind.SELECT:
                if request.value is None:
                    raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Select requires a value")
                await self._call(
                    cdp,
                    object_id,
                    """
                    function(value) {
                      this.value = value;
                      this.dispatchEvent(new Event('input', {bubbles: true}));
                      this.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    """,
                    [request.value],
                )
            elif request.action is ActionKind.CHECK:
                if request.checked is None:
                    raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "Check requires a checked value")
                await self._call(
                    cdp,
                    object_id,
                    """
                    function(checked) {
                      this.checked = checked;
                      this.dispatchEvent(new Event('input', {bubbles: true}));
                      this.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    """,
                    [request.checked],
                )
            else:
                raise BrowserSDKError(
                    BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                    f"Unsupported Playwright action: {request.action.value}",
                )
        finally:
            try:
                await cdp.send("Runtime.releaseObject", {"objectId": object_id})
            except Exception:
                pass

    @staticmethod
    async def _resolve_object(cdp: CDPSession, backend_node_id: int) -> str:
        result = await cdp.send("DOM.resolveNode", {"backendNodeId": backend_node_id})
        remote_object = result.get("object", {})
        object_id = remote_object.get("objectId") if isinstance(remote_object, dict) else None
        if not isinstance(object_id, str):
            raise BrowserSDKError(BrowserErrorCode.STALE_REF, "The target node no longer exists")
        return object_id

    @staticmethod
    async def _call(
        cdp: CDPSession,
        object_id: str,
        function: str,
        arguments: list[JsonValue] | None = None,
    ) -> None:
        params: dict[str, JsonValue] = {
            "objectId": object_id,
            "functionDeclaration": function,
            "awaitPromise": True,
            "userGesture": True,
        }
        if arguments:
            params["arguments"] = [{"value": value} for value in arguments]
        result = await cdp.send("Runtime.callFunctionOn", params)
        exception = result.get("exceptionDetails")
        if isinstance(exception, dict):
            text = exception.get("text")
            raise BrowserSDKError(
                BrowserErrorCode.ACTION_FAILED,
                text if isinstance(text, str) else "Page action failed",
            )

    @staticmethod
    async def _click(cdp: CDPSession, backend_node_id: int) -> None:
        await PlaywrightActionDispatcher._scroll_into_view(cdp, backend_node_id)
        x, y = await PlaywrightActionDispatcher._box_center(cdp, backend_node_id)
        await cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        await cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    @staticmethod
    async def _hover(cdp: CDPSession, backend_node_id: int) -> None:
        await PlaywrightActionDispatcher._scroll_into_view(cdp, backend_node_id)
        x, y = await PlaywrightActionDispatcher._box_center(cdp, backend_node_id)
        await cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})

    @staticmethod
    async def _scroll(page: Page, cdp: CDPSession, request: ActionRequest, backend_node_id: int) -> None:
        if request.delta_x or request.delta_y:
            await PlaywrightActionDispatcher._scroll_into_view(cdp, backend_node_id)
            x, y = await PlaywrightActionDispatcher._box_center(cdp, backend_node_id)
            await page.mouse.move(x, y)
            await page.mouse.wheel(request.delta_x, request.delta_y)
            return
        await PlaywrightActionDispatcher._scroll_into_view(cdp, backend_node_id)

    @staticmethod
    async def _scroll_into_view(cdp: CDPSession, backend_node_id: int) -> None:
        object_id = await PlaywrightActionDispatcher._resolve_object(cdp, backend_node_id)
        try:
            await PlaywrightActionDispatcher._call(
                cdp,
                object_id,
                "function() { this.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'}); }",
            )
        finally:
            try:
                await cdp.send("Runtime.releaseObject", {"objectId": object_id})
            except Exception:
                pass

    @staticmethod
    async def _box_center(cdp: CDPSession, backend_node_id: int) -> tuple[float, float]:
        result = await cdp.send("DOM.getBoxModel", {"backendNodeId": backend_node_id})
        model = result.get("model", {})
        content = model.get("content", []) if isinstance(model, dict) else []
        if not isinstance(content, list) or len(content) < 8:
            raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "The target has no actionable box")
        coordinates = [value for value in content if isinstance(value, (int, float))]
        if len(coordinates) < 8:
            raise BrowserSDKError(BrowserErrorCode.ACTION_FAILED, "The target box is invalid")
        x_values = coordinates[0::2]
        y_values = coordinates[1::2]
        return sum(x_values) / len(x_values), sum(y_values) / len(y_values)
