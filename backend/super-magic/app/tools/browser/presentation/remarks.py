"""Browser 工具调用前后 remark 构建。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.i18n import i18n
from app.tools.browser.presentation.details import BrowserDetailBuilder
from magic_use.errors import BrowserErrorCode
from magic_use.models import ActionTarget


class BrowserRemarkBuilder:
    @classmethod
    def before(
        cls,
        *,
        tool_name: str,
        action: str,
        arguments: Mapping[str, object],
        target: ActionTarget | None,
    ) -> dict[str, str]:
        subject = cls._argument_subject(tool_name, arguments, target)
        remark = (
            cls._message("browser.remark.running_target", action=action, target=subject)
            if subject
            else cls._message("browser.remark.running", action=action)
        )
        return {"tool_name": tool_name, "action": action, "remark": remark}

    @classmethod
    def after(
        cls,
        *,
        tool_name: str,
        action: str,
        result: ToolResult,
        arguments: Mapping[str, object],
    ) -> dict[str, str]:
        if not result.ok and result.data.get("error_code") == BrowserErrorCode.NAVIGATION_FAILED.value:
            return {
                "tool_name": tool_name,
                "action": action,
                "remark": cls._message("browser.remark.recovering_navigation"),
            }
        presentation = BrowserDetailBuilder.presentation(
            action,
            result,
            tool_name=tool_name,
            arguments=arguments,
        )
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": presentation.summary,
        }

    @classmethod
    def _argument_subject(
        cls,
        tool_name: str,
        arguments: Mapping[str, object],
        target: ActionTarget | None,
    ) -> str:
        if tool_name == "browser_fill":
            if target is None:
                return ""
            if target is not None and target.is_sensitive:
                return cls._message("browser.detail.sensitive_value")
            value = arguments.get("value")
            return value.strip() if isinstance(value, str) else ""
        key_by_tool = {
            "browser_press": "key",
            "browser_select": "value",
            "browser_screenshot": "output_path",
            "browser_visual_query": "query",
            "browser_find_visual": "target",
        }
        argument_key = key_by_tool.get(tool_name)
        argument_value = arguments.get(argument_key) if argument_key else None
        if isinstance(argument_value, str) and argument_value.strip():
            return argument_value.strip()
        if target is not None:
            for value in (target.name, target.text, target.role):
                if value.strip():
                    return value.strip()
        for key in ("url", "query", "scope", "condition"):
            value = arguments.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _message(key: str, **kwargs: object) -> str:
        return i18n.translate(key, category="tool.messages", **kwargs)
