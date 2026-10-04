"""Code Mode tool for restarting the sandbox that hosts the current Agent."""

from __future__ import annotations

import asyncio

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.core.horizon.models import ResumptionTrigger
from app.infrastructure.magic_service.sandbox_types import SandboxRestartScheduleData
from app.service.sandbox_restart_coordinator import sandbox_restart_coordinator
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.core.sandbox_tool_context import get_sandbox_tool_context

logger = get_logger(__name__)


class RestartSandboxParams(BaseToolParams):
    pass


@tool(code_mode_only=True)
class RestartSandbox(BaseTool[RestartSandboxParams]):
    """Request an unconditional restart after the current Agent run is finalized."""

    async def execute(self, tool_context: ToolContext, params: RestartSandboxParams) -> ToolResult:
        sandbox_context = get_sandbox_tool_context(tool_context, logger=logger)
        if isinstance(sandbox_context, ToolResult):
            return sandbox_context

        if sandbox_context.agent_context.is_interruption_requested():
            raise asyncio.CancelledError("Sandbox restart interrupted before scheduling")

        resumption = None
        try:
            # 先把“重启完成后还要继续验证并回复用户”持久化到 Horizon。
            # 这样当前进程随后退出时，新 runtime 仍然能找到这项待办。
            resumption = await sandbox_context.agent_context.horizon.schedule_resumption(
                source="sandbox_restart",
                trigger=ResumptionTrigger.RUNTIME_READY,
                content=(
                    "The sandbox restart requested in the previous turn has completed and "
                    "the Agent runtime is available again. Verify the current sandbox status "
                    "with get_sandbox_info, then tell the user whether it recovered successfully. "
                    "Do not claim success unless verification succeeds."
                ),
            )
            resumption_id = resumption.id

            async def _cancel_resumption() -> None:
                await sandbox_context.agent_context.horizon.cancel_resumption(resumption_id)

            sandbox_restart_coordinator.request_restart(
                agent_context=sandbox_context.agent_context,
                config=sandbox_context.config,
                sandbox_id=sandbox_context.sandbox_id,
                cancel_resumption=_cancel_resumption,
            )
        except asyncio.CancelledError:
            if resumption is not None:
                await sandbox_context.agent_context.horizon.cancel_resumption(resumption.id)
            raise
        except Exception as exc:
            if resumption is not None:
                await sandbox_context.agent_context.horizon.cancel_resumption(resumption.id)
            logger.error("Unable to schedule sandbox restart: %s", exc, exc_info=True)
            return ToolResult.error(
                f"Unable to schedule the current sandbox restart: {exc}",
                extra_info={"user_error": _translate("restart_sandbox.error")},
            )

        result: SandboxRestartScheduleData = {
            "sandbox_id": sandbox_context.sandbox_id,
            "operation": "restart_requested",
        }
        payload = dict(result)
        return ToolResult(
            content=(
                "The unconditional restart of the current sandbox has been requested. "
                "The restart request will be sent after this Agent run completes its final "
                "response and project archive; no fixed duration is promised. "
                "Reply to the user now and do not call more tools. "
                "A new user message or interruption before finalization will cancel the pending "
                "restart. After the sandbox is available again, the runtime will automatically "
                "resume this conversation and use get_sandbox_info to verify its status."
            ),
            data=payload,
            extra_info=payload,
        )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, str]:
        return {
            "tool_name": tool_name,
            "action": _action(tool_name),
            "remark": _translate("restart_sandbox.before"),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        if not result.ok:
            return _error_detail(result)

        info = _result_data(result)
        lines = [
            f"# {_translate('restart_sandbox.detail_title')}",
            "",
            f"- {_translate('sandbox.detail.sandbox_id')}: `{info.get('sandbox_id', '')}`",
            f"- {_translate('sandbox.detail.operation')}: {_translate('sandbox.operation.restart_requested')}",
        ]
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="restart_sandbox.md", content="\n".join(lines)),
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, str]:
        if result.ok:
            remark = _translate("restart_sandbox.scheduled")
        else:
            remark = _translate("restart_sandbox.error")
        return {"tool_name": tool_name, "action": _action(tool_name), "remark": remark}


def _translate(key: str, **kwargs: object) -> str:
    return i18n.translate(key, category="tool.messages", **kwargs)


def _action(tool_name: str) -> str:
    return i18n.translate(tool_name, category="tool.actions")


def _result_data(result: ToolResult) -> dict[str, object]:
    if isinstance(result.data, dict):
        return result.data
    if isinstance(result.extra_info, dict):
        return result.extra_info
    return {}


def _error_detail(result: ToolResult) -> ToolDetail:
    extra_info = result.extra_info if isinstance(result.extra_info, dict) else {}
    user_error = extra_info.get("user_error")
    if not isinstance(user_error, str) or not user_error.strip():
        user_error = _translate("sandbox.detail.service_error")
    content = "\n".join(
        [
            f"# {_translate('restart_sandbox.detail_failed_title')}",
            "",
            f"- {_translate('sandbox.detail.error')}: {user_error}",
        ]
    )
    return ToolDetail(
        type=DisplayType.MD,
        data=FileContent(file_name="restart_sandbox.md", content=content),
    )


__all__ = ["RestartSandbox", "RestartSandboxParams"]
