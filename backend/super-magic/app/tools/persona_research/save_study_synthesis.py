"""save_study_synthesis：写入 synthesis.json，并把假设结论写回 study.json。

模型使用说明：agents/skills/persona-research/reference/tools.md（code_mode_only，完整用法只维护在 Skill）。

模型只给判断：主题、各人设立场、引用哪句原话、结论和可信度。工具负责以前要靠模型
手算、又经常算错的部分（5 次研究里每次都在自检时删掉 1-9 条引文，再写 Python 返工）：

| 工作                      | 规则来源（methods.md）         | 工具行为                                              |
| 引文 file + round_index    | Quote Self-Check               | 只按原文在该人设自己的发言里查找；找不到就不保存并列出 |
| 主题、维度、分层 ID        | file-contracts.md              | 自动编号 T1、D1、seg_1                                |
| 立场补全                   | Theme Coding                   | 没写到的已访谈人设补成 not_mentioned                   |
| 饱和度                     | Saturation                     | 按 panel.json 顺序数每份完成访谈首次出现的主题数       |
| 可信度上限                 | Theme Confidence Rules         | 外部来源不够时下调，并在 confidence_reason 写明         |
| 结论上限                   | Hypothesis Verdict Rules       | 只有 AI 访谈支撑的 supported/refuted 改为 mixed         |
| 降权访谈                   | Downweighting                  | inferred_ratio ≥ 0.4 的访谈不能单独撑起 high/medium     |

「多数相关访谈是否支持」需要判断哪些访谈相关，仍由模型决定；工具只执行确定的上限。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.persona_research.contracts import (
    DOWNWEIGHT_INFERRED_RATIO,
    SCHEMA_VERSION,
    Agreement,
    Confidence,
    Level,
    Stance,
    Study,
    StudyPhase,
    TranscriptStatus,
    Verdict,
)
from app.tools.persona_research.study_files import (
    QuoteLocation,
    StudyFilesError,
    Transcript,
    compute_inferred_ratio,
    load_study,
    load_transcripts,
    locate_quote,
    read_json_file,
    read_source_ids,
    resolve_study_dir,
    save_study,
    write_json_file,
)
from app.tools.workspace_tool import WorkspaceTool

_CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


class QuoteInput(BaseModel):
    persona_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, description="The persona's exact words; the tool finds file and round_index.")


class SegmentInput(BaseModel):
    name: str = Field(..., min_length=1, description="Equals a study.json quota segment.")
    persona_ids: List[str] = Field(default_factory=list)


class ThemeInput(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    stance_by_persona: Dict[str, Stance] = Field(default_factory=dict)
    quotes: List[QuoteInput] = Field(default_factory=list)
    source_refs: List[str] = Field(default_factory=list)
    hypothesis_ids: List[str] = Field(default_factory=list)
    confidence: Confidence
    confidence_reason: str = ""


class DimensionInput(BaseModel):
    name: str = Field(..., min_length=1)
    level_by_segment: Dict[str, Level] = Field(default_factory=dict, description="Keyed by segment name.")
    quotes: List[QuoteInput] = Field(default_factory=list)


class HypothesisVerdictInput(BaseModel):
    id: str = Field(..., pattern=r"^H\d+$")
    verdict: Verdict
    verdict_reason: str = Field(..., min_length=1)
    quotes: List[QuoteInput] = Field(default_factory=list)
    source_refs: List[str] = Field(default_factory=list)


class SaveStudySynthesisParams(BaseToolParams):
    study_dir: str = Field(..., description="studies/<slug>")
    segments: List[SegmentInput] = Field(..., min_length=1)
    themes: List[ThemeInput] = Field(..., min_length=1)
    dimensions: List[DimensionInput] = Field(default_factory=list)
    hypotheses: List[HypothesisVerdictInput] = Field(default_factory=list)


@dataclass
class _Outcome:
    """一次保存的结果汇总，供 content 和卡片使用。"""

    quotes_total: int = 0
    dropped_quotes: List[str] = field(default_factory=list)
    dropped_sources: List[str] = field(default_factory=list)
    dropped_stances: List[str] = field(default_factory=list)
    adjustments: List[str] = field(default_factory=list)
    downweighted: List[str] = field(default_factory=list)
    saturation: List[int] = field(default_factory=list)
    saturated: bool = False


# 模型使用说明：agents/skills/persona-research/reference/tools.md
@tool(name="save_study_synthesis", code_mode_only=True)
class SaveStudySynthesis(WorkspaceTool[SaveStudySynthesisParams]):
    """Save the study synthesis and hypothesis verdicts with verified quotes."""

    async def execute(self, tool_context: ToolContext, params: SaveStudySynthesisParams) -> ToolResult:
        try:
            study_path = await resolve_study_dir(self.base_dir, params.study_dir)
            study = await load_study(study_path)
            if StudyPhase(study.phase) not in (StudyPhase.REPORT, StudyPhase.VALIDATION, StudyPhase.DONE):
                raise StudyFilesError(f"synthesis is written in the report phase; the study is in {study.phase}")
            outcome = _Outcome()
            synthesis = await _build(study_path, study, params, outcome)
            await write_json_file(study_path / "synthesis.json", synthesis)
            await save_study(study_path, study)
        except StudyFilesError as exc:
            return ToolResult.error(f"Synthesis not saved: {exc}")

        located = outcome.quotes_total - len(outcome.dropped_quotes)
        lines = [
            f"Saved {params.study_dir}/synthesis.json with {len(synthesis['themes'])} themes and "
            f"{len(synthesis['dimensions'])} dimensions, and wrote {len(params.hypotheses)} hypothesis verdicts to study.json.",
            f"Quotes located: {located}/{outcome.quotes_total}.",
        ]
        if outcome.dropped_quotes:
            lines.append("Not saved because they are not that persona's exact words:")
            lines.extend(f"- {text}" for text in outcome.dropped_quotes)
        if outcome.dropped_sources:
            lines.append(f"Ignored source refs not found in desk-research.md: {', '.join(outcome.dropped_sources)}.")
        if outcome.dropped_stances:
            lines.append(f"Ignored stances for personas without a completed transcript: {', '.join(outcome.dropped_stances)}.")
        if outcome.adjustments:
            lines.append("Adjusted by the rules in methods.md:")
            lines.extend(f"- {item}" for item in outcome.adjustments)
        if outcome.downweighted:
            lines.append(f"Downweighted interviews (inferred_ratio >= 0.4): {', '.join(outcome.downweighted)}.")
        lines.append(
            f"Saturation: {outcome.saturation}, {'saturated' if outcome.saturated else 'not saturated; recommend a larger sample in the report'}."
        )
        if outcome.dropped_quotes:
            lines.append("Mention the removed quote count in the report limitations.")
        return ToolResult(
            content="\n".join(lines),
            data={
                "study_dir": params.study_dir,
                "themes": len(synthesis["themes"]),
                "quotes_total": outcome.quotes_total,
                "quotes_located": located,
                "adjustments": outcome.adjustments,
                "saturation": outcome.saturation,
                "saturated": outcome.saturated,
            },
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        # 例：「12 个主题，引文核对 31/32」
        if result.ok:
            remark = _translate(
                "save_study_synthesis.success",
                themes=result.data.get("themes", 0),
                located=result.data.get("quotes_located", 0),
                total=result.data.get("quotes_total", 0),
            )
        else:
            remark = _translate("save_study_synthesis.error")
        return {"tool_name": tool_name, "action": i18n.translate("save_study_synthesis", category="tool.actions"), "remark": remark}

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            return None
        data = result.data
        saturation = data.get("saturation") or []
        lines = [
            f"# {_translate('save_study_synthesis.detail_title')}",
            "",
            _translate(
                "save_study_synthesis.detail_summary",
                themes=data.get("themes", 0),
                located=data.get("quotes_located", 0),
                total=data.get("quotes_total", 0),
            ),
            "",
            _translate(
                "save_study_synthesis.detail_saturated" if data.get("saturated") else "save_study_synthesis.detail_not_saturated",
                series=" → ".join(str(n) for n in saturation),
            ),
        ]
        adjustments = data.get("adjustments") or []
        if adjustments:
            lines.extend(["", f"**{_translate('save_study_synthesis.detail_adjusted')}**", ""])
            lines.extend(f"- {item}" for item in adjustments)
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="synthesis_summary.md", content="\n".join(lines) + "\n"),
        )


async def _build(study_path: Path, study: Study, params: SaveStudySynthesisParams, outcome: _Outcome) -> Dict[str, Any]:
    transcripts = [t for t in await load_transcripts(study_path) if t.status == TranscriptStatus.DONE]
    interviews = {t.persona_id: t for t in transcripts if not t.is_discussion}
    if not interviews and not any(t.is_discussion for t in transcripts):
        raise StudyFilesError("no completed transcript was found; synthesis needs at least one interview with status done")
    interviewed = set(interviews) | {
        pid for t in transcripts if t.is_discussion for pid in (t.data.get("participants") or [])
    }
    downweighted = {pid for pid, t in interviews.items() if _inferred_ratio(t) >= DOWNWEIGHT_INFERRED_RATIO}
    outcome.downweighted = sorted(downweighted)
    source_ids = await read_source_ids(study_path)

    def quotes(items: List[QuoteInput]) -> List[tuple[str, QuoteLocation]]:
        found = []
        for item in items:
            outcome.quotes_total += 1
            location = locate_quote(transcripts, item.persona_id, item.text)
            if location is None:
                outcome.dropped_quotes.append(f"{item.persona_id}: {item.text[:60]}")
            else:
                found.append((item.persona_id, location))
        return found

    def sources(refs: List[str]) -> List[str]:
        kept = [ref.strip() for ref in refs if ref.strip() in source_ids]
        outcome.dropped_sources.extend(ref for ref in refs if ref.strip() not in source_ids)
        return kept

    segments = _segments(study, params.segments)
    segment_ids = {segment["name"]: segment["id"] for segment in segments}
    validated = {h.id for h in study.hypotheses if h.validation and h.validation.verdict == Agreement.AGREE}

    themes = []
    for index, theme in enumerate(params.themes, start=1):
        theme_id = f"T{index}"
        stance = {pid: Stance.NOT_MENTIONED.value for pid in sorted(interviewed)}
        for pid, value in theme.stance_by_persona.items():
            if pid in interviewed:
                stance[pid] = value.value
            else:
                outcome.dropped_stances.append(pid)
        located = quotes(theme.quotes)
        refs = sources(theme.source_refs)
        confidence, reason = _cap_confidence(
            theme, theme_id, refs, located, downweighted, bool(validated & set(theme.hypothesis_ids)), outcome
        )
        themes.append({
            "id": theme_id,
            "name": theme.name.strip(),
            "description": theme.description.strip(),
            "stance_by_persona": stance,
            "quote_refs": [_quote_ref(pid, location) for pid, location in located],
            "source_refs": refs,
            "hypothesis_ids": theme.hypothesis_ids,
            "confidence": confidence,
            "confidence_reason": reason,
        })

    dimensions = []
    for index, dimension in enumerate(params.dimensions, start=1):
        unknown = [name for name in dimension.level_by_segment if name not in segment_ids]
        if unknown:
            raise StudyFilesError(f"dimension {dimension.name!r} uses unknown segments: {', '.join(unknown)}")
        dimensions.append({
            "id": f"D{index}",
            "name": dimension.name.strip(),
            "level_by_segment": {segment_ids[name]: level.value for name, level in dimension.level_by_segment.items()},
            "quote_refs": [_quote_ref(pid, location) for pid, location in quotes(dimension.quotes)],
        })

    _apply_verdicts(study, params.hypotheses, quotes, sources, outcome)
    outcome.saturation, outcome.saturated = await _saturation(study_path, interviews, params.themes)
    return {
        "schema_version": SCHEMA_VERSION,
        "segments": segments,
        "themes": themes,
        "dimensions": dimensions,
        "saturation": {"new_themes_per_interview": outcome.saturation, "saturated": outcome.saturated},
    }


def _segments(study: Study, items: List[SegmentInput]) -> List[Dict[str, Any]]:
    quota_names = [item.segment for item in study.quota]
    unknown = [item.name for item in items if quota_names and item.name not in quota_names]
    if unknown:
        raise StudyFilesError(
            f"segments must use the quota segment names in study.json ({', '.join(quota_names)}); unknown: {', '.join(unknown)}"
        )
    return [
        {"id": f"seg_{index}", "name": item.name, "persona_ids": item.persona_ids}
        for index, item in enumerate(items, start=1)
    ]


def _cap_confidence(
    theme: ThemeInput,
    theme_id: str,
    refs: List[str],
    located: List[tuple[str, QuoteLocation]],
    downweighted: set[str],
    validated: bool,
    outcome: _Outcome,
) -> tuple[str, str]:
    """按 methods.md 的可信度规则给出上限；只下调，不上调。"""
    requested = theme.confidence
    allowed = requested
    rule_zh, rule_en = "", ""
    if requested in (Confidence.HIGH, Confidence.MEDIUM):
        if located and all(location.source == "interview" and pid in downweighted for pid, location in located):
            allowed, rule_zh, rule_en = Confidence.LOW, "主要依据是降权访谈", "the support rests on downweighted interviews"
        else:
            if not refs and not validated:
                allowed, rule_zh, rule_en = Confidence.TO_VALIDATE, "只有 AI 访谈支持，没有外部来源", "supported by AI interviews only"
            elif requested == Confidence.HIGH and len(refs) < 2 and not validated:
                allowed, rule_zh, rule_en = Confidence.MEDIUM, "只有 1 个外部来源", "only one external source agrees"
    reason = theme.confidence_reason.strip()
    if allowed != requested:
        outcome.adjustments.append(f"{theme_id} confidence {requested.value} -> {allowed.value}: {rule_en}")
        note = f"（按规则调整：{rule_zh}）" if _CJK.search(theme.name + reason) else f"(Adjusted by rule: {rule_en}.)"
        reason = f"{reason} {note}".strip()
    return allowed.value, reason


def _apply_verdicts(study: Study, items: List[HypothesisVerdictInput], quotes, sources, outcome: _Outcome) -> None:
    by_id = {hypothesis.id: hypothesis for hypothesis in study.hypotheses}
    unknown = [item.id for item in items if item.id not in by_id]
    if unknown:
        raise StudyFilesError(f"unknown hypothesis ids: {', '.join(unknown)} (study.json has {', '.join(by_id) or 'none'})")
    for item in items:
        hypothesis = by_id[item.id]
        located = quotes(item.quotes)
        refs = sources(item.source_refs)
        verdict, reason = item.verdict, item.verdict_reason.strip()
        # AI-only 上限：没有外部来源时，supported / refuted 最多是 mixed，原因以「待真人验证」开头。
        if verdict in (Verdict.SUPPORTED, Verdict.REFUTED) and not refs:
            outcome.adjustments.append(f"{item.id} verdict {verdict.value} -> mixed: supported by AI interviews only")
            verdict = Verdict.MIXED
            prefix = "待真人验证：" if _CJK.search(reason) else "Pending real-person validation: "
            if not reason.startswith(prefix.strip(": ：")):
                reason = prefix + reason
        hypothesis.verdict = verdict
        hypothesis.verdict_reason = reason
        hypothesis.evidence_refs = [_evidence_ref(pid, location) for pid, location in located] + [
            {"kind": "source", "ref": ref} for ref in refs
        ]


async def _saturation(study_path: Path, interviews: Dict[str, Transcript], themes: List[ThemeInput]) -> tuple[List[int], bool]:
    """按 panel.json 顺序，数每份完成的一对一访谈里首次出现的主题数；最后两项都是 0 才算饱和。

    例：3 份访谈，T1 第一次出现在第 1 份、T2 在第 1 份、T3 在第 2 份 → [2, 1, 0]，未饱和。
    """
    panel = await read_json_file(study_path / "panel.json") or {}
    order = [pid for pid in panel.get("persona_ids") or [] if pid in interviews]
    order += sorted(pid for pid in interviews if pid not in order)
    counts = [0] * len(order)
    for theme in themes:
        for position, pid in enumerate(order):
            if theme.stance_by_persona.get(pid, Stance.NOT_MENTIONED) != Stance.NOT_MENTIONED:
                counts[position] += 1
                break
    return counts, len(counts) >= 2 and counts[-1] == 0 and counts[-2] == 0


def _inferred_ratio(transcript: Transcript) -> float:
    ratio = transcript.inferred_ratio
    return ratio if ratio is not None else compute_inferred_ratio(transcript.persona_texts())


def _quote_ref(persona_id: str, location: QuoteLocation) -> Dict[str, Any]:
    return {
        "persona_id": persona_id,
        "source": location.source,
        "file": location.file,
        "round_index": location.round_index,
        "text": location.text,
    }


def _evidence_ref(persona_id: str, location: QuoteLocation) -> Dict[str, Any]:
    ref: Dict[str, Any] = {"kind": "quote", "persona_id": persona_id, "round_index": location.round_index, "text": location.text}
    if location.source == "discussion":
        ref["file"] = location.file
    return ref


def _translate(key: str, **kwargs: Any) -> str:
    return i18n.translate(key, category="tool.messages", **kwargs)
