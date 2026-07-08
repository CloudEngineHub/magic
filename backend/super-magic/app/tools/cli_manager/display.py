"""CLI 管理工具的展示与国际化辅助方法。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from app.i18n import i18n


def translate_action(tool_name: str) -> str:
    """翻译工具动作名称。"""
    return i18n.translate(tool_name, category="tool.actions")


def translate_message(message_key: str, **kwargs: object) -> str:
    """翻译 CLI 管理工具的展示文案。"""
    return i18n.translate(f"cli_manager.{message_key}", category="tool.messages", **kwargs)


def translate_error(info: Mapping[str, object] | None) -> str:
    """根据工具错误上下文翻译稳定错误信息。"""
    info = info or {}
    error_code = str(info.get("error_code") or "unknown")
    context = info.get("error_context")
    context_mapping = context if isinstance(context, Mapping) else {}
    context_kwargs = {str(key): value for key, value in context_mapping.items()}
    message = translate_message(f"error.{error_code}", **context_kwargs)
    if message == f"cli_manager.error.{error_code}":
        return translate_message("error.unknown")
    return message


def get_argument_name(arguments: Mapping[str, object] | None) -> str:
    """从工具参数中读取 CLI 名称。"""
    raw_name = (arguments or {}).get("name") or ""
    return str(raw_name)


def get_argument_mode(arguments: Mapping[str, object] | None) -> str:
    """从工具参数中读取持久化模式。"""
    raw_mode = (arguments or {}).get("mode") or "install"
    return str(raw_mode)


def get_argument_commands(arguments: Mapping[str, object] | None) -> list[str]:
    """从工具参数中读取命令名列表。"""
    raw_commands = (arguments or {}).get("commands") or []
    if isinstance(raw_commands, Sequence) and not isinstance(raw_commands, str):
        return [str(command) for command in raw_commands]
    return []


def format_commands(commands: Sequence[object] | None) -> str:
    """将命令列表格式化为展示文本。"""
    normalized = [str(command) for command in commands or [] if str(command)]
    if not normalized:
        return "-"
    return ", ".join(normalized)


def format_optional(value: object) -> str:
    """将可选字段格式化为展示文本。"""
    if value is None or value == "":
        return "-"
    return str(value)


def as_mapping(value: object) -> Mapping[str, object]:
    """将未知对象安全收敛为映射。"""
    if isinstance(value, Mapping):
        return value
    return {}


def as_sequence(value: object) -> Sequence[object]:
    """将未知对象安全收敛为序列。"""
    if isinstance(value, Sequence) and not isinstance(value, str):
        return value
    return []
