"""save_personas：写入本次研究的人设和 studies/<slug>/panel.json。

模型使用说明：agents/skills/persona-research/reference/tools.md（code_mode_only，完整用法只维护在 Skill）。

| 由模型给出                                  | 由工具完成                                          |
| 人设内容（7 个维度、4 个层次、证据、出处）   | 生成 persona ID、补 schema_version/created_in/updated_at |
| 是否复用已有人设、入选理由、所属分层         | 校验结构完整、出处引用的证据存在、分层在配额里       |
| 是否来自用户上传的真人资料                  | 按规则计算 tier（不再由模型自己判断）                |

tier 规则（SKILL.md）：来自上传的真人资料 → imported；否则至少 3 条 web/social/upload 证据，
且 needs_pains 和 behavior 两项都引用了其中的证据 → evidence_based；其余 → generated。
例：3 条网页证据，但 behavior 写的是 "inferred" → generated。

盲写检查（methods.md「Personas Describe Situations, Not Verdicts」）：人设只写处境和行为，
不写被测结论。工具用 study.json 假设里的 outcome_terms 检查「立场性」字段：
| 检查的字段                                   | 不检查                     |
| tagline、tags、expression、needs_pains、     | demographics、geography、  |
| tech_adoption、decision_weights 的 factor    | behavior、story 等事实字段 |
例：假设 H2 的 outcome_terms 含「用不完」，人设 tagline 写「认定月卡是赌你用不完」→ 拒绝保存。
复用人设命中同样拒绝（它已经替本研究说出了结论，不应入选）。旧研究没有 outcome_terms，不做检查。

社媒锚定：study.social_sampling 为 sampled 时，每位新人设至少引用 1 条 social 证据，
让人设的处境来自真实用户原话，而不是研究者的想象。

复用的人设只追加证据、补齐缺少的出处、追加 consistency_notes，不改身份和内容字段。
imported 和 manual（用户手动填写）人设复用时保持原 tier。

| 研究类型       | 允许的阶段     | 分层校验 | 保存后                                           |
| 普通研究       | interview      | 按配额   | 阶段不变，等待访谈                               |
| persona_build  | clarify、done  | 不校验   | phase=done；clarify=done，其余阶段 skipped        |
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import (
    DisplayType,
    StudyPersonaItemContent,
    StudyPersonasContent,
    ToolDetail,
)
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.persona_research.contracts import (
    EXTERNAL_EVIDENCE_TYPES,
    MAX_PERSONAS,
    PANELS_DIR,
    PERSONA_DIMENSIONS,
    PERSONA_LAYERS,
    PERSONAS_DIR,
    SCHEMA_VERSION,
    EvidenceType,
    Level,
    PersonaTier,
    PhaseStatus,
    SocialSampling,
    StudyPhase,
    StudyType,
)
from app.tools.persona_research.study_files import (
    StudyFilesError,
    ascii_slug,
    load_study,
    now_iso,
    portrait_hint,
    random_hex,
    read_json_file,
    resolve_study_dir,
    save_study,
    workspace_relative,
    write_json_file,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists, async_realpath


class EvidenceInput(BaseModel):
    id: str = Field(..., min_length=1, description="Evidence id within this persona, for example e1.")
    type: EvidenceType
    platform: str = ""
    title: str = ""
    url: str = ""
    file: str = ""
    quote: str = ""


class PersonaInput(BaseModel):
    id: str = Field(default="", description="Existing persona id to reuse; empty for a new persona.")
    id_hint: str = Field(default="", description="New persona: short ASCII slug for the id, for example zhangwei.")
    segment: str = Field(..., min_length=1, description="The study.json quota segment this persona fills.")
    reason: str = Field(..., min_length=1, description="Why this persona was selected.")
    from_uploaded_people: bool = False
    name: str = ""
    tagline: str = ""
    tags: List[str] = Field(default_factory=list)
    dimensions: Dict[str, Any] = Field(default_factory=dict)
    layers: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceInput] = Field(default_factory=list)
    field_sources: Dict[str, Union[List[str], Literal["inferred"]]] = Field(default_factory=dict)
    consistency_notes: List[str] = Field(default_factory=list)


class SavePersonasParams(BaseToolParams):
    study_dir: str = Field(..., description="studies/<slug>")
    personas: List[PersonaInput] = Field(..., min_length=1, description="In interview order.")
    panel_name: str = Field(..., min_length=1)
    criteria: str = ""
    library_panel_name: str = Field(default="", description="Also save the group to panels/ under this name.")


# 模型使用说明：agents/skills/persona-research/reference/tools.md
@tool(name="save_personas", code_mode_only=True)
class SavePersonas(WorkspaceTool[SavePersonasParams]):
    """Save the personas of a study and its panel.json, assigning ids and tiers by rule."""

    async def execute(self, tool_context: ToolContext, params: SavePersonasParams) -> ToolResult:
        try:
            base = await async_realpath(self.base_dir)
            study_path = await resolve_study_dir(base, params.study_dir)
            study = await load_study(study_path)
            building = study.study_type == StudyType.PERSONA_BUILD
            if building:
                if study.phase not in (StudyPhase.CLARIFY, StudyPhase.DONE):
                    raise StudyFilesError(f"a persona_build study cannot save personas in phase {study.phase}")
            elif study.phase != StudyPhase.INTERVIEW:
                raise StudyFilesError(
                    f"personas are saved in the interview phase; the study is in {study.phase}. "
                    "Send update_study desk_research_done or desk_research_skipped first"
                )
            limit = study.limits.personas if study.limits else MAX_PERSONAS
            if len(params.personas) > limit:
                raise StudyFilesError(f"{len(params.personas)} personas exceed this study's limit of {limit}")
            # persona_build 没有配额，segment 只是展示用的人群标签。
            quota = set() if building else {item.segment for item in study.quota}
            unknown = sorted({p.segment for p in params.personas if quota and p.segment not in quota})
            if unknown:
                raise StudyFilesError(f"segments must be quota segments ({', '.join(sorted(quota))}); unknown: {', '.join(unknown)}")

            outcome_terms = [] if building else [
                (h.id, term) for h in study.hypotheses for term in h.outcome_terms
            ]
            needs_social = (
                not building
                and study.social_sampling is not None
                and study.social_sampling.status == SocialSampling.SAMPLED
            )
            created_in = workspace_relative(base, study_path)
            files: List[tuple[str, Dict[str, Any]]] = []
            summary: List[Dict[str, Any]] = []
            for item in params.personas:
                persona, reused = await self._prepare(base, item, created_in)
                _check_no_outcome(persona, outcome_terms, reused)
                if needs_social and not reused and not any(
                    e.get("type") == EvidenceType.SOCIAL for e in persona["evidence"]
                ):
                    raise StudyFilesError(
                        f"{persona['name']} cites no social evidence; this study sampled social platforms, "
                        "so anchor each new persona's situation in at least one real voice from desk-research.md"
                    )
                files.append((persona["id"], persona))
                summary.append({
                    "persona_id": persona["id"],
                    "name": persona["name"],
                    "tagline": persona.get("tagline", ""),
                    "tier": persona["tier"],
                    "segment": item.segment,
                    "reused": reused,
                    **portrait_hint(persona),
                })
            ids = [pid for pid, _ in files]
            if len(set(ids)) != len(ids):
                raise StudyFilesError("the same persona appears more than once")

            for pid, persona in files:
                await write_json_file(base / PERSONAS_DIR / f"{pid}.json", persona)
            panel = {
                "schema_version": SCHEMA_VERSION,
                "id": f"panel_{study_path.name}",
                "name": params.panel_name.strip(),
                "persona_ids": ids,
                "criteria": params.criteria.strip(),
                "selection": [
                    {"persona_id": row["persona_id"], "reason": item.reason.strip(), "reused": row["reused"], "segment": item.segment}
                    for row, item in zip(summary, params.personas)
                ],
            }
            await write_json_file(study_path / "panel.json", panel)
            library_note = ""
            if params.library_panel_name.strip():
                panel_id = f"panel_{ascii_slug(params.library_panel_name) or 'group'}_{random_hex()}"
                await write_json_file(base / PANELS_DIR / f"{panel_id}.json", {
                    "schema_version": SCHEMA_VERSION,
                    "id": panel_id,
                    "name": params.library_panel_name.strip(),
                    "persona_ids": ids,
                    "criteria": params.criteria.strip(),
                })
                library_note = f" Also saved the group as {PANELS_DIR}/{panel_id}.json."
            if building:
                _finish_persona_build(study)
                await save_study(study_path, study)
        except StudyFilesError as exc:
            return ToolResult.error(f"Personas not saved: {exc}")

        lines = [f"Saved {len(ids)} personas and {params.study_dir}/panel.json (interview order as listed).{library_note}"]
        lines.extend(
            f"- {row['persona_id']} {row['name']}: tier {row['tier']}, {'reused' if row['reused'] else 'new'}, segment {row['segment']}"
            for row in summary
        )
        lines.append("Use these persona file paths (personas/<persona_id>.json) in the interviewer briefs.")
        return ToolResult(
            content="\n".join(lines),
            data={"study_dir": params.study_dir, "panel_name": params.panel_name.strip(), "personas": summary},
        )

    async def _prepare(self, base, item: PersonaInput, created_in: str) -> tuple[Dict[str, Any], bool]:
        if item.id:
            path = base / PERSONAS_DIR / f"{item.id}.json"
            existing = await read_json_file(path)
            if existing is None:
                raise StudyFilesError(f"persona {item.id} does not exist; leave id empty to create a new persona")
            return _merge_reused(existing, item), True
        return await self._new_persona(base, item, created_in), False

    async def _new_persona(self, base, item: PersonaInput, created_in: str) -> Dict[str, Any]:
        label = item.name or item.id_hint or "persona"
        if not item.name.strip():
            raise StudyFilesError(f"a new persona needs a name ({label})")
        missing_dims = [key for key in PERSONA_DIMENSIONS if _empty(item.dimensions.get(key))]
        missing_layers = [key for key in PERSONA_LAYERS if _empty(item.layers.get(key))]
        missing_sources = [key for key in PERSONA_DIMENSIONS if key not in item.field_sources]
        if missing_dims or missing_layers or missing_sources:
            raise StudyFilesError(
                f"{label} is incomplete: missing dimensions {missing_dims or 'none'}, layers {missing_layers or 'none'}, "
                f"field_sources {missing_sources or 'none'}"
            )
        _check_decision_weights(label, item.layers)
        _check_evidence(label, item.evidence, item.field_sources)

        slug = ascii_slug(item.id_hint or item.name, max_length=20) or "persona"
        for _ in range(5):
            persona_id = f"p_{slug}_{random_hex()}"
            if not await async_exists(base / PERSONAS_DIR / f"{persona_id}.json"):
                break
        else:
            raise StudyFilesError(f"could not find a free id for {label}; use a different id_hint")
        evidence = [e.model_dump(mode="json") for e in item.evidence]
        persona = {
            "schema_version": SCHEMA_VERSION,
            "id": persona_id,
            "name": item.name.strip(),
            "tagline": item.tagline.strip(),
            "tags": item.tags,
            "tier": _tier(item.from_uploaded_people, evidence, item.field_sources).value,
            "dimensions": {key: item.dimensions[key] for key in PERSONA_DIMENSIONS},
            "layers": {key: item.layers[key] for key in PERSONA_LAYERS},
            "evidence": evidence,
            "field_sources": item.field_sources,
            "consistency_notes": item.consistency_notes,
            "created_in": created_in,
            "updated_at": now_iso(),
        }
        return persona

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        # 例：「8 位人设：新建 5 位，复用 3 位」
        if result.ok:
            rows = result.data.get("personas") or []
            reused = sum(1 for row in rows if row.get("reused"))
            remark = _translate("save_personas.success", count=len(rows), new=len(rows) - reused, reused=reused)
        else:
            remark = _translate("save_personas.error")
        return {"tool_name": tool_name, "action": i18n.translate("save_personas", category="tool.actions"), "remark": remark}

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            return None
        rows = result.data.get("personas") or []
        reused = sum(1 for row in rows if row["reused"])
        return ToolDetail(
            type=DisplayType.STUDY_PERSONAS,
            data=StudyPersonasContent(
                panel_name=result.data.get("panel_name", ""),
                new_count=len(rows) - reused,
                reused_count=reused,
                personas=[
                    StudyPersonaItemContent(
                        persona_id=row["persona_id"],
                        name=row["name"],
                        tagline=row.get("tagline", ""),
                        segment=row["segment"],
                        reused=row["reused"],
                        gender=row.get("gender", ""),
                        age=row.get("age", ""),
                    )
                    for row in rows
                ],
            ),
        )


def _merge_reused(existing: Dict[str, Any], item: PersonaInput) -> Dict[str, Any]:
    """复用：只追加证据、补齐缺少的出处、追加矛盾记录，tier 按合并后的证据重算。"""
    persona = dict(existing)
    label = str(persona.get("name") or item.id)
    evidence = list(persona.get("evidence") or [])
    known = {str(e.get("id")) for e in evidence if isinstance(e, dict)}
    clashes = [e.id for e in item.evidence if e.id in known]
    if clashes:
        raise StudyFilesError(f"{label} already has evidence ids {', '.join(clashes)}; use new ids for added evidence")
    evidence.extend(e.model_dump(mode="json") for e in item.evidence)
    field_sources = dict(persona.get("field_sources") or {})
    for key, value in item.field_sources.items():
        field_sources.setdefault(key, value)
    _check_evidence(label, item.evidence, field_sources, known_ids=known)
    persona["schema_version"] = SCHEMA_VERSION
    persona["evidence"] = evidence
    persona["field_sources"] = field_sources
    persona["consistency_notes"] = list(persona.get("consistency_notes") or []) + item.consistency_notes
    if persona.get("tier") not in (PersonaTier.IMPORTED, PersonaTier.MANUAL):
        persona["tier"] = _tier(False, evidence, field_sources).value
    persona["updated_at"] = now_iso()
    return persona


def _finish_persona_build(study) -> None:
    """只构建人设的研究在人设入库后结束；计划、访谈等阶段没有发生，记为 skipped。"""
    study.phase = StudyPhase.DONE
    for phase in study.phases:
        phase.status = PhaseStatus.DONE if phase.key == StudyPhase.CLARIFY else PhaseStatus.SKIPPED


def _tier(from_uploaded_people: bool, evidence: List[Dict[str, Any]], field_sources: Dict[str, Any]) -> PersonaTier:
    if from_uploaded_people:
        if not any(e.get("type") == EvidenceType.UPLOAD for e in evidence):
            raise StudyFilesError("a persona built from uploaded people needs at least one upload evidence item")
        return PersonaTier.IMPORTED
    external = {str(e.get("id")) for e in evidence if e.get("type") in EXTERNAL_EVIDENCE_TYPES}
    cited = all(
        isinstance(field_sources.get(key), list) and external & set(field_sources[key])
        for key in ("needs_pains", "behavior")
    )
    return PersonaTier.EVIDENCE_BASED if len(external) >= 3 and cited else PersonaTier.GENERATED


def _check_evidence(
    label: str, evidence: List[EvidenceInput], field_sources: Dict[str, Any], known_ids: Optional[set[str]] = None
) -> None:
    """检查新证据的 id 不重复、社交证据有平台、field_sources 只引用存在的证据（含复用人设已有的证据）。"""
    new_ids = [e.id for e in evidence]
    ids = set(new_ids) | (known_ids or set())
    if len(set(new_ids)) != len(new_ids):
        raise StudyFilesError(f"{label} has duplicate evidence ids")
    missing_platform = [e.id for e in evidence if e.type == EvidenceType.SOCIAL and not e.platform]
    if missing_platform:
        raise StudyFilesError(f"{label}: social evidence needs platform ({', '.join(missing_platform)})")
    for key, value in field_sources.items():
        if key not in PERSONA_DIMENSIONS:
            raise StudyFilesError(f"{label}: field_sources key {key!r} is not one of {', '.join(PERSONA_DIMENSIONS)}")
        if isinstance(value, list):
            unknown = [ref for ref in value if ref not in ids]
            if unknown:
                raise StudyFilesError(f"{label}: field_sources.{key} cites unknown evidence {', '.join(unknown)}")


def _stance_texts(persona: Dict[str, Any]) -> Dict[str, List[str]]:
    """立场性字段的文本：写进这些地方的被测结论，会被受访者当作自己的观点复述。"""
    dimensions = persona.get("dimensions") or {}
    layers = persona.get("layers") or {}
    cognition = layers.get("cognition") if isinstance(layers.get("cognition"), dict) else {}
    weights = cognition.get("decision_weights") or []
    raw = {
        "tagline": [persona.get("tagline")],
        "tags": persona.get("tags") or [],
        "expression": layers.get("expression") or [],
        "needs_pains": dimensions.get("needs_pains") or [],
        "tech_adoption": dimensions.get("tech_adoption") or [],
        "decision_weights": [w.get("factor") for w in weights if isinstance(w, dict)],
    }
    return {key: [str(v) for v in (value if isinstance(value, list) else [value]) if v] for key, value in raw.items()}


def _check_no_outcome(persona: Dict[str, Any], outcome_terms: List[tuple[str, str]], reused: bool) -> None:
    """人设立场性字段里出现被测结论的关键词时拒绝保存，并指出字段和假设。"""
    if not outcome_terms:
        return
    hits = []
    for field_name, texts in _stance_texts(persona).items():
        lowered = [text.lower() for text in texts]
        for hypothesis_id, term in outcome_terms:
            if any(term.lower() in text for text in lowered):
                hits.append(f"{field_name} contains {term!r} ({hypothesis_id})")
    if not hits:
        return
    label = persona.get("name") or persona.get("id")
    action = (
        "do not select this reused persona for this study"
        if reused
        else "rewrite those fields as past facts (what happened, when, at what cost) and drop the attitude, "
        "for example 'afraid the card goes unused' becomes 'last year's 10-session card: used 6, the rest expired'"
    )
    raise StudyFilesError(
        f"{label} already states the outcome being tested: {'; '.join(hits)}. "
        f"Personas describe situations, not verdicts; {action}"
    )


def _check_decision_weights(label: str, layers: Dict[str, Any]) -> None:
    cognition = layers.get("cognition")
    weights = cognition.get("decision_weights") if isinstance(cognition, dict) else None
    levels = {level.value for level in Level}
    if not isinstance(weights, list) or not weights or not all(
        isinstance(w, dict) and w.get("factor") and w.get("level") in levels for w in weights
    ):
        raise StudyFilesError(
            f'{label}: layers.cognition.decision_weights must be a list of {{"factor", "level": "high" | "medium" | "low"}}'
        )


def _empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _translate(key: str, **kwargs: Any) -> str:
    return i18n.translate(key, category="tool.messages", **kwargs)
