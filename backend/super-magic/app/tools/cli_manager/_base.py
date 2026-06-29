"""CLI 管理工具共享辅助方法。"""

from __future__ import annotations

import re
from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.service.cli_manager import CliManagerError


class CliManagerToolMixin:
    """为 CLI 管理错误构建一致的 ToolResult 载荷。"""

    @staticmethod
    def error_result(operation: str, exc: CliManagerError, arguments: Mapping[str, object]) -> ToolResult:
        """将结构化服务异常转换为工具错误结果。"""
        payload = {
            "operation": operation,
            "error_code": exc.code,
            "error_context": CliManagerToolMixin._redact_payload(exc.context),
            "arguments": CliManagerToolMixin._redact_payload(arguments),
        }
        return ToolResult.error(
            CliManagerToolMixin._build_error_content(exc, payload["error_context"]),
            extra_info=payload,
            data=payload,
            use_custom_remark=True,
        )

    @staticmethod
    def _build_error_content(exc: CliManagerError, context: object) -> str:
        """构建只依赖 result.content 即可理解的模型错误文本。"""
        lines = [str(exc), f"error_code: {exc.code}"]
        if isinstance(context, Mapping):
            for key in (
                "command",
                "existing_owner",
                "existing_path",
                "inferred_root",
                "requested_path",
                "suggested_prefix_bin_dir",
                "selected_target",
            ):
                if key in context:
                    value = context[key]
                    if isinstance(value, list):
                        value = ", ".join(str(item) for item in value)
                    lines.append(f"{key}: {value}")
            lines.extend(CliManagerToolMixin._build_next_step_lines(context))
        return "\n".join(lines)

    @staticmethod
    def _build_next_step_lines(context: Mapping[str, object]) -> list[str]:
        """根据服务层冲突选项生成明确的下一步调用说明。"""
        raw_options = context.get("resolution_options")
        if not isinstance(raw_options, list):
            return []

        options = {str(option) for option in raw_options}
        command = str(context.get("command") or "")
        command_hint = f'commands=["{command}"]' if command else "commands=[the chosen command]"
        lines = ["next_steps:"]

        if "adopt_existing" in options:
            lines.append(
                f'- To adopt the existing PATH command: ask the user to confirm, then call cli_manager_apply with mode="adopt", {command_hint}, confirmed=true.'
            )
        if "install_with_prefix" in options:
            prefix = context.get("suggested_prefix_bin_dir")
            prefix_hint = f" so the CLI binary is installed under {prefix}" if prefix else ""
            lines.append(
                f'- To retry installation in a persistent prefix: adjust the install_command according to the installer documentation{prefix_hint}, then call cli_manager_apply with mode="install" and confirmed=true.'
            )
        if "remove_existing" in options:
            owner = context.get("existing_owner")
            target = f" for {owner}" if owner else ""
            lines.append(
                f"- To replace an existing persisted CLI{target}: ask the user to confirm, call cli_manager_remove first, then retry cli_manager_apply."
            )
        if "remove_existing_path" in options:
            existing_path = context.get("existing_path")
            path_hint = f" at {existing_path}" if existing_path else ""
            lines.append(
                f"- To replace the existing PATH command{path_hint}: ask the user before removing anything outside cli-manager, then retry after the conflict is gone."
            )
        if "rename_command" in options:
            lines.append(
                "- To use a different command name: ask the user for another real command name or installer-supported alias, then retry cli_manager_apply with that commands value."
            )
        if "remove_source" in options:
            lines.append(
                "- To replace the source path: ask the user before removing anything outside cli-manager, then retry after the source conflict is gone."
            )
        if "cancel" in options:
            lines.append("- To cancel: stop the flow and report the conflict to the user.")

        lines.append("do_not_pass: resolution or resolution_options; they are not cli_manager_apply inputs.")
        return lines

    @staticmethod
    def _redact_payload(value: object) -> object:
        """只对 CLI 管理工具返回载荷中的敏感片段做局部脱敏。"""
        if isinstance(value, str):
            return CliManagerToolMixin._redact_text(value)
        if isinstance(value, Mapping):
            return {
                str(key): CliManagerToolMixin._redact_payload(item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [CliManagerToolMixin._redact_payload(item) for item in value]
        if isinstance(value, tuple):
            return tuple(CliManagerToolMixin._redact_payload(item) for item in value)
        return value

    @staticmethod
    def _redact_text(text: str) -> str:
        """脱敏 CLI 安装命令或错误输出中的常见凭证片段。"""
        return re.sub(
            r"(?i)\b(token|secret|password|api[_-]?key|authorization)(\s*(?:=|:)\s*)\S+",
            r"\1\2***",
            text,
        )
