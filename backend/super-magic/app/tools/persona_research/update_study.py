"""update_study：创建研究并按事件推进 study.json 的阶段。

模型使用说明：agents/skills/persona-research/reference/tools.md（code_mode_only，完整用法只维护在 Skill）。

模型手写 study.json 时出过：schema_version 写成 "1.0"、phases 写成对象、漏写 topic_id、
阶段状态和实际进度不同步。现在模型只报告「发生了什么」，工具决定各阶段状态：

| event                 | 允许的当前阶段          | 结果                                                  |
| created               | （新建）                | phase=clarify；clarify=running，其余 pending          |
| clarified             | clarify                 | phase=plan；clarify=done，plan=running                |
| plan_confirmed        | clarify、plan           | phase=desk_research；写入方案字段，假设全部 pending   |
| desk_research_done    | desk_research           | phase=interview                                       |
| desk_research_skipped | desk_research           | phase=interview；desk_research=skipped                |
| interviews_finished   | interview、report       | phase=report；没有一份访谈完成时 interview=failed     |
| report_written        | report、validation、done | 首次进入 validation；之后重写报告不改变阶段           |
| questionnaire_written | validation、done        | phase=done                                            |
| validation_compared   | done                    | 写入真人验证结果和 validated_count                    |
"""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.persona_research.contracts import (
    DEFAULT_INTERVIEW_ROUNDS,
    MAX_INTERVIEW_ROUNDS,
    MAX_PERSONAS,
    PHASE_ORDER,
    SCHEMA_VERSION,
    STUDIES_DIR,
    Agreement,
    GuideIssue,
    Hypothesis,
    HypothesisValidation,
    PhaseStatus,
    QuotaItem,
    Study,
    StudyLimits,
    StudyPhase,
    StudyType,
    TranscriptStatus,
    initial_phases,
)
from app.tools.persona_research.study_files import (
    StudyFilesError,
    ascii_slug,
    load_study,
    load_transcripts,
    random_hex,
    resolve_in_workspace,
    resolve_study_dir,
    save_study,
    workspace_relative,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists, async_mkdir, async_realpath


class StudyEvent(StrEnum):
    CREATED = "created"
    CLARIFIED = "clarified"
    PLAN_CONFIRMED = "plan_confirmed"
    DESK_RESEARCH_DONE = "desk_research_done"
    DESK_RESEARCH_SKIPPED = "desk_research_skipped"
    INTERVIEWS_FINISHED = "interviews_finished"
    REPORT_WRITTEN = "report_written"
    QUESTIONNAIRE_WRITTEN = "questionnaire_written"
    VALIDATION_COMPARED = "validation_compared"


_ALLOWED_FROM: Dict[StudyEvent, set[StudyPhase]] = {
    StudyEvent.CLARIFIED: {StudyPhase.CLARIFY},
    StudyEvent.PLAN_CONFIRMED: {StudyPhase.CLARIFY, StudyPhase.PLAN},
    StudyEvent.DESK_RESEARCH_DONE: {StudyPhase.DESK_RESEARCH},
    StudyEvent.DESK_RESEARCH_SKIPPED: {StudyPhase.DESK_RESEARCH},
    StudyEvent.INTERVIEWS_FINISHED: {StudyPhase.INTERVIEW, StudyPhase.REPORT},
    StudyEvent.REPORT_WRITTEN: {StudyPhase.REPORT, StudyPhase.VALIDATION, StudyPhase.DONE},
    StudyEvent.QUESTIONNAIRE_WRITTEN: {StudyPhase.VALIDATION, StudyPhase.DONE},
    StudyEvent.VALIDATION_COMPARED: {StudyPhase.DONE},
}


class HypothesisDraft(BaseModel):
    statement: str = Field(..., min_length=1)
    support_criteria: str = Field(..., min_length=1)
    refute_criteria: str = Field(..., min_length=1)


class GuideReviewItem(BaseModel):
    issue: GuideIssue
    before: str = Field(..., min_length=1)
    after: str = Field(..., min_length=1)


class HypothesisValidationInput(BaseModel):
    hypothesis_id: str = Field(..., pattern=r"^H\d+$")
    verdict: Agreement
    summary: str = ""


class UpdateStudyParams(BaseToolParams):
    event: StudyEvent = Field(..., description="What just happened in the study.")
    study_dir: str = Field(default="", description="studies/<slug>; required for every event except created.")
    title: str = Field(default="", description="created: short study title.")
    question: str = Field(default="", description="created: the user's original question, verbatim.")
    slug_hint: str = Field(default="", description="created: short ASCII kebab-case summary of the topic.")
    study_type: Optional[StudyType] = Field(default=None, description="plan_confirmed: study type.")
    framework: List[str] = Field(default_factory=list, description="plan_confirmed: framework names.")
    decision: str = Field(default="", description="plan_confirmed: the decision the study informs.")
    hypotheses: List[HypothesisDraft] = Field(default_factory=list, description="plan_confirmed: in plan order.")
    quota: List[QuotaItem] = Field(default_factory=list, description="plan_confirmed: sample quota.")
    interview_rounds: int = Field(default=DEFAULT_INTERVIEW_ROUNDS, description="plan_confirmed: rounds per persona.")
    guide_review: List[GuideReviewItem] = Field(default_factory=list, description="plan_confirmed: rewritten questions.")
    validated_count: int = Field(default=0, description="validation_compared: real respondents compared.")
    validations: List[HypothesisValidationInput] = Field(
        default_factory=list, description="validation_compared: real-person result per hypothesis."
    )


# 模型使用说明：agents/skills/persona-research/reference/tools.md
@tool(name="update_study", code_mode_only=True)
class UpdateStudy(WorkspaceTool[UpdateStudyParams]):
    """Create a persona research study and move study.json through its phases."""

    async def execute(self, tool_context: ToolContext, params: UpdateStudyParams) -> ToolResult:
        try:
            if params.event == StudyEvent.CREATED:
                study_path, study = await self._create(tool_context, params)
            else:
                study_path = await resolve_study_dir(self.base_dir, params.study_dir)
                study = await load_study(study_path)
                allowed = _ALLOWED_FROM[params.event]
                if StudyPhase(study.phase) not in allowed:
                    raise StudyFilesError(
                        f"event {params.event.value} is not allowed while phase is {study.phase} "
                        f"(allowed in: {', '.join(sorted(allowed))}). Nothing was changed."
                    )
                await self._apply(study_path, study, params)
            await save_study(study_path, study)
        except StudyFilesError as exc:
            return ToolResult.error(f"study.json not updated: {exc}")

        study_dir = workspace_relative(await async_realpath(self.base_dir), study_path)
        statuses = ", ".join(f"{item.key}={item.status}" for item in study.phases)
        return ToolResult(
            content=f"Updated {study_dir}/study.json after {params.event.value}: phase is {study.phase} ({statuses}).",
            data={"study_dir": study_dir, "event": params.event.value, "phase": study.phase, "phases": [
                {"key": item.key, "status": item.status} for item in study.phases
            ]},
        )

    async def _create(self, tool_context: ToolContext, params: UpdateStudyParams) -> tuple[Path, Study]:
        if not params.title.strip() or not params.question.strip():
            raise StudyFilesError("created needs title and question")
        topic_id = _current_topic_id(tool_context)
        if not topic_id:
            raise StudyFilesError("the current topic ID is unavailable, so the study cannot be linked to this topic")
        base = await async_realpath(self.base_dir)
        slug_base = ascii_slug(params.slug_hint) or "study"
        for _ in range(5):
            study_path = await resolve_in_workspace(base, f"{STUDIES_DIR}/{slug_base}-{random_hex()}")
            if not await async_exists(study_path):
                break
        else:
            raise StudyFilesError("could not find a free study directory name; use a different slug_hint")
        await async_mkdir(study_path, parents=True, exist_ok=True)
        study = Study(
            schema_version=SCHEMA_VERSION,
            topic_id=topic_id,
            title=params.title.strip(),
            question=params.question.strip(),
            phase=StudyPhase.CLARIFY,
            phases=initial_phases(),
        )
        return study_path, study

    async def _apply(self, study_path: Path, study: Study, params: UpdateStudyParams) -> None:
        event = params.event
        if event == StudyEvent.CLARIFIED:
            _advance(study, StudyPhase.PLAN)
        elif event == StudyEvent.PLAN_CONFIRMED:
            _confirm_plan(study, params)
            _advance(study, StudyPhase.DESK_RESEARCH)
        elif event == StudyEvent.DESK_RESEARCH_DONE:
            if not await async_exists(study_path / "desk-research.md"):
                raise StudyFilesError("desk-research.md has not been written yet")
            _advance(study, StudyPhase.INTERVIEW)
        elif event == StudyEvent.DESK_RESEARCH_SKIPPED:
            _advance(study, StudyPhase.INTERVIEW, current_status=PhaseStatus.SKIPPED)
        elif event == StudyEvent.INTERVIEWS_FINISHED:
            transcripts = await load_transcripts(study_path)
            if any(t.status == TranscriptStatus.RUNNING for t in transcripts):
                running = ", ".join(t.file for t in transcripts if t.status == TranscriptStatus.RUNNING)
                raise StudyFilesError(f"these transcripts are still running: {running}. Finish or fail them first")
            succeeded = any(t.status == TranscriptStatus.DONE for t in transcripts)
            study.phase = StudyPhase.REPORT
            study.set_phase_status(StudyPhase.INTERVIEW, PhaseStatus.DONE if succeeded else PhaseStatus.FAILED)
            study.set_phase_status(StudyPhase.REPORT, PhaseStatus.RUNNING)
        elif event == StudyEvent.REPORT_WRITTEN:
            for name in ("synthesis.json", "report.html"):
                if not await async_exists(study_path / name):
                    raise StudyFilesError(f"{name} has not been written yet")
            if study.phase == StudyPhase.REPORT:
                _advance(study, StudyPhase.VALIDATION)
        elif event == StudyEvent.QUESTIONNAIRE_WRITTEN:
            for name in ("validation-questionnaire.md", "validation-questionnaire.csv"):
                if not await async_exists(study_path / name):
                    raise StudyFilesError(f"{name} has not been written yet")
            study.phase = StudyPhase.DONE
            study.set_phase_status(StudyPhase.VALIDATION, PhaseStatus.DONE)
        elif event == StudyEvent.VALIDATION_COMPARED:
            _record_validation(study, params)


    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        # 例：「研究进度：进入桌面研究」
        if not result.ok:
            remark = _translate("update_study.error")
        elif result.data.get("event") == StudyEvent.CREATED:
            remark = _translate("update_study.created")
        elif result.data.get("phase") == StudyPhase.DONE:
            remark = _translate("update_study.done")
        else:
            remark = _translate("update_study.progress", phase=_phase_label(result.data.get("phase", "")))
        return {"tool_name": tool_name, "action": i18n.translate("update_study", category="tool.actions"), "remark": remark}

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            return None
        marks = {"done": "✓", "running": "…", "pending": "·", "skipped": "–", "failed": "✗"}
        lines = [f"# {_translate('update_study.detail_title')}", ""]
        lines.extend(
            f"- {marks.get(item['status'], '')} {_phase_label(item['key'])}" for item in result.data.get("phases", [])
        )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="study_progress.md", content="\n".join(lines) + "\n"),
        )

def _advance(study: Study, target: StudyPhase, current_status: PhaseStatus = PhaseStatus.DONE) -> None:
    """把 target 之前仍在进行或等待的阶段收尾，target 设为 running。"""
    index = PHASE_ORDER.index(target)
    for phase in PHASE_ORDER[:index]:
        if study.phase_status(phase) in (PhaseStatus.RUNNING, PhaseStatus.PENDING):
            study.set_phase_status(phase, PhaseStatus.DONE)
    if current_status != PhaseStatus.DONE:
        study.set_phase_status(PHASE_ORDER[index - 1], current_status)
    study.phase = target
    study.set_phase_status(target, PhaseStatus.RUNNING)


def _confirm_plan(study: Study, params: UpdateStudyParams) -> None:
    if not params.hypotheses or not params.quota or not params.decision.strip() or params.study_type is None:
        raise StudyFilesError("plan_confirmed needs study_type, decision, hypotheses, and quota")
    personas = sum(item.count for item in params.quota)
    if personas > MAX_PERSONAS:
        raise StudyFilesError(f"the quota adds up to {personas} personas; the limit is {MAX_PERSONAS}")
    if not 1 <= params.interview_rounds <= MAX_INTERVIEW_ROUNDS:
        raise StudyFilesError(f"interview_rounds must be between 1 and {MAX_INTERVIEW_ROUNDS}")
    study.study_type = params.study_type
    study.framework = [name.strip() for name in params.framework if name.strip()]
    study.decision = params.decision.strip()
    study.limits = StudyLimits(personas=personas, interview_rounds=params.interview_rounds)
    study.outputs = {"plan": "plan.md", "report": "report.html", "validation": "validation-questionnaire.md"}
    study.quota = params.quota
    study.hypotheses = [
        Hypothesis(id=f"H{index}", **draft.model_dump()) for index, draft in enumerate(params.hypotheses, start=1)
    ]
    study.guide_review = {"items": [item.model_dump(mode="json") for item in params.guide_review]}


def _record_validation(study: Study, params: UpdateStudyParams) -> None:
    if params.validated_count < 1 or not params.validations:
        raise StudyFilesError("validation_compared needs validated_count of at least 1 and validations")
    by_id = {hypothesis.id: hypothesis for hypothesis in study.hypotheses}
    unknown = [item.hypothesis_id for item in params.validations if item.hypothesis_id not in by_id]
    if unknown:
        raise StudyFilesError(f"unknown hypothesis ids: {', '.join(unknown)}")
    for item in params.validations:
        by_id[item.hypothesis_id].validation = HypothesisValidation(verdict=item.verdict, summary=item.summary.strip())
    study.validated_count = params.validated_count
    study.set_phase_status(StudyPhase.VALIDATION, PhaseStatus.DONE)


def _current_topic_id(tool_context: ToolContext) -> str:
    """研究页按 Super Magic 话题 ID 查找研究，取产品上下文里的 topic.id。"""
    agent = tool_context.get_extension("agent_context") if tool_context else None
    product = agent.get_super_magic_product_context() if agent else None
    topic = getattr(product, "topic", None)
    return str(getattr(topic, "id", "") or "")


def _phase_label(phase: str) -> str:
    return _translate(f"update_study.phase.{phase}")


def _translate(key: str, **kwargs: Any) -> str:
    return i18n.translate(key, category="tool.messages", **kwargs)
