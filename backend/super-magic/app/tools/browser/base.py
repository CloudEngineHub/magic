"""Browser Code Mode 工具共享执行与展示能力。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Mapping
from pathlib import Path
from typing import Generic, TypeVar

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.attachment import AttachmentStorageType
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.service.browser import BrowserScreenshotService, BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.browser.presentation import BrowserDetailBuilder, BrowserRemarkBuilder
from app.tools.core import BaseToolParams
from magic_use.errors import BrowserErrorCode, BrowserSDKError

P = TypeVar("P", bound=BaseToolParams)

logger = get_logger(__name__)

_RECOVERY_HINTS: Mapping[BrowserErrorCode, str] = {
    BrowserErrorCode.STALE_REF: "Take a fresh interactive snapshot and retry with a current ref.",
    BrowserErrorCode.AMBIGUOUS_REF: "Take a fresh interactive snapshot and retry with a current ref.",
    BrowserErrorCode.REF_NOT_FOUND: "This ref never existed on this page. Take a snapshot and use a ref from it.",
    BrowserErrorCode.PAGE_NOT_FOUND: "List pages to get a valid page ID, or open a new page.",
    BrowserErrorCode.PAGE_CLOSED: "This page is gone. Open a new page and navigate again.",
    BrowserErrorCode.PAGE_EXPIRED: "The page lease expired. Open a new page, or call keep alive earlier next time.",
    BrowserErrorCode.SESSION_CLOSED: "The browser session ended. Open a page to start a new one.",
    BrowserErrorCode.NAVIGATION_FAILED: "The URL did not load. Check the URL, then retry once with wait_until set to commit.",
    BrowserErrorCode.ACTION_FAILED: "The element did not accept the action. Take a fresh snapshot to check whether it is still visible and enabled.",
    BrowserErrorCode.SNAPSHOT_FAILED: "The page was not in a readable state. Wait for the load state, then snapshot again.",
    BrowserErrorCode.SCREENSHOT_FAILED: "The screenshot could not be captured. Wait for the load state and retry once.",
    BrowserErrorCode.RESOURCE_LIMIT: "Too many pages or sessions are open. Close pages you no longer need.",
    BrowserErrorCode.CAPABILITY_UNAVAILABLE: "This browser backend does not support the operation. Use a different approach.",
    BrowserErrorCode.SCRIPT_INJECTION_FAILED: "The script could not be injected. Check it for syntax errors.",
    BrowserErrorCode.SCRIPT_NOT_FOUND: "The requested built-in script is not registered. This is a configuration problem, not a page problem.",
    BrowserErrorCode.CONNECTION_FAILED: "The browser is unreachable. Report this instead of retrying.",
    BrowserErrorCode.BACKEND_UNAVAILABLE: "The browser backend is not available. Report this instead of retrying.",
    BrowserErrorCode.VERSION_MISMATCH: "The browser and the controller versions do not match. Report this instead of retrying.",
    BrowserErrorCode.INVALID_CONFIG: "The browser configuration is invalid. Report this instead of retrying.",
}


class BrowserToolBase(AbstractFileTool[P], Generic[P]):
    """Browser Skill 的 Code Mode Only 工具基类。"""

    operation_key = "browser.unknown_operation"

    async def execute_safely(self, operation: Awaitable[ToolResult]) -> ToolResult:
        try:
            return await operation
        except asyncio.CancelledError:
            raise
        except BrowserSDKError as exc:
            logger.warning("Browser SDK operation failed: %s", exc, exc_info=True)
            return ToolResult.error(
                self._model_error_message(exc),
                data={"error_code": exc.code.value},
                extra_info={
                    "error_code": exc.code.value,
                    "user_error": self._error_message(exc.code),
                },
            )

        except (TypeError, ValueError) as exc:
            return ToolResult.error(
                f"Browser request is invalid: {exc}",
                data={"error_code": "invalid_request"},
                extra_info={
                    "error_code": "invalid_request",
                    "user_error": self._message("browser.error.invalid_request"),
                },
            )
        except Exception as exc:
            logger.exception("Unexpected Browser tool error")
            return ToolResult.error(
                f"Browser operation failed because of an unexpected error: {exc}",
                data={"error_code": "unexpected_error"},
                extra_info={
                    "error_code": "unexpected_error",
                    "user_error": self._message("browser.error.unexpected"),
                },
            )

    async def record_page_observation(
        self,
        tool_context: ToolContext,
        *,
        page_id: str,
        url: str,
        title: str,
    ) -> None:
        """把观察工具成功返回的页面状态登记到 Horizon。"""
        try:
            await self.get_horizon(tool_context).record_browser_page_observation(
                page_id=page_id,
                url=url,
                title=title,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Browser page observation could not be recorded", exc_info=True)

    async def execute_state_change(
        self,
        tool_context: ToolContext,
        operation: Awaitable[ToolResult],
        *,
        page_id: str | None,
        session_id: str | None,
    ) -> ToolResult:
        result = await self.execute_safely(operation)
        target_page_id = page_id or self._result_page_id(result)
        if target_page_id is None:
            return result
        try:
            page, screenshot = await BrowserService(tool_context).screenshot(
                target_page_id,
                full_page=False,
                labels=False,
                session_id=session_id,
            )
            artifact = await BrowserScreenshotService(tool_context).publish(screenshot.image)
            BrowserToolResultBuilder.attach_screenshot(result, page, screenshot, artifact)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Browser state-change screenshot failed", exc_info=True)
        return result

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, str]:
        normalized_arguments = arguments or {}
        target = None
        page_id = normalized_arguments.get("page_id")
        ref = normalized_arguments.get("ref")
        session_id = normalized_arguments.get("session_id")
        if isinstance(page_id, str) and isinstance(ref, str):
            try:
                target = await BrowserService(tool_context).describe_ref(
                    page_id,
                    ref,
                    session_id if isinstance(session_id, str) else None,
                )
            except asyncio.CancelledError:
                raise
            except BrowserSDKError:
                # remark 是最佳努力展示，失效 ref 仍由真实工具调用返回完整错误。
                target = None
        return BrowserRemarkBuilder.before(
            tool_name=tool_name,
            action=self._operation_name(),
            arguments=normalized_arguments,
            target=target,
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, str]:
        return BrowserRemarkBuilder.after(
            tool_name=tool_name,
            action=self._operation_name(),
            result=result,
            arguments=arguments or {},
        )

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        output_path = result.data.get("output_path")
        if self.name == "browser_screenshot" and result.ok and isinstance(output_path, str) and output_path:
            relative_file_path = Path(output_path).as_posix()
            return ToolDetail(
                type=DisplayType.IMAGE,
                data=FileContent(
                    file_name=Path(relative_file_path).name,
                    content="",
                    relative_file_path=relative_file_path,
                    storage_type=AttachmentStorageType.WORKSPACE,
                ),
            )
        presentation = BrowserDetailBuilder.presentation(
            self._operation_name(),
            result,
            tool_name=self.name,
            arguments=arguments or {},
        )
        return BrowserDetailBuilder.detail(
            presentation,
            file_key=self._screenshot_file_key(result),
            file_size=self._screenshot_file_size(result),
            file_url=self._screenshot_file_url(result),
        )

    def _operation_name(self) -> str:
        return self._message(self.operation_key)

    def _error_message(self, code: BrowserErrorCode) -> str:
        return self._message(f"browser.error.{code.value}")

    @staticmethod
    def _model_error_message(error: BrowserSDKError) -> str:
        prefix = f"Browser operation failed [{error.code.value}]: {error}"
        hint = _RECOVERY_HINTS.get(error.code)
        return f"{prefix} {hint}" if hint else prefix

    @staticmethod
    def _message(key: str, **kwargs: object) -> str:
        return i18n.translate(key, category="tool.messages", **kwargs)

    @staticmethod
    def _page_data(result: ToolResult) -> dict[str, object]:
        page = result.data.get("page")
        if isinstance(page, dict):
            return page
        action = result.data.get("action")
        if isinstance(action, dict):
            navigation = action.get("navigation")
            if isinstance(navigation, dict):
                navigation_page = navigation.get("page")
                if isinstance(navigation_page, dict):
                    return navigation_page
        return {}

    @staticmethod
    def _result_page_id(result: ToolResult) -> str | None:
        direct_page_id = result.data.get("page_id")
        if isinstance(direct_page_id, str) and direct_page_id:
            return direct_page_id
        page = BrowserToolBase._page_data(result)
        page_id = page.get("page_id") if page else None
        if isinstance(page_id, str) and page_id:
            return page_id
        action = result.data.get("action")
        if isinstance(action, dict):
            action_page_id = action.get("page_id")
            if isinstance(action_page_id, str) and action_page_id:
                return action_page_id
        return None

    @staticmethod
    def _screenshot_file_key(result: ToolResult) -> str | None:
        file_key = result.extra_info.get("browser_screenshot_file_key")
        return file_key if isinstance(file_key, str) and file_key else None

    @staticmethod
    def _screenshot_file_size(result: ToolResult) -> int:
        file_size = result.extra_info.get("browser_screenshot_file_size")
        return file_size if isinstance(file_size, int) and file_size >= 0 else 0

    @staticmethod
    def _screenshot_file_url(result: ToolResult) -> str | None:
        file_url = result.extra_info.get("browser_screenshot_file_url")
        return file_url if isinstance(file_url, str) and file_url else None
