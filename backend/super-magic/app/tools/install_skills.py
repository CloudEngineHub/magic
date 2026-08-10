"""install_skills 工具：统一批量安装/升级 Skill

所有来源的 skill 安装唯一入口；旁路安装路径（shell 直调 skillhub/clawhub/npx 等）
已在 shell_exec handler 层面被拦截并引导至本工具。
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.core.skill_utils.installer import InstallBatchResult, InstallResult, InstallService, SkillRef
from app.core.skill_utils.skill_sources import get_personal_skills_dir, get_workspace_skills_dir
from app.i18n import i18n
from app.tools.core import AutoMount, BaseTool, BaseToolParams, tool
from app.utils.async_file_utils import async_exists, async_is_dir, async_iterdir

logger = get_logger(__name__)

_VALID_PROVIDERS = {"my_library", "market", "skillhub", "clawhub", "npx", "github"}
_MAX_CONCURRENCY = 3

InstallScope = Literal["workspace", "personal"]


class InstallSkillItem(BaseToolParams):
    """单条安装请求"""

    scope: InstallScope = Field(
        "workspace",
        description=(
            "<!--zh: 当前 skill 的安装范围。workspace=当前项目；personal=当前用户的 ~/.magic/skills 目录。"
            "默认为 workspace。-->\n"
            "Installation scope for this skill. "
            "workspace installs into the current project; personal installs into the current user's ~/.magic/skills directory. "
            "Defaults to workspace."
        ),
    )
    provider: str = Field(
        ...,
        description=(
            "<!--zh: 安装来源。可选值：my_library（我的技能库）| market（Magic 市场）| "
            "skillhub（社区）| clawhub（ClawHub 生态）| npx（npm/npx）| github（GitHub 仓库 URL）-->\n"
            "Install source. Options: my_library | market | skillhub | clawhub | npx | github"
        ),
    )
    id: str = Field(
        ...,
        description=(
            "<!--zh: provider 内唯一标识。my_library/market 用 code；skillhub/clawhub 用 slug；"
            "npx 用 GitHub 仓库路径（owner/repo），如需指定仓库内某个 skill 用 owner/repo#skill-name；"
            "github 用完整仓库 URL（支持子目录）-->\n"
            "Unique ID within the provider: code for my_library/market; "
            "slug for skillhub/clawhub; "
            "for npx: GitHub repo path like 'owner/repo', or 'owner/repo#skill-name' to target a specific skill; "
            "full GitHub URL for github."
        ),
    )
    mode: Literal["install", "upgrade"] = Field(
        "install",
        description=(
            "<!--zh: install=安装（已有同版本时跳过）；upgrade=升级到最新版本-->\n"
            "install: skip if same version exists; upgrade: update to latest version."
        ),
    )
    @field_validator("provider")
    @classmethod
    def _validate_provider(cls, v: str) -> str:
        if v not in _VALID_PROVIDERS:
            raise ValueError(
                f"provider '{v}' 无效，可选值: {', '.join(sorted(_VALID_PROVIDERS))}"
            )
        return v

    @field_validator("id")
    @classmethod
    def _validate_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("id 不能为空")
        return v.strip()


class InstallSkillsParams(BaseToolParams):
    """install_skills 工具参数"""

    items: List[InstallSkillItem] = Field(
        ...,
        description=(
            "<!--zh: 要安装/升级的 skill 列表，按安装范围分组并在组内并发执行，"
            "各条独立成败，最多 10 条-->\n"
            "List of skills to install/upgrade (max 10). Grouped by installation scope and executed "
            "with bounded concurrency; each item succeeds or fails independently."
        ),
        min_length=1,
        max_length=10,
    )

    @field_validator("items", mode="before")
    @classmethod
    def _parse_items(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except (json.JSONDecodeError, ValueError):
                pass
        return v

    @model_validator(mode="after")
    def _check_no_dup_ids(self) -> "InstallSkillsParams":
        """同一安装范围内不允许相同 (provider, id) 重复。"""
        seen: set[tuple] = set()
        for item in self.items:
            key = (item.scope, item.provider, item.id)
            if key in seen:
                raise ValueError(
                    f"批次中存在重复条目：scope='{item.scope}' "
                    f"provider='{item.provider}' id='{item.id}'"
                )
            seen.add(key)
        return self


@tool(auto_mount=AutoMount.SKILLS)
class InstallSkillsTool(BaseTool[InstallSkillsParams]):
    """<!--zh
    批量安装或升级 skill 的**唯一入口**。
    支持来源：my_library（我的技能库）、market（Magic 市场）、
    skillhub（外部社区）、clawhub（ClawHub 生态）、npx（npm 包）、github（GitHub 仓库）。
    每条 item 可通过 scope=workspace 安装到当前项目，或通过 scope=personal 安装到个人目录。
    mode=install：同版本已存在时跳过；mode=upgrade：升级到最新或指定版本。
    各条独立成败，不因单条失败而中止整批。
    -->
    Batch install or upgrade Skills through the only supported installation entry point.
    Obtain explicit user confirmation before installing or upgrading any external Skill. A direct
    user request to install or upgrade counts as confirmation; an Agent selecting a search result
    does not. Load system built-ins directly with read_skills and never pass them to this tool.
    Supported sources: my_library, market, skillhub, clawhub, npx, and github. Each item may use
    scope=workspace for the current project or scope=personal for the user's personal directory.
    mode=install skips an existing identical version; mode=upgrade updates to the latest version.
    Items succeed or fail independently; one failure does not abort the batch.
    """

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        args = arguments or {}
        items = args.get("items", [])
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except (json.JSONDecodeError, ValueError):
                items = []
        ids = [
            item.get("id", "")
            for item in items
            if isinstance(item, dict) and item.get("id")
        ]
        ids_str = "、".join(ids) if ids else ""
        scope = _resolve_list_items_scope(items)

        installing_key = "install_skills.installing"
        if scope == "workspace":
            installing_key = "install_skills.installing.workspace"
        elif scope == "personal":
            installing_key = "install_skills.installing.personal"

        return {
            "action": i18n.translate("install_skills", category="tool.actions"),
            "remark": i18n.translate(installing_key, category="tool.messages", ids=ids_str),
            "tool_name": tool_name,
        }

    async def execute(self, tool_context: ToolContext, params: InstallSkillsParams) -> ToolResult:
        # 对 my_library / market，尝试将 skill name 自动解析为 source_id
        _sdk_providers = {"my_library", "market"}

        async def _maybe_resolve(item: InstallSkillItem) -> str:
            """在当前条目的安装范围内解析 SDK provider 的 source_id。"""
            if item.provider in _sdk_providers:
                install_dir = _get_install_dir(item.scope)
                return await self._resolve_source_id(item.provider, item.id, install_dir)
            return item.id

        resolved_ids = await asyncio.gather(*[
            _maybe_resolve(item) for item in params.items
        ])

        grouped_refs: dict[InstallScope, list[tuple[int, SkillRef]]] = {}
        for index, (item, resolved_id) in enumerate(zip(params.items, resolved_ids)):
            ref = SkillRef(
                provider=item.provider,
                id=resolved_id,
                mode=item.mode,
            )
            grouped_refs.setdefault(item.scope, []).append((index, ref))

        batch_result = await self._install_refs_by_scope(grouped_refs)

        content = _format_batch_result(batch_result)
        ok = batch_result.failed_count == 0
        upgraded_count = sum(1 for r in batch_result.items if r.status == "upgraded")
        installed_count = sum(1 for r in batch_result.items if r.status == "installed")
        resolved_scope = _resolve_scope_from_grouped(grouped_refs)

        return ToolResult(
            ok=ok,
            content=content,
            extra_info={
                "ok_count": batch_result.ok_count,
                "failed_count": batch_result.failed_count,
                "installed_count": installed_count,
                "upgraded_count": upgraded_count,
                "scope": resolved_scope,
                # 供 get_tool_detail 展示用的 Markdown，与给模型的 XML 分离
                "md_content": _format_batch_result_md(batch_result),
            },
        )

    async def _install_refs_by_scope(
        self,
        grouped_refs: dict[InstallScope, list[tuple[int, SkillRef]]],
    ) -> InstallBatchResult:
        """按安装范围顺序执行各组，并按原始条目顺序合并安装结果。"""
        results_by_index: dict[int, list[InstallResult]] = {}
        for scope, indexed_refs in grouped_refs.items():
            refs = [ref for _, ref in indexed_refs]
            service = InstallService(target_dir=_get_install_dir(scope))
            scoped_result = await service.install_many(refs, max_concurrency=_MAX_CONCURRENCY)
            split_results = _split_install_results(refs, scoped_result.items)
            for (original_index, _), item_results in zip(indexed_refs, split_results):
                results_by_index[original_index] = item_results

        ordered_results = [
            result
            for index in sorted(results_by_index)
            for result in results_by_index.get(index, [])
        ]
        return InstallBatchResult(items=ordered_results)

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Dict[str, Any] = None,
    ) -> Optional[ToolDetail]:
        extra = result.extra_info or {}
        md_content = extra.get("md_content")
        if not md_content:
            return None
        ok = extra.get("ok_count", 0)
        failed = extra.get("failed_count", 0)
        file_name = f"install_skills_ok{ok}_failed{failed}.md"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(
                file_name=file_name,
                content=md_content,
            ),
        )

    async def _resolve_source_id(
        self,
        provider: str,
        skill_id: str,
        install_dir: Path | None = None,
    ) -> str:
        """将 my_library / market 的 skill name 解析为 source_id。

        LLM 在 read_skills 时只能获取 skill name，而这两个 provider 的安装接口需要 source_id。
        扫描当前安装范围内的 manifest，若找到 name 匹配且 provider 一致的条目，返回其 source_id；
        否则原值返回（兼容 LLM 直接传入正确 source_id 的场景）。
        """
        from app.core.skill_utils.manifest import read_manifest

        install_dir = install_dir or get_workspace_skills_dir()
        try:
            if not await async_exists(install_dir):
                return skill_id

            entries = []
            for entry in await async_iterdir(install_dir):
                if await async_is_dir(entry):
                    entries.append(entry)
            for entry in entries:
                manifest = await asyncio.to_thread(read_manifest, entry)
                if (
                    manifest
                    and manifest.provider == provider
                    and manifest.name == skill_id
                    and manifest.source_id
                    and manifest.source_id != skill_id
                ):
                    logger.info(
                        f"[install_skills] 将 skill name '{skill_id}' 解析为 source_id '{manifest.source_id}'"
                    )
                    return manifest.source_id
        except Exception as e:
            logger.debug(f"[install_skills] 解析 source_id 失败: {e}")
        return skill_id

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        extra = result.extra_info or {}
        ok = extra.get("ok_count", 0)
        failed = extra.get("failed_count", 0)
        installed = extra.get("installed_count", 0)
        upgraded = extra.get("upgraded_count", 0)
        scope = extra.get("scope")
        suffix = f".{scope}" if scope in ("workspace", "personal") else ""
        if failed == 0:
            if upgraded > 0 and installed == 0:
                return i18n.translate(f"install_skills.upgraded{suffix}", category="tool.messages", count=upgraded)
            if upgraded > 0 and installed > 0:
                return i18n.translate(f"install_skills.mixed_success{suffix}", category="tool.messages", installed=installed, upgraded=upgraded)
            return i18n.translate(f"install_skills.success{suffix}", category="tool.messages", count=ok)
        if ok == 0:
            return i18n.translate("install_skills.failed", category="tool.messages", count=failed)
        return i18n.translate(f"install_skills.partial{suffix}", category="tool.messages", ok=ok, failed=failed)


def _get_install_dir(scope: InstallScope) -> Path:
    """根据安装范围返回对应的 Skill 根目录。"""
    if scope == "personal":
        return get_personal_skills_dir()
    return get_workspace_skills_dir()


def _resolve_list_items_scope(items: List[Any]) -> Optional[str]:
    """解析安装列表的 scope；统一时返回 scope 值，混合或缺失时返回 None。"""
    scopes: set[str] = set()
    for item in items:
        if isinstance(item, dict):
            scopes.add(item.get("scope", "workspace"))
    if len(scopes) == 1:
        return scopes.pop()
    return None


def _resolve_scope_from_grouped(
    grouped_refs: Dict[InstallScope, List[tuple[int, "SkillRef"]]],
) -> Optional[str]:
    """解析分组后的安装结果 scope；统一时返回 scope 值，混合时返回 None。"""
    if len(grouped_refs) == 1:
        return next(iter(grouped_refs))
    return None


def _result_matches_ref(result: InstallResult, ref: SkillRef) -> bool:
    """判断安装结果是否属于指定的 Skill 引用。"""
    return (
        result.provider == ref.provider
        and result.skill_id == ref.id
        and result.mode == ref.mode
    )


def _split_install_results(
    refs: list[SkillRef],
    results: list[InstallResult],
) -> list[list[InstallResult]]:
    """按输入引用拆分扁平安装结果，支持单个引用产生多个 Skill 结果。"""
    if len(refs) == len(results) and all(
        _result_matches_ref(result, ref) for ref, result in zip(refs, results)
    ):
        return [[result] for result in results]

    split_results: list[list[InstallResult]] = []
    cursor = 0
    for ref in refs:
        item_results: list[InstallResult] = []
        while cursor < len(results) and _result_matches_ref(results[cursor], ref):
            item_results.append(results[cursor])
            cursor += 1
        split_results.append(item_results)

    if cursor < len(results):
        logger.warning("安装结果与输入引用顺序不一致，按引用重新归并剩余结果")
        for result in results[cursor:]:
            matched = False
            for index, ref in enumerate(refs):
                if _result_matches_ref(result, ref):
                    split_results[index].append(result)
                    matched = True
                    break
            if not matched and split_results:
                split_results[-1].append(result)

    return split_results


def _format_batch_result(batch_result) -> str:
    lines = [
        f'<install_batch ok="{batch_result.ok_count}" failed="{batch_result.failed_count}">'
    ]
    for r in batch_result.items:
        attrs = (
            f'provider="{r.provider}" id="{r.skill_id}" mode="{r.mode}" '
            f'result="{r.status}" version="{r.version}"'
        )
        if r.path:
            attrs += f' path="{r.path}"'
        msg = r.message.replace('"', "&quot;")
        lines.append(f'  <item {attrs} message="{msg}" />')

    # 对成功安装/升级的 skill，给出加载指引
    ready_names = [
        r.name for r in batch_result.items
        if r.ok and r.name and r.status in ("installed", "upgraded")
    ]
    if ready_names:
        names_repr = ", ".join(f'"{n}"' for n in ready_names)
        lines.append(
            f'  <next_step>Skill(s) are ready. '
            f'Call read_skills with skill_names=[{names_repr}] to load and use them.</next_step>'
        )

    lines.append("</install_batch>")
    return "\n".join(lines)


# ── Markdown 展示格式（供 get_tool_detail 渲染，与给模型的 XML 完全独立） ────────

_PROVIDER_LABEL: dict[str, str] = {
    "my_library": "我的技能库",
    "market":     "Magic 市场",
    "skillhub":   "SkillHub",
    "clawhub":    "ClawHub",
    "npx":        "NPX",
    "github":     "GitHub",
}

_STATUS_LABEL: dict[str, str] = {
    "installed":            "已安装",
    "upgraded":             "已升级",
    "already_installed":    "已是最新",
    "failed":               "失败",
    "provider_unavailable": "来源不可用",
}

_MSG_MAX_LEN = 60


def _truncate_msg(s: str, max_len: int = _MSG_MAX_LEN) -> str:
    s = s.strip().replace("\n", " ").replace("\r", "")
    return s if len(s) <= max_len else s[:max_len] + "..."


def _format_batch_result_md(batch_result) -> str:
    ok = batch_result.ok_count
    failed = batch_result.failed_count
    total = ok + failed

    lines: list[str] = []

    # 标题摘要
    summary_parts = [f"共 **{total}** 条"]
    if ok:
        summary_parts.append(f"成功 **{ok}**")
    if failed:
        summary_parts.append(f"失败 **{failed}**")
    lines.append("**安装结果**：" + "，".join(summary_parts) + "\n")

    # 明细表格
    lines.append("| 名称 | 来源 | 操作 | 状态 | 版本 | 说明 |")
    lines.append("|------|------|------|------|------|------|")

    for r in batch_result.items:
        name_cell = f"**{r.name}**" if r.name else f"`{r.skill_id}`"
        provider_cell = _PROVIDER_LABEL.get(r.provider, r.provider)
        mode_cell = "升级" if r.mode == "upgrade" else "安装"
        status_label = _STATUS_LABEL.get(r.status, r.status)
        # 失败类状态加粗提示
        status_cell = f"**{status_label}**" if not r.ok else status_label
        version_cell = r.version if r.version else "-"
        msg_cell = _truncate_msg(r.message) if r.message else "-"
        lines.append(f"| {name_cell} | {provider_cell} | {mode_cell} | {status_cell} | {version_cell} | {msg_cell} |")

    return "\n".join(lines)
