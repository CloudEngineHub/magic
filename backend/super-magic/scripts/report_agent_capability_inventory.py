"""生成 Agent 工具与 Skill 上下文盘点报告。

脚本只读取现有 Agent 配置、聊天记录和 Skill 文件，并输出 Markdown 报告。
所有文件操作统一使用项目异步文件工具，避免阻塞事件循环。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import shlex
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import cast

import yaml


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.utils.async_file_utils import (  # noqa: E402
    async_exists,
    async_read_json,
    async_read_text,
    async_scandir,
    async_stat,
    async_write_text,
)


FRONTMATTER_PATTERN = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)
AVAILABLE_SKILLS_PATTERN = re.compile(
    r"<available_skills>\s*(?=<skill>)(.*?)</available_skills>", re.DOTALL
)
SKILL_PATTERN = re.compile(
    r"<skill>\s*"
    r"<name>(.*?)</name>\s*"
    r"<description>(.*?)</description>\s*"
    r"(?:<location>(.*?)</location>\s*)?"
    r"</skill>",
    re.DOTALL,
)
PRELOADED_SKILL_PATTERN = re.compile(
    r'<skill name="([^"]+)">(.*?)</skill>', re.DOTALL
)
TOOL_HINTS_MARKER = "## Advanced Tool Usage Instructions:"
TOOL_HINT_PATTERN = re.compile(
    r"^### ([a-zA-Z0-9_.-]+)\n(.*?)(?=^### [a-zA-Z0-9_.-]+\n|\Z)",
    re.MULTILINE | re.DOTALL,
)


@dataclass(frozen=True, slots=True)
class SkillPromptEntry:
    name: str
    description: str
    location: Path | None


@dataclass(frozen=True, slots=True)
class SkillFileStats:
    lines: int
    chars: int
    estimated_tokens: int
    headings: tuple[str, ...]
    reference_files: int
    script_files: int
    other_files: int
    total_bytes: int


@dataclass(frozen=True, slots=True)
class ToolEntry:
    name: str
    description: str
    parameter_names: tuple[str, ...]
    required_names: tuple[str, ...]
    schema_chars: int
    prompt_hint_chars: int


@dataclass(frozen=True, slots=True)
class ArtifactInfo:
    label: str
    path: Path
    modified_at: str


@dataclass(frozen=True, slots=True)
class RuntimeIdentity:
    history_agent_name: str
    tools_agent_name: str
    agent_file_name: str | None
    session_agent_mode: str | None
    session_agent_type: str | None
    dispatch_agent_mode: str | None
    dispatch_profile_name: str | None
    dispatch_profile_role: str | None
    prompt_role_preview: str | None
    warnings: tuple[str, ...]


def estimate_tokens(text: str) -> int:
    """按项目 token_estimator 的字符启发式估算 token。"""

    if not text:
        return 0
    chinese_chars = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    other_chars = len(text) - chinese_chars
    return max(1, int(chinese_chars / 1.5 + other_chars / 4))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成 Agent 工具与 Skill 盘点报告")
    parser.add_argument(
        "--agent",
        required=True,
        help="用于推导默认输入文件名和报告标题的 Agent 名称",
    )
    parser.add_argument(
        "--agent-file",
        type=Path,
        help="可选的 Agent 配置文件；未传时尝试 agents/<agent>.agent",
    )
    parser.add_argument(
        "--chat-history",
        type=Path,
        help="包含真实 system message 的聊天记录；未传时使用 .chat_history/<agent><main>.json",
    )
    parser.add_argument(
        "--tools",
        type=Path,
        help="真实工具 schema；未传时使用 .chat_history/<agent><main>.tools.json",
    )
    parser.add_argument(
        "--session",
        type=Path,
        help="可选的 session 配置；未传时尝试 .chat_history/<agent><main>.session.json",
    )
    parser.add_argument(
        "--dispatch-message",
        type=Path,
        help="可选的 dispatch 快照；它是全局最后一次请求，只有能确认关联时才应显式传入",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Markdown 报告输出路径；未传时使用 docs/plans/<agent>-agent-capability-inventory.md",
    )
    return parser.parse_args()


def parse_agent_frontmatter(content: str) -> dict[str, object]:
    match = FRONTMATTER_PATTERN.match(content)
    if not match:
        raise ValueError("Agent 文件缺少 YAML frontmatter")
    parsed = yaml.safe_load(match.group(1)) or {}
    if not isinstance(parsed, dict):
        raise ValueError("Agent frontmatter 必须是 mapping")
    return cast(dict[str, object], parsed)


def extract_named_skill_entries(raw: object) -> tuple[str, ...]:
    if raw == "*":
        return ("*",)
    if not isinstance(raw, list):
        return ()

    names: list[str] = []
    for item in raw:
        if isinstance(item, str):
            names.append(item)
        elif isinstance(item, dict):
            name = item.get("name")
            if isinstance(name, str) and name:
                names.append(name)
    return tuple(names)


def extract_agent_skill_config(
    frontmatter: dict[str, object],
) -> tuple[tuple[str, ...], tuple[str, ...], bool, bool]:
    raw_skills = frontmatter.get("skills")
    if not isinstance(raw_skills, dict):
        return (), (), False, False

    skills = cast(dict[str, object], raw_skills)
    system_skills = extract_named_skill_entries(skills.get("system_skills"))
    preload = extract_named_skill_entries(skills.get("preload"))
    workspace_all = skills.get("workspace_skills") == "*"
    crew_all = skills.get("crew_skills") == "*"
    return system_skills, preload, workspace_all, crew_all


def extract_system_prompt(chat_history: object) -> str:
    if not isinstance(chat_history, list):
        raise ValueError("聊天记录必须是消息数组")
    for raw_message in chat_history:
        if not isinstance(raw_message, dict):
            continue
        message = cast(dict[str, object], raw_message)
        if message.get("role") == "system" and isinstance(message.get("content"), str):
            return cast(str, message["content"])
    raise ValueError("聊天记录中没有 system message")


def extract_available_skills(system_prompt: str) -> tuple[SkillPromptEntry, ...]:
    block_match = AVAILABLE_SKILLS_PATTERN.search(system_prompt)
    if not block_match:
        return ()

    entries: list[SkillPromptEntry] = []
    for match in SKILL_PATTERN.finditer(block_match.group(1)):
        name, description, location = match.groups()
        entries.append(
            SkillPromptEntry(
                name=name.strip(),
                description=description.strip(),
                location=Path(location.strip()) if location and location.strip() else None,
            )
        )
    return tuple(entries)


def extract_preloaded_skill_names(system_prompt: str) -> tuple[str, ...]:
    start = system_prompt.find("<preloaded_skills>")
    end = system_prompt.find("</preloaded_skills>")
    if start < 0 or end < 0:
        return ()
    block = system_prompt[start:end]
    return tuple(match.group(1) for match in PRELOADED_SKILL_PATTERN.finditer(block))


def extract_tool_hints(system_prompt: str) -> dict[str, int]:
    marker_index = system_prompt.find(TOOL_HINTS_MARKER)
    if marker_index < 0:
        return {}
    hints_text = system_prompt[marker_index + len(TOOL_HINTS_MARKER) :]
    final_separator = hints_text.rfind("\n---\n")
    if final_separator >= 0:
        hints_text = hints_text[:final_separator]
    return {
        match.group(1): len(match.group(2).strip())
        for match in TOOL_HINT_PATTERN.finditer(hints_text)
    }


async def count_files(path: Path) -> tuple[int, int]:
    """递归统计目录内文件数量与总字节数。"""

    if not await async_exists(path):
        return 0, 0

    file_count = 0
    total_bytes = 0
    for entry in await async_scandir(path):
        entry_path = Path(entry.path)
        if entry.is_dir(follow_symlinks=False):
            child_count, child_bytes = await count_files(entry_path)
            file_count += child_count
            total_bytes += child_bytes
        elif entry.is_file(follow_symlinks=False):
            file_count += 1
            total_bytes += (await async_stat(entry_path)).st_size
    return file_count, total_bytes


async def collect_skill_stats(location: Path | None) -> SkillFileStats | None:
    if location is None or not await async_exists(location):
        return None

    content = await async_read_text(location)
    headings = tuple(
        line.strip().lstrip("#").strip()
        for line in content.splitlines()
        if re.match(r"^#{1,3}\s+\S", line)
    )
    skill_dir = location.parent

    reference_files = 0
    reference_bytes = 0
    for reference_dir_name in ("reference", "references"):
        count, size = await count_files(skill_dir / reference_dir_name)
        reference_files += count
        reference_bytes += size

    script_files, script_bytes = await count_files(skill_dir / "scripts")
    all_files, all_bytes = await count_files(skill_dir)
    other_files = max(0, all_files - reference_files - script_files - 1)
    total_bytes = all_bytes if all_bytes else len(content.encode("utf-8"))

    return SkillFileStats(
        lines=len(content.splitlines()),
        chars=len(content),
        estimated_tokens=estimate_tokens(content),
        headings=headings,
        reference_files=reference_files,
        script_files=script_files,
        other_files=other_files,
        total_bytes=max(total_bytes, reference_bytes + script_bytes),
    )


async def discover_system_skill_names() -> tuple[str, ...]:
    system_skills_dir = PROJECT_ROOT / "agents" / "skills"
    names: list[str] = []
    for entry in await async_scandir(system_skills_dir):
        if not entry.is_dir(follow_symlinks=False) or entry.name.startswith("_"):
            continue
        if await async_exists(Path(entry.path) / "SKILL.md"):
            names.append(entry.name)
    return tuple(sorted(names))


async def count_external_skills(path: Path) -> int:
    if not await async_exists(path):
        return 0
    count = 0
    for entry in await async_scandir(path):
        if entry.is_dir(follow_symlinks=False) and await async_exists(
            Path(entry.path) / "SKILL.md"
        ):
            count += 1
    return count


def parse_tool_entries(tools_payload: object, hint_sizes: dict[str, int]) -> tuple[ToolEntry, ...]:
    if not isinstance(tools_payload, list):
        raise ValueError("工具定义必须是数组")

    entries: list[ToolEntry] = []
    for raw_tool in tools_payload:
        if not isinstance(raw_tool, dict):
            continue
        tool = cast(dict[str, object], raw_tool)
        raw_function = tool.get("function")
        if not isinstance(raw_function, dict):
            continue
        function = cast(dict[str, object], raw_function)
        name = function.get("name")
        if not isinstance(name, str):
            continue
        description = function.get("description")
        description_text = description if isinstance(description, str) else ""
        raw_parameters = function.get("parameters")
        parameters = (
            cast(dict[str, object], raw_parameters)
            if isinstance(raw_parameters, dict)
            else {}
        )
        raw_properties = parameters.get("properties")
        properties = (
            cast(dict[str, object], raw_properties)
            if isinstance(raw_properties, dict)
            else {}
        )
        raw_required = parameters.get("required")
        required = tuple(
            item for item in raw_required if isinstance(item, str)
        ) if isinstance(raw_required, list) else ()
        entries.append(
            ToolEntry(
                name=name,
                description=description_text.strip(),
                parameter_names=tuple(properties.keys()),
                required_names=required,
                schema_chars=len(json.dumps(raw_tool, ensure_ascii=False)),
                prompt_hint_chars=hint_sizes.get(name, 0),
            )
        )
    return tuple(entries)


def escape_table(text: str) -> str:
    return " ".join(text.replace("|", "\\|").split())


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.1f} MB"


def resolve_project_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def infer_history_agent_name(path: Path) -> str:
    return path.name.split("<", maxsplit=1)[0]


def extract_session_agent_mode(session_payload: object) -> str | None:
    if not isinstance(session_payload, dict):
        return None
    current = session_payload.get("current")
    if not isinstance(current, dict):
        return None
    agent_mode = current.get("agent_mode")
    return agent_mode.strip() if isinstance(agent_mode, str) and agent_mode.strip() else None


def resolve_agent_type(agent_mode: str | None) -> str | None:
    if agent_mode is None:
        return None
    from app.core.entity.message.client_message import AgentMode

    return AgentMode.resolve_agent_type(agent_mode)


def extract_dispatch_identity(
    dispatch_payload: object,
) -> tuple[str | None, str | None, str | None]:
    if not isinstance(dispatch_payload, dict):
        return None, None, None

    agent_mode = dispatch_payload.get("agent_mode")
    normalized_mode = (
        agent_mode.strip() if isinstance(agent_mode, str) and agent_mode.strip() else None
    )
    agent = dispatch_payload.get("agent")
    if not isinstance(agent, dict):
        return normalized_mode, None, None
    profile = agent.get("profile")
    if not isinstance(profile, dict):
        return normalized_mode, None, None

    name = profile.get("name")
    role = profile.get("role")
    normalized_name = name.strip() if isinstance(name, str) and name.strip() else None
    normalized_role = role.strip() if isinstance(role, str) and role.strip() else None
    return normalized_mode, normalized_name, normalized_role


def extract_prompt_role_preview(system_prompt: str) -> str | None:
    match = re.search(r"<role>\s*(.*?)\s*</role>", system_prompt, re.DOTALL)
    if not match:
        return None
    role_text = re.sub(r"<!--.*?-->", "", match.group(1), flags=re.DOTALL)
    compact = " ".join(role_text.split())
    if not compact:
        return None
    return compact[:300] + ("…" if len(compact) > 300 else "")


async def build_artifact_info(label: str, path: Path) -> ArtifactInfo:
    stat = await async_stat(path)
    modified_at = datetime.fromtimestamp(stat.st_mtime).astimezone().strftime(
        "%Y-%m-%d %H:%M:%S %Z"
    )
    return ArtifactInfo(label=label, path=path, modified_at=modified_at)


def build_runtime_identity(
    *,
    history_path: Path,
    tools_path: Path,
    agent_file_path: Path | None,
    session_payload: object | None,
    dispatch_payload: object | None,
    system_prompt: str,
) -> RuntimeIdentity:
    history_agent_name = infer_history_agent_name(history_path)
    tools_agent_name = infer_history_agent_name(tools_path)
    agent_file_name = agent_file_path.stem if agent_file_path is not None else None
    session_agent_mode = extract_session_agent_mode(session_payload)
    session_agent_type = resolve_agent_type(session_agent_mode)
    dispatch_agent_mode, dispatch_profile_name, dispatch_profile_role = (
        extract_dispatch_identity(dispatch_payload)
    )
    warnings: list[str] = []

    if tools_agent_name != history_agent_name:
        warnings.append(
            f"工具文件名推导出的 Agent `{tools_agent_name}` 与聊天记录文件名 "
            f"`{history_agent_name}` 不一致。"
        )
    if agent_file_name is not None and agent_file_name != history_agent_name:
        warnings.append(
            f"Agent 配置文件 `{agent_file_name}.agent` 与聊天记录文件名推导出的 Agent "
            f"`{history_agent_name}` 不一致。"
        )
    if session_agent_type is not None and session_agent_type != history_agent_name:
        warnings.append(
            f"session 的 `agent_mode={session_agent_mode}` 解析为 `{session_agent_type}`，"
            f"与聊天记录文件名 `{history_agent_name}` 不一致。"
        )
    if (
        dispatch_agent_mode is not None
        and session_agent_mode is not None
        and dispatch_agent_mode != session_agent_mode
    ):
        warnings.append(
            f"dispatch 快照的 `agent_mode={dispatch_agent_mode}` 与 session 的 "
            f"`agent_mode={session_agent_mode}` 不一致。"
        )
    if dispatch_profile_name or dispatch_profile_role:
        warnings.append(
            "运行请求携带了动态 Agent Profile；system prompt 中的身份不能视为 Agent 模板默认身份。"
        )

    return RuntimeIdentity(
        history_agent_name=history_agent_name,
        tools_agent_name=tools_agent_name,
        agent_file_name=agent_file_name,
        session_agent_mode=session_agent_mode,
        session_agent_type=session_agent_type,
        dispatch_agent_mode=dispatch_agent_mode,
        dispatch_profile_name=dispatch_profile_name,
        dispatch_profile_role=dispatch_profile_role,
        prompt_role_preview=extract_prompt_role_preview(system_prompt),
        warnings=tuple(warnings),
    )


def classify_skill_evidence(
    entry: SkillPromptEntry,
    explicit_names: set[str],
    configured_preload: set[str],
) -> str:
    if entry.name in explicit_names:
        return "Agent 配置声明为 system_skill"
    if entry.name in configured_preload:
        return "运行列表存在，但 Agent 配置声明为 preload"
    if entry.location is None:
        return "仅在运行快照中观察到，来源未确认"

    normalized_location = entry.location.resolve()
    known_roots = (
        (PROJECT_ROOT / "agents" / "skills", "内置 Skill 目录"),
        (PROJECT_ROOT / ".workspace" / ".magic" / "skills", "工作区 Skill 目录"),
        (Path.home() / ".magic" / "skills", "个人 Skill 目录"),
    )
    for root, label in known_roots:
        try:
            normalized_location.relative_to(root.resolve())
            return f"运行快照 location 位于{label}，具体挂载来源未确认"
        except ValueError:
            continue
    return "仅在运行快照中观察到，来源未确认"


def format_optional(value: str | None) -> str:
    return f"`{value}`" if value else "未提供或未识别"


def build_report(
    *,
    requested_agent_name: str,
    system_prompt: str,
    available_skills: tuple[SkillPromptEntry, ...],
    skill_stats: dict[str, SkillFileStats | None],
    tools: tuple[ToolEntry, ...],
    tool_schema_text: str,
    explicit_system_skills: tuple[str, ...],
    configured_preload: tuple[str, ...],
    actual_preload: tuple[str, ...],
    all_system_skills: tuple[str, ...],
    workspace_skill_count: int,
    personal_skill_count: int,
    artifacts: tuple[ArtifactInfo, ...],
    identity: RuntimeIdentity,
    agent_file_path: Path | None,
    history_path: Path,
    tools_path: Path,
    session_path: Path | None,
    dispatch_path: Path | None,
    output_path: Path,
) -> str:
    available_names = {entry.name for entry in available_skills}
    explicit_names = set(explicit_system_skills)
    configured_preload_names = set(configured_preload)
    configured_but_not_observed = sorted(explicit_names - available_names)
    observed_but_not_configured = sorted(available_names - explicit_names)
    disk_skills_not_observed = sorted(set(all_system_skills) - available_names)

    available_block = AVAILABLE_SKILLS_PATTERN.search(system_prompt)
    available_block_text = available_block.group(0) if available_block else ""
    tool_hint_chars = sum(tool.prompt_hint_chars for tool in tools)
    skill_description_ranking = sorted(
        available_skills,
        key=lambda entry: len(entry.description),
        reverse=True,
    )
    tool_hint_ranking = sorted(tools, key=lambda tool: tool.prompt_hint_chars, reverse=True)
    tool_schema_ranking = sorted(tools, key=lambda tool: tool.schema_chars, reverse=True)

    lines = [
        f"# {requested_agent_name} Agent 运行能力盘点报告",
        "",
        "本报告以聊天记录和工具 schema 中的运行快照为事实来源；Agent 配置文件仅用于对照。"
        "脚本不会根据差异自动推断运行时挂载原因。",
        "",
        "## 一、输入来源与身份检查",
        "",
        "| 输入 | 路径 | 修改时间 |",
        "|---|---|---|",
    ]
    for artifact in artifacts:
        lines.append(
            f"| {artifact.label} | `{display_path(artifact.path)}` | {artifact.modified_at} |"
        )

    lines += [
        "",
        "| 身份字段 | 值 |",
        "|---|---|",
        f"| 聊天记录文件名推导 Agent | `{identity.history_agent_name}` |",
        f"| 工具文件名推导 Agent | `{identity.tools_agent_name}` |",
        f"| Agent 配置文件 | {format_optional(identity.agent_file_name)} |",
        f"| session.agent_mode | {format_optional(identity.session_agent_mode)} |",
        f"| session 解析后的 Agent 类型 | {format_optional(identity.session_agent_type)} |",
        f"| dispatch.agent_mode | {format_optional(identity.dispatch_agent_mode)} |",
        f"| dispatch.profile.name | {format_optional(identity.dispatch_profile_name)} |",
        f"| dispatch.profile.role | {format_optional(identity.dispatch_profile_role)} |",
        "",
        "**system prompt 中的 `<role>` 摘要：**",
        "",
        escape_table(identity.prompt_role_preview or "未识别到 `<role>` 内容"),
        "",
        "### 一致性提示",
        "",
    ]
    if identity.warnings:
        lines.extend(f"- {warning}" for warning in identity.warnings)
    else:
        lines.append("- 未发现可由当前输入直接证明的身份不一致。")

    lines.append("")
    if dispatch_path is not None:
        lines.append(
            "注意：dispatch 快照是全局最后一次请求。即使 mode 相同，也不能仅凭文件名证明它与目标聊天记录来自同一轮请求。"
        )
    else:
        lines.append("本次未提供 dispatch 快照，因此不判断请求级动态 Agent Profile。")

    lines += [
        "",
        "## 二、运行快照概览",
        "",
        f"- 实际工具：**{len(tools)} 个**。",
        f"- 实际 `<available_skills>`：**{len(available_skills)} 个**。",
        f"- 实际 `<preloaded_skills>`：**{len(actual_preload)} 个**。",
        f"- Agent 配置声明的 system Skill：**{len(explicit_names)} 个**。",
        f"- Agent 配置声明的 preload Skill：**{len(configured_preload_names)} 个**。",
        f"- 当前磁盘 `agents/skills/` 下有效 Skill：**{len(all_system_skills)} 个**。",
        f"- 扫描到的工作区 Skill：**{workspace_skill_count} 个**；个人 Skill：**{personal_skill_count} 个**。",
        "",
        "工具和 Skill 是两套独立输入：工具通过 schema 暴露，Skill 列表只提供按需读取入口；preload 正文直接进入 system prompt。",
        "",
        "## 三、上下文体积",
        "",
        "| 内容 | 字符数 | 估算 token |",
        "|---|---:|---:|",
        f"| 完整 system message | {len(system_prompt):,} | {estimate_tokens(system_prompt):,} |",
        f"| `<available_skills>` | {len(available_block_text):,} | {estimate_tokens(available_block_text):,} |",
        f"| 工具 schema | {len(tool_schema_text):,} | {estimate_tokens(tool_schema_text):,} |",
        f"| 工具 `get_prompt_hint()` | {tool_hint_chars:,} | {estimate_tokens('x' * tool_hint_chars):,} |",
        "",
        "说明：token 使用字符启发式估算，适合比较相对大小，不代表供应商最终计费值。",
        "",
        f"## 四、实际 available Skill（{len(available_skills)} 个）",
        "",
        "下表中的 `SKILL.md` 规模是磁盘文件大小，不表示正文已经进入初始上下文。"
        "「来源证据」只描述当前输入能够证明的事实，不推断具体运行时分支。",
        "",
        "| Skill | 来源证据 | description 字符 | SKILL.md 行数 | SKILL.md 估算 token | reference | scripts | 包体大小 |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    for entry in available_skills:
        stats = skill_stats.get(entry.name)
        evidence = classify_skill_evidence(
            entry,
            explicit_names,
            configured_preload_names,
        )
        if stats is None:
            lines.append(
                f"| `{entry.name}` | {evidence} | {len(entry.description):,} | - | - | - | - | - |"
            )
            continue
        lines.append(
            f"| `{entry.name}` | {evidence} | {len(entry.description):,} | "
            f"{stats.lines:,} | {stats.estimated_tokens:,} | {stats.reference_files} | "
            f"{stats.script_files} | {format_bytes(stats.total_bytes)} |"
        )

    lines += ["", "## 五、每个 Skill 里面有什么", ""]
    for index, entry in enumerate(available_skills, start=1):
        stats = skill_stats.get(entry.name)
        lines += [
            f"### {index}. `{entry.name}`",
            "",
            f"**触发说明：** {entry.description}",
            "",
        ]
        if entry.location is not None:
            lines.extend([f"**文件：** `{entry.location}`", ""])
        if stats is None:
            lines += ["未能读取对应 `SKILL.md`。", ""]
            continue
        lines += [
            f"**规模：** {stats.lines} 行，{stats.chars:,} 字符，约 {stats.estimated_tokens:,} token；"
            f"reference {stats.reference_files} 个，脚本 {stats.script_files} 个，其它文件 {stats.other_files} 个。",
            "",
            "**正文目录：**",
            "",
        ]
        if stats.headings:
            lines.extend(f"- {heading}" for heading in stats.headings[:16])
            if len(stats.headings) > 16:
                lines.append(f"- 其余 {len(stats.headings) - 16} 个标题已省略")
        else:
            lines.append("- 没有 Markdown 标题")
        lines.append("")

    lines += [
        "## 六、配置与运行快照差异",
        "",
        "### Agent 配置声明，但运行列表未观察到",
        "",
    ]
    lines.extend(
        (f"- `{name}`" for name in configured_but_not_observed),
    )
    if not configured_but_not_observed:
        lines.append("- 无")

    lines += ["", "### 运行列表观察到，但 Agent 配置未声明", ""]
    lines.extend((f"- `{name}`" for name in observed_but_not_configured))
    if not observed_but_not_configured:
        lines.append("- 无")

    lines += [
        "",
        "这些差异可能来自工作区、个人、Crew、运行时注入或输入文件不匹配。脚本不自动选择其中一种解释。",
        "",
        "### 磁盘存在，但运行列表未观察到的内置 Skill",
        "",
    ]
    lines.extend((f"- `{name}`" for name in disk_skills_not_observed))
    if not disk_skills_not_observed:
        lines.append("- 无")

    lines += [
        "",
        f"## 七、实际工具（{len(tools)} 个）",
        "",
        "| 工具 | 参数 | 必填参数 | schema 字符 | prompt hint 字符 | 核心用途 |",
        "|---|---|---|---:|---:|---|",
    ]
    for tool in tools:
        params = ", ".join(f"`{name}`" for name in tool.parameter_names) or "-"
        required = ", ".join(f"`{name}`" for name in tool.required_names) or "-"
        summary = escape_table(tool.description[:180])
        if len(tool.description) > 180:
            summary += "…"
        lines.append(
            f"| `{tool.name}` | {params} | {required} | {tool.schema_chars:,} | "
            f"{tool.prompt_hint_chars:,} | {summary} |"
        )

    lines += [
        "",
        "## 八、按体积生成的审查入口",
        "",
        "以下排序只反映字符体积，不代表内容一定应该删除。",
        "",
        "### Skill description 最大项",
        "",
    ]
    if skill_description_ranking:
        lines.extend(
            f"- `{entry.name}`：{len(entry.description):,} 字符"
            for entry in skill_description_ranking[:5]
        )
    else:
        lines.append("- 无")

    lines += ["", "### 工具 prompt hint 最大项", ""]
    non_empty_hints = [tool for tool in tool_hint_ranking if tool.prompt_hint_chars > 0]
    if non_empty_hints:
        lines.extend(
            f"- `{tool.name}`：{tool.prompt_hint_chars:,} 字符"
            for tool in non_empty_hints[:5]
        )
    else:
        lines.append("- 无")

    lines += ["", "### 工具 schema 最大项", ""]
    if tool_schema_ranking:
        lines.extend(
            f"- `{tool.name}`：{tool.schema_chars:,} 字符"
            for tool in tool_schema_ranking[:5]
        )
    else:
        lines.append("- 无")

    command_parts = [
        "python scripts/report_agent_capability_inventory.py",
        f"  --agent {shlex.quote(requested_agent_name)}",
        f"  --chat-history {shlex.quote(display_path(history_path))}",
        f"  --tools {shlex.quote(display_path(tools_path))}",
    ]
    if agent_file_path is not None:
        command_parts.append(f"  --agent-file {shlex.quote(display_path(agent_file_path))}")
    if session_path is not None:
        command_parts.append(f"  --session {shlex.quote(display_path(session_path))}")
    if dispatch_path is not None:
        command_parts.append(
            f"  --dispatch-message {shlex.quote(display_path(dispatch_path))}"
        )
    command_parts.append(f"  --output {shlex.quote(display_path(output_path))}")

    lines += [
        "",
        "## 九、脚本用法",
        "",
        "```bash",
        "source .venv/bin/activate",
        " \\\n".join(command_parts),
        "```",
        "",
        "脚本只读输入文件，唯一写入是指定的 Markdown 报告。",
        "",
    ]
    return "\n".join(lines)


async def async_main() -> int:
    args = parse_args()
    agent_name = str(args.agent).strip()
    if not agent_name:
        raise ValueError("--agent 不能为空")

    chat_history_path = resolve_project_path(
        args.chat_history or Path(f".chat_history/{agent_name}<main>.json")
    )
    tools_path = resolve_project_path(
        args.tools or Path(f".chat_history/{agent_name}<main>.tools.json")
    )
    output_path = resolve_project_path(
        args.output or Path(f"docs/plans/{agent_name}-agent-capability-inventory.md")
    )

    if args.agent_file is not None:
        derived_agent_file = resolve_project_path(args.agent_file)
        if not await async_exists(derived_agent_file):
            raise FileNotFoundError(derived_agent_file)
        agent_file_path: Path | None = derived_agent_file
    else:
        derived_agent_file = resolve_project_path(Path(f"agents/{agent_name}.agent"))
        agent_file_path = (
            derived_agent_file if await async_exists(derived_agent_file) else None
        )

    if args.session is not None:
        derived_session_path = resolve_project_path(args.session)
        if not await async_exists(derived_session_path):
            raise FileNotFoundError(derived_session_path)
        session_path: Path | None = derived_session_path
    else:
        derived_session_path = resolve_project_path(
            Path(f".chat_history/{agent_name}<main>.session.json")
        )
        session_path = (
            derived_session_path if await async_exists(derived_session_path) else None
        )

    dispatch_path: Path | None = None
    if args.dispatch_message is not None:
        derived_dispatch_path = resolve_project_path(args.dispatch_message)
        if not await async_exists(derived_dispatch_path):
            raise FileNotFoundError(derived_dispatch_path)
        dispatch_path = derived_dispatch_path

    for path in (chat_history_path, tools_path):
        if not await async_exists(path):
            raise FileNotFoundError(path)

    explicit_system_skills: tuple[str, ...] = ()
    configured_preload: tuple[str, ...] = ()
    if agent_file_path is not None:
        agent_content = await async_read_text(agent_file_path)
        frontmatter = parse_agent_frontmatter(agent_content)
        explicit_system_skills, configured_preload, _, _ = extract_agent_skill_config(
            frontmatter
        )

    chat_history = await async_read_json(chat_history_path)
    system_prompt = extract_system_prompt(chat_history)
    available_skills = extract_available_skills(system_prompt)
    actual_preload = extract_preloaded_skill_names(system_prompt)
    hint_sizes = extract_tool_hints(system_prompt)

    tools_payload = await async_read_json(tools_path)
    tools = parse_tool_entries(tools_payload, hint_sizes)
    tool_schema_text = json.dumps(
        tools_payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    skill_stats: dict[str, SkillFileStats | None] = {}
    for entry in available_skills:
        skill_stats[entry.name] = await collect_skill_stats(entry.location)

    all_system_skills = await discover_system_skill_names()
    workspace_skill_count = await count_external_skills(
        PROJECT_ROOT / ".workspace" / ".magic" / "skills"
    )
    personal_skill_count = await count_external_skills(Path.home() / ".magic" / "skills")

    session_payload = await async_read_json(session_path) if session_path is not None else None
    dispatch_payload = (
        await async_read_json(dispatch_path) if dispatch_path is not None else None
    )
    identity = build_runtime_identity(
        history_path=chat_history_path,
        tools_path=tools_path,
        agent_file_path=agent_file_path,
        session_payload=session_payload,
        dispatch_payload=dispatch_payload,
        system_prompt=system_prompt,
    )

    artifact_paths: list[tuple[str, Path]] = [
        ("聊天记录", chat_history_path),
        ("工具 schema", tools_path),
    ]
    if agent_file_path is not None:
        artifact_paths.append(("Agent 配置", agent_file_path))
    if session_path is not None:
        artifact_paths.append(("session", session_path))
    if dispatch_path is not None:
        artifact_paths.append(("最后一次 dispatch 快照", dispatch_path))
    artifacts = tuple(
        [await build_artifact_info(label, path) for label, path in artifact_paths]
    )

    report = build_report(
        requested_agent_name=agent_name,
        system_prompt=system_prompt,
        available_skills=available_skills,
        skill_stats=skill_stats,
        tools=tools,
        tool_schema_text=tool_schema_text,
        explicit_system_skills=explicit_system_skills,
        configured_preload=configured_preload,
        actual_preload=actual_preload,
        all_system_skills=all_system_skills,
        workspace_skill_count=workspace_skill_count,
        personal_skill_count=personal_skill_count,
        artifacts=artifacts,
        identity=identity,
        agent_file_path=agent_file_path,
        history_path=chat_history_path,
        tools_path=tools_path,
        session_path=session_path,
        dispatch_path=dispatch_path,
        output_path=output_path,
    )
    await async_write_text(output_path, report)
    print(output_path)
    return 0


def main() -> int:
    return asyncio.run(async_main())


if __name__ == "__main__":
    raise SystemExit(main())
