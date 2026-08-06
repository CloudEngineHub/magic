from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.service.html_app_memory_service import (
    MAGICBASE_MODEL_END,
    MAGICBASE_MODEL_START,
    default_html_app_memory_content,
    read_html_app_memory,
    write_html_app_memory,
)
from app.tools.core import BaseTool, BaseToolParams, tool


class HtmlAppMemoryFile(BaseModel):
    path: str = Field(
        description="""<!--zh: 文件路径，例如 index.html、style.css、app.js。-->
Workspace-relative file path, such as index.html, style.css, or app.js."""
    )
    purpose: str = Field(
        description="""<!--zh: 这个文件在微应用中的职责。-->
The file's responsibility in the micro-app."""
    )


class UpdateHtmlAppMemoryParams(BaseToolParams):
    app_name: Optional[str] = Field(
        default=None,
        description="""<!--zh: 微应用名称。-->
The micro-app name."""
    )
    app_type: Optional[str] = Field(
        default=None,
        description="""<!--zh: 微应用类型，例如 survey、dashboard、todo、landing_page、crud_admin。-->
The micro-app type, such as survey, dashboard, todo, landing_page, or crud_admin."""
    )
    target_users: Optional[str] = Field(
        default=None,
        description="""<!--zh: 目标用户。-->
The target users."""
    )
    core_scenario: Optional[str] = Field(
        default=None,
        description="""<!--zh: 核心使用场景。-->
The core usage scenario."""
    )
    anonymous_access: Optional[bool] = Field(
        default=None,
        description="""<!--zh: 微应用是否允许未登录匿名访问。-->
Whether the micro-app allows unauthenticated anonymous access."""
    )
    auth_notes: Optional[str] = Field(
        default=None,
        description="""<!--zh: 匿名与登录策略说明，例如为什么必须登录或为什么允许匿名。-->
Notes about anonymous/login strategy, such as why login is required or why anonymous access is allowed."""
    )
    entry_files: List[HtmlAppMemoryFile] = Field(
        default_factory=list,
        description="""<!--zh: 入口文件和关键文件列表。-->
Entry and key files for the micro-app."""
    )
    features: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 已真实实现的功能。只写已经完成的能力。-->
Features that are truly implemented. Only include completed capabilities."""
    )
    runtime_notes: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 运行说明、依赖、关键兼容点。-->
Runtime notes, dependencies, and important compatibility details."""
    )
    iron_rules: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 后续迭代不能破坏的铁律。-->
Iron rules that future iterations must preserve."""
    )
    iteration_summary: Optional[str] = Field(
        default=None,
        description="""<!--zh: 本次迭代的简短记录。-->
A short summary of this iteration."""
    )


def _section_body(content: str, heading: str) -> str:
    marker = f"## {heading}"
    start = content.find(marker)
    if start < 0:
        return ""
    body_start = content.find("\n", start)
    if body_start < 0:
        return ""
    next_heading = content.find("\n## ", body_start + 1)
    if next_heading < 0:
        return content[body_start:].strip()
    return content[body_start:next_heading].strip()


def _existing_magicbase_block(content: str) -> str:
    start = content.find(MAGICBASE_MODEL_START)
    end = content.find(MAGICBASE_MODEL_END)
    if start >= 0 and end >= 0 and end > start:
        return content[start:end + len(MAGICBASE_MODEL_END)]

    body = (
        _section_body(content, "MagicBase 数据模型")
        or _section_body(content, "MagicBase Data Model")
        or "- 暂无 MagicBase 表结构记录。"
    )
    return f"{MAGICBASE_MODEL_START}\n{body.strip()}\n{MAGICBASE_MODEL_END}"


def _list_or_default(items: List[str], default: str = "暂未记录。") -> str:
    if not items:
        return f"- {default}"
    return "\n".join(f"- {item}" for item in items)


def _files_or_default(files: List[HtmlAppMemoryFile]) -> str:
    if not files:
        return "- 暂未记录。"
    return "\n".join(f"- `{item.path}`：{item.purpose}" for item in files)


def _overview(params: UpdateHtmlAppMemoryParams) -> str:
    lines = []
    if params.app_name:
        lines.append(f"- 应用名称：{params.app_name}")
    if params.app_type:
        lines.append(f"- 应用类型：{params.app_type}")
    if params.target_users:
        lines.append(f"- 目标用户：{params.target_users}")
    if params.core_scenario:
        lines.append(f"- 核心场景：{params.core_scenario}")
    return "\n".join(lines) if lines else "- 暂未记录。"


def _auth_strategy(params: UpdateHtmlAppMemoryParams) -> str:
    lines = []
    if params.anonymous_access is not None:
        lines.append(f"- anonymous：`{str(params.anonymous_access).lower()}`")
    if params.auth_notes:
        lines.append(f"- 说明：{params.auth_notes}")
    return "\n".join(lines) if lines else "- 暂未记录。"


def _iteration_history(content: str, params: UpdateHtmlAppMemoryParams) -> str:
    existing = _section_body(content, "迭代历史")
    lines = [line for line in existing.splitlines() if line.strip() and "暂未记录" not in line]
    if params.iteration_summary:
        lines.append(f"- {params.iteration_summary}")
    return "\n".join(lines) if lines else "- 暂未记录。"


def _render_memory(content: str, params: UpdateHtmlAppMemoryParams) -> str:
    magicbase_block = _existing_magicbase_block(content)
    return f"""# MICRO-APP.md

这个文件是当前 workspace 中唯一微应用的项目记忆。HTML 页面不要读取它；README.md 不承担记忆职责。它只服务后续开发和迭代。

## 应用概览

{_overview(params)}

## 匿名与登录策略

{_auth_strategy(params)}

## 入口与文件

{_files_or_default(params.entry_files)}

## 已实现功能

{_list_or_default(params.features)}

## MagicBase 数据模型

{magicbase_block}

## 运行说明

{_list_or_default(params.runtime_notes)}

## 铁律

{_list_or_default(params.iron_rules)}

## 迭代历史

{_iteration_history(content, params)}
"""


@tool(name="update_html_app_memory")
class UpdateHtmlAppMemory(BaseTool[UpdateHtmlAppMemoryParams]):
    """<!--zh
    更新 workspace 根目录的 MICRO-APP.md 项目记忆。

    只用于记录当前微应用的真实完成状态。不要用 write_file 或 edit_file 直接修改 MICRO-APP.md。
    -->
    Update the workspace-root MICRO-APP.md project memory.

    Use this only to record the actual completed state of the current micro-app. Do not use write_file or edit_file to modify MICRO-APP.md directly.
    """
    name = "update_html_app_memory"

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        friendly = await super().get_before_tool_call_friendly_action_and_remark(
            tool_name,
            tool_context,
            arguments,
        )
        friendly["remark"] = i18n.translate(
            "update_html_app_memory.remark",
            category="tool.messages",
        )
        return friendly

    def _get_remark_content(
        self,
        result: ToolResult,
        arguments: Dict[str, Any] = None,
    ) -> str:
        return i18n.translate("update_html_app_memory.remark", category="tool.messages")

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
开发微应用时，任务结束前用本工具更新 `MICRO-APP.md`。

规则：
- 只记录真实完成的内容，不记录计划或未完成能力。
- `MICRO-APP.md` 只展示最新项目状态、匿名/登录策略和最新 MagicBase 表结构，不记录迁移历史。
- MagicBase 迁移历史由 `.magicbase/migrations.json` 自动维护，agent 不要手写。
- 不要用 write_file、edit_file、multi_edit_file 或 range 编辑工具修改 `MICRO-APP.md`。
- “铁律”用于记录后续迭代绝不能破坏的约束。
-->
Use this tool before ending a micro-app development task to update `MICRO-APP.md`.

Rules:
- Record only what was actually completed, not plans or unfinished capabilities.
- `MICRO-APP.md` shows the latest project state, anonymous/login strategy, and latest MagicBase data model only. It does not store migration history.
- MagicBase migration history is maintained automatically in `.magicbase/migrations.json`. The agent must not write it manually.
- Do not use write_file, edit_file, multi_edit_file, or range edit tools to modify `MICRO-APP.md`.
- Use "铁律" for constraints that future iterations must not break.
"""

    async def execute(self, tool_context: ToolContext, params: UpdateHtmlAppMemoryParams) -> ToolResult:
        try:
            content = await read_html_app_memory()
            if content == default_html_app_memory_content() and not any(
                [
                    params.app_name,
                    params.app_type,
                    params.target_users,
                    params.core_scenario,
                    params.anonymous_access is not None,
                    params.auth_notes,
                    params.entry_files,
                    params.features,
                    params.runtime_notes,
                    params.iron_rules,
                    params.iteration_summary,
                ]
            ):
                return ToolResult.error("No project memory fields were provided. Provide the completed app state before updating MICRO-APP.md.")

            updated = _render_memory(content, params)
            await write_html_app_memory(updated)
            return ToolResult(
                content="Updated MICRO-APP.md project memory. The MagicBase data model section was preserved, and migration history remains in .magicbase/migrations.json.",
                data={"file_path": "MICRO-APP.md"},
            )
        except Exception as e:
            return ToolResult.error(f"Failed to update MICRO-APP.md project memory: {e}")

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None) -> Optional[ToolDetail]:
        if not result.ok:
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(
                    file_name="MICRO-APP.md",
                    content=i18n.translate(
                        "update_html_app_memory.detail_error",
                        category="tool.messages",
                    ),
                ),
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(
                file_name="MICRO-APP.md",
                content=i18n.translate(
                    "update_html_app_memory.detail_success",
                    category="tool.messages",
                ),
            ),
        )
