"""find_skills 工具：按搜索位置聚合检索 Skill

对模型暴露搜索关键词和搜索位置；具体 Provider、排序权重、top_k 等由内部决定。
检索结果按关键词分组返回，并保留 Provider 信息供后续安装使用。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional

from pydantic import ConfigDict, Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.core.skill_utils.search_service import KeywordResult, SearchAggregator, SearchResult
from app.i18n import i18n
from app.tools.core import BaseTool, BaseToolParams, tool

logger = get_logger(__name__)


# npx / github 不支持搜索，不作为 find_skills 的有效来源
# system 聚合本地已可用 skill，其他来源通过互联网检索
_VALID_PROVIDERS = {"system", "my_library", "market", "skillhub", "clawhub"}
_LOCAL_SEARCH_PROVIDERS = ("system",)
_ONLINE_SEARCH_PROVIDERS = ("my_library", "market", "skillhub", "clawhub")

SearchScope = Literal["local", "online", "auto"]


class FindSkillsParams(BaseToolParams):
    """find_skills 工具参数"""

    model_config = ConfigDict(extra="forbid")

    keywords: List[str] = Field(
        default_factory=list,
        description=(
            "<!--zh: 搜索关键词或意图描述（数组），每个关键词独立检索后归并去重。"
            "若要列出全部本地可用 skill，传空数组 [] 并设置 search_scope=\"local\"。"
            "例如：[\"天气\", \"日历同步\"]-->\n"
            "Search keywords or intent descriptions (array); each keyword is queried independently then merged. "
            "To list all locally available skills, pass [] and set search_scope=\"local\". "
            "E.g. [\"weather\", \"calendar sync\"]."
        ),
        max_length=10,
    )
    query: Optional[str] = Field(
        None,
        description=(
            "<!--zh: 用户的完整需求描述（可选）。填写后会辅助打分，使结果更贴合实际意图。"
            "例如：\"我需要查询中国城市的实时天气和未来三天预报\"-->\n"
            "Full user requirement description (optional). When provided, it assists scoring "
            "alongside keywords to improve result accuracy. "
            "E.g. \"I need to query real-time weather and 3-day forecast for Chinese cities\"."
        ),
    )
    search_scope: SearchScope = Field(
        "auto",
        description=(
            "<!--zh: 搜索位置。local=搜索本地已可直接读取的 skill；"
            "online=搜索互联网来源；auto=先搜索本地，没有有效候选时再搜索互联网。"
            "本地结果无需安装；互联网结果会返回 provider 和 id，供 install_skills 使用。-->\n"
            "Search location. local searches skills already available on this machine; "
            "online searches internet sources; auto searches locally first and only searches online "
            "when no relevant local candidate is found. "
            "Local results can be read directly. Online results include provider and id for install_skills."
        ),
    )

    @field_validator("keywords", mode="before")
    @classmethod
    def _validate_keywords(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except json.JSONDecodeError:
                raise ValueError(f"keywords 格式无效，应为数组，收到字符串: {v!r}")
        return v

    @model_validator(mode="after")
    def _validate_empty_keywords(self) -> "FindSkillsParams":
        if not self.keywords and self.search_scope == "online":
            raise ValueError(
                "search_scope=\"online\" 时 keywords 不能为空"
            )
        return self

    def resolve_providers(self) -> List[str]:
        """将模型填写的搜索位置转换为内部 Provider 列表。"""
        if self.search_scope == "local":
            return list(_LOCAL_SEARCH_PROVIDERS)
        if self.search_scope == "online":
            return list(_ONLINE_SEARCH_PROVIDERS)
        return []


@tool()
class FindSkillsTool(BaseTool[FindSkillsParams]):
    """<!--zh
    按关键词在本地或互联网检索可用 skill。
    search_scope=local 搜索本地已可用 skill；search_scope=online 搜索互联网来源；
    search_scope=auto 先搜索本地，仅对没有本地候选的关键词继续搜索互联网。
    支持多关键词批量检索，结果按关键词分组，附带推荐项和使用指引。
    找到候选后：
    - provider=system：直接调用 read_skills 加载，无需安装；
    - 其他来源：有 ≥2 个候选时先用 ask_user(multi_select) 让用户选择，再调用 install_skills 安装；
      只有 1 个强匹配时，可直接向用户确认后安装。
    调用 install_skills 时必须原样使用候选结果中的 provider 和 id。
    若用户想查看全部本地可用 skill，使用 keywords=[] + search_scope="local"。
    -->
    Search for available skills locally or through internet sources.
    Use search_scope=local for skills already available on this machine, online for internet sources,
    or auto to search locally first and only search online for keywords with no local candidates.
    Supports multiple keywords; results are grouped by keyword with recommendations and usage hints.
    For provider=system candidates: load directly with read_skills, no install needed.
    For other candidates: when ≥2 exist, call ask_user(multi_select) before install_skills.
    For a single strong match, confirm with the user then install directly.
    Pass the candidate provider and id unchanged to install_skills.
    To list all locally available skills, use keywords=[] with search_scope="local".
    """

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        args = arguments or {}
        scope = args.get("search_scope", "auto")
        kws = args.get("keywords", [])
        if isinstance(kws, str):
            try:
                kws = json.loads(kws)
            except (json.JSONDecodeError, ValueError):
                kws = []
        kw_str = "、".join(kws) if kws else i18n.translate("find_skills.keywords_all", category="tool.messages")

        action_key = "find_skills" if scope == "auto" else f"find_skills.{scope}"
        if scope == "local":
            searching_key = "find_skills.searching.local_keyword" if kws else "find_skills.searching.local"
        elif scope == "online":
            searching_key = "find_skills.searching.online"
        else:
            searching_key = "find_skills.searching.auto"

        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": i18n.translate(searching_key, category="tool.messages", keywords=kw_str),
            "tool_name": tool_name,
        }

    async def execute(self, tool_context: ToolContext, params: FindSkillsParams) -> ToolResult:
        aggregator = SearchAggregator()
        providers = params.resolve_providers()
        result = await self._search(aggregator, params, providers)
        content = _format_result(result)

        total = sum(len(kr.candidates) for kr in result.keyword_results)
        return ToolResult(
            ok=True,
            content=content,
            extra_info={
                "total_candidates": total,
                "keywords": params.keywords,
                "providers": providers,
                "search_scope": params.search_scope,
                # 供 get_tool_detail 展示用的 Markdown，与给模型的 XML 分离
                "md_content": _format_result_md(result),
            },
        )

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        extra = result.extra_info or {}
        total = extra.get("total_candidates", 0)
        kws = extra.get("keywords", [])
        scope = extra.get("search_scope", "auto")
        kw_str = "、".join(kws) if kws else i18n.translate("find_skills.keywords_all", category="tool.messages")

        if scope == "local":
            searched_key = "find_skills.searched.local_keyword" if kws else "find_skills.searched.local"
        elif scope == "online":
            searched_key = "find_skills.searched.online"
        else:
            searched_key = "find_skills.searched.auto"

        return i18n.translate(
            searched_key,
            category="tool.messages",
            keywords=kw_str,
            total=total,
        )

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
        kws = extra.get("keywords", [])
        file_name = f"find_skills_{'_'.join(kws) or 'all'}.md"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(
                file_name=file_name,
                content=md_content,
            ),
        )

    async def _search(
        self,
        aggregator: SearchAggregator,
        params: FindSkillsParams,
        providers: List[str],
    ) -> SearchResult:
        """根据搜索位置执行单范围搜索或本地优先的自动降级搜索。"""
        if params.search_scope != "auto":
            return await aggregator.search_many(
                params.keywords,
                providers=providers,
                query=params.query,
            )

        local_result = await aggregator.search_many(
            params.keywords,
            providers=list(_LOCAL_SEARCH_PROVIDERS),
            query=params.query,
        )
        if not params.keywords:
            return local_result

        missing_keywords = [
            keyword_result.keyword
            for keyword_result in local_result.keyword_results
            if not keyword_result.candidates
        ]
        if not missing_keywords:
            return local_result

        online_result = await aggregator.search_many(
            missing_keywords,
            providers=list(_ONLINE_SEARCH_PROVIDERS),
            query=params.query,
        )
        return self._merge_auto_results(local_result, online_result)

    @staticmethod
    def _merge_auto_results(
        local_result: SearchResult,
        online_result: SearchResult,
    ) -> SearchResult:
        """将缺少本地候选的关键词替换为对应的互联网搜索结果。"""
        online_results = iter(online_result.keyword_results)
        merged_results: List[KeywordResult] = []

        for local_keyword_result in local_result.keyword_results:
            if local_keyword_result.candidates:
                merged_results.append(local_keyword_result)
                continue

            online_keyword_result = next(online_results, None)
            if online_keyword_result is None:
                merged_results.append(local_keyword_result)
                continue

            provider_errors = dict(local_keyword_result.provider_errors)
            provider_errors.update(online_keyword_result.provider_errors)
            merged_results.append(
                KeywordResult(
                    keyword=local_keyword_result.keyword,
                    candidates=online_keyword_result.candidates,
                    provider_errors=provider_errors,
                )
            )

        return SearchResult(keyword_results=merged_results)


# ── 格式化 ────────────────────────────────────────────────────────────────────


def _format_result(result: SearchResult) -> str:
    lines = ["<find_skills_result>"]

    has_any = False
    for kr in result.keyword_results:
        total = len(kr.candidates)
        lines.append(f'  <keyword value="{_esc(kr.keyword)}" total_candidates="{total}">')

        for c in kr.candidates:
            version_attr = f' version="{_esc(c.version)}"' if c.version else ""
            score_attr = f' score="{c.score:.2f}"'
            desc_attr = f' description="{_esc(c.description)}"' if c.description else ""
            builtin_attr = ' builtin="true"' if c.provider.value == "system" else ""
            lines.append(
                f'    <candidate provider="{c.provider.value}" id="{_esc(c.id)}" '
                f'name="{_esc(c.name)}"{version_attr}{score_attr}{desc_attr}{builtin_attr} />'
            )
            has_any = True

        # 报告该关键词的 provider 错误
        for pid, err in (kr.provider_errors or {}).items():
            lines.append(f'    <error provider="{pid}" message="{_esc(err)}" />')

        lines.append("  </keyword>")

    # 全量列出时不输出 recommendation / next_step（结果无排序意义，无需引导安装）
    is_list_all = all(not kr.keyword for kr in result.keyword_results)

    if not is_list_all:
        # 推荐项（取所有候选中分最高的）
        all_candidates = result.all_candidates
        if all_candidates:
            top = all_candidates[0]
            rec = (
                f'For best match, recommend {top.provider.value}:{top.id} ("{top.name}"). '
                "Review all candidates before installing."
            )
            lines.append(f"  <recommendation>{rec}</recommendation>")

        # next_step 指引
        if has_any:
            lines.append(
                "  <next_step>"
                "For builtin=true candidates (provider=system): they are pre-installed; "
                "load them directly with read_skills(skill_names=[\"<id>\"]). No install needed. "
                "For other candidates: if multiple exist, use ask_user(multi_select) to let the user choose, "
                "then call install_skills(items=[{provider:..., id:..., mode:\"install\"}]). "
                "If only one strong match exists, you may call install_skills directly after confirming with the user."
                "</next_step>"
            )
        else:
            lines.append(
                "  <next_step>"
                "No candidates found. Try different keywords or a more specific description."
                "</next_step>"
            )

    lines.append("</find_skills_result>")
    return "\n".join(lines)


def _esc(s: str | None) -> str:
    if not s:
        return ""
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


# ── Markdown 展示格式（供 get_tool_detail 渲染，与给模型的 XML 完全独立） ────────

_PROVIDER_LABEL: dict[str, str] = {
    "system":     "内置",
    "my_library": "我的技能库",
    "market":     "Magic 市场",
    "skillhub":   "SkillHub",
    "clawhub":    "ClawHub",
    "npx":        "NPX",
    "github":     "GitHub",
}

_DESC_MAX_LEN = 80


def _truncate(s: str, max_len: int = _DESC_MAX_LEN) -> str:
    s = s.strip().replace("\n", " ").replace("\r", "")
    return s if len(s) <= max_len else s[:max_len] + "..."


def _format_result_md(result: SearchResult) -> str:
    lines: list[str] = []

    total = sum(len(kr.candidates) for kr in result.keyword_results)
    kws = [kr.keyword for kr in result.keyword_results if kr.keyword]

    # 标题行
    if kws:
        kw_str = "、".join(f"`{kw}`" for kw in kws)
        lines.append(f"**搜索关键词**：{kw_str}　共找到 **{total}** 个候选\n")
    else:
        lines.append(f"全量列出　共 **{total}** 个 Skill\n")

    has_any = False
    for kr in result.keyword_results:
        if not kr.candidates and not kr.provider_errors:
            continue

        kw_label = f"`{kr.keyword}`" if kr.keyword else "全部"
        lines.append(f"---\n\n### {kw_label}（{len(kr.candidates)} 个结果）\n")

        if kr.candidates:
            lines.append("| 名称 | 来源 | 描述 |")
            lines.append("|------|------|------|")
            for c in kr.candidates:
                label = _PROVIDER_LABEL.get(c.provider.value, c.provider.value)
                name_cell = f"**{c.name}** `内置`" if c.provider.value == "system" else f"**{c.name}**"
                # 版本号拼入来源列
                version_note = f" · {c.version}" if c.version else ""
                source_cell = f"{label}{version_note}"
                desc_cell = _truncate(c.description) if c.description else "-"
                lines.append(f"| {name_cell} | {source_cell} | {desc_cell} |")
            lines.append("")
            has_any = True

        for pid, err in (kr.provider_errors or {}).items():
            label = _PROVIDER_LABEL.get(pid, pid)
            lines.append(f"> **{label}** 搜索失败：{err}\n")

    # 全量列出时不输出推荐（无排序意义）
    is_list_all = not kws
    if not is_list_all:
        all_c = result.all_candidates
        if all_c:
            top = all_c[0]
            label = _PROVIDER_LABEL.get(top.provider.value, top.provider.value)
            action = "读取" if top.provider.value == "system" else "安装"
            lines.append(f"---\n\n**最佳推荐**：`{top.id}`（{label} · {top.name}）\n")
            if top.provider.value == "system":
                lines.append(f"> 内置 Skill，可直接使用 `read_skills(skill_names=[\"{top.id}\"])` 加载，无需安装。")
            else:
                lines.append(f"> 可通过 `install_skills` {action}后使用。")

    if not has_any:
        lines.append("\n---\n\n> 未找到匹配的 Skill，请尝试不同的关键词。")

    return "\n".join(lines)
