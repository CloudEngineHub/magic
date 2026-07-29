"""Browser 工具调用前后 remark 构建。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.i18n import i18n
from app.tools.browser.presentation.details import BrowserDetailBuilder
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
        subject = cls._argument_subject(arguments, target)
        remark = (
            cls._message("browser.remark.running_target", action=action, target=subject)
            if subject
            else cls._message("browser.remark.running", action=action)
        )
        return {"tool_name": tool_name, "action": action, "remark": remark}

    @classmethod
    def after(cls, *, tool_name: str, action: str, result: ToolResult) -> dict[str, str]:
        presentation = BrowserDetailBuilder.presentation(action, result)
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": presentation.summary,
        }

    @classmethod
    def _argument_subject(cls, arguments: Mapping[str, object], target: ActionTarget | None) -> str:
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
