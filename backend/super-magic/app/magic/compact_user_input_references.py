"""Build compact-time user-input reference indexes from chat history."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

from agentlang.chat_history.chat_history_models import UserMessage

_PREVIEW_MAX_CHARS = 220
_PROTECTED_TOKEN_RE = re.compile(
    r"https?://\S+|"
    r"(?:/Users/|/Volumes/|/var/|/tmp/|/opt/|\.workspace/)\S+|"
    r"(?:[A-Za-z]:\\)\S+"
)
_SECTION_6_RE = re.compile(
    r"(?ms)^\s*(?:\*\*)?6\.\s*High-Value User Input(?:\*\*)?:?.*?(?=^\s*(?:\*\*)?\d+\.\s+\S|\Z)"
)


@dataclass(frozen=True)
class CompactUserInputReference:
    index: int
    created_at: str
    content: str


def build_compact_user_input_references(
    messages: Sequence[object],
) -> tuple[CompactUserInputReference, ...]:
    refs: list[CompactUserInputReference] = []
    for message in messages:
        if not is_real_user_input(message):
            continue
        content = getattr(message, "content", "")
        if not isinstance(content, str):
            continue
        refs.append(
            CompactUserInputReference(
                index=len(refs) + 1,
                created_at=str(getattr(message, "created_at", "") or ""),
                content=content,
            )
        )
    return tuple(refs)


def format_user_input_reference_block(
    messages: Sequence[object],
) -> str:
    refs = build_compact_user_input_references(messages)
    lines = [
        "## User Input Reference Index",
        "",
        "Select indexes from this list when exact user input must be preserved.",
        "The system will restore the original text. Do not copy full user messages yourself.",
        "",
    ]

    if not refs:
        lines.append("(no user inputs to reference)")
    else:
        for ref in refs:
            created_at = _format_created_at(ref.created_at)
            preview = _build_preview(ref.content)
            lines.append(f"{ref.index}. {created_at} | {preview}")

    return "\n".join(lines).strip()


def restore_preserved_user_inputs(
    summary: str,
    messages: Sequence[object],
    selected_indexes: Sequence[int],
) -> str:
    refs = build_compact_user_input_references(messages)
    refs_by_index = {ref.index: ref for ref in refs}
    normalized_indexes = sorted({
        index
        for index in selected_indexes
        if isinstance(index, int) and index in refs_by_index
    })

    section_lines = ["6. High-Value User Input:"]
    if not normalized_indexes:
        section_lines.append("No high-value user input was selected for verbatim preservation.")
    else:
        for index in normalized_indexes:
            ref = refs_by_index[index]
            section_lines.extend([
                "",
                f"- User input {ref.index} ({_format_created_at(ref.created_at)}):",
                _fenced_text(ref.content),
            ])

    base_summary = _remove_existing_high_value_section(summary).strip()
    section = "\n".join(section_lines).strip()
    if not base_summary:
        return section
    return f"{base_summary}\n\n{section}"


def is_real_user_input(message: object) -> bool:
    """判断消息是否是用户主动输入，而不是运行时注入的 user 消息。"""
    if isinstance(message, UserMessage):
        role = message.role
        show_in_ui = message.show_in_ui
        source = message.source
        content = message.content
    elif isinstance(message, dict):
        role = message.get("role")
        show_in_ui = message.get("show_in_ui", True)
        source = message.get("source")
        content = message.get("content", "")
    else:
        return False
    if role != "user" or show_in_ui is not True or source is not None:
        return False
    if not isinstance(content, str) or not content.strip():
        return False
    if content.lstrip().startswith("<summary>"):
        return False
    return True


def _format_created_at(created_at: str) -> str:
    value = created_at.strip()
    if not value:
        return "time unavailable"
    if re.search(r"(?:Z|UTC|[+-]\d{2}:?\d{2})$", value):
        return value
    return f"{value} UTC"


def _build_preview(content: str) -> str:
    normalized = " ".join(content.strip().split())
    if len(normalized) <= _PREVIEW_MAX_CHARS:
        return normalized

    protected_tokens = list(dict.fromkeys(_PROTECTED_TOKEN_RE.findall(normalized)))[:2]
    if protected_tokens:
        lead = _truncate_without_splitting_token(normalized, 80)
        preview = f"{lead} ... {' '.join(protected_tokens)}"
        if len(preview) <= _PREVIEW_MAX_CHARS:
            return preview
        return preview

    return _truncate_without_splitting_token(normalized, _PREVIEW_MAX_CHARS)


def _truncate_without_splitting_token(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 3].rstrip()
    last_space = cut.rfind(" ")
    if last_space >= max_chars // 2:
        cut = cut[:last_space].rstrip()
    return f"{cut}..."


def _remove_existing_high_value_section(summary: str) -> str:
    return _SECTION_6_RE.sub("", summary).strip()


def _fenced_text(content: str) -> str:
    longest_backtick_run = max((len(match.group(0)) for match in re.finditer(r"`+", content)), default=0)
    fence = "`" * max(3, longest_backtick_run + 1)
    return f"{fence}\n{content}\n{fence}"
