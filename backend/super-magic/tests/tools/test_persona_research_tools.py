"""persona-research 结构化文件工具：阶段推进、人设、访谈收尾、综合分析、问卷 CSV。"""

import json
from types import SimpleNamespace

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.persona_research.check_interviews import CheckInterviews, CheckInterviewsParams
from app.tools.persona_research.finish_persona_transcript import (
    FinishPersonaTranscript,
    FinishPersonaTranscriptParams,
)
from app.tools.persona_research.save_personas import SavePersonas, SavePersonasParams
from app.tools.persona_research.save_study_synthesis import SaveStudySynthesis, SaveStudySynthesisParams
from app.tools.persona_research.save_validation_questionnaire import (
    SaveValidationQuestionnaire,
    SaveValidationQuestionnaireParams,
)
from app.tools.persona_research.study_files import compute_inferred_ratio
from app.tools.persona_research.update_study import UpdateStudy, UpdateStudyParams

TOPIC_ID = "970302877729964033"


def _context(topic_id=TOPIC_ID):
    context = ToolContext()
    product = SimpleNamespace(topic=SimpleNamespace(id=topic_id))
    context.register_extension("agent_context", SimpleNamespace(get_super_magic_product_context=lambda: product))
    return context


def _read(root, rel):
    return json.loads((root / rel).read_text(encoding="utf-8"))


def _write(root, rel, data):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False) if not isinstance(data, str) else data, encoding="utf-8")


PLAN = {
    "study_type": "concept_test",
    "framework": ["JTBD"],
    "decision": "Whether to build X",
    "hypotheses": [
        {"statement": "H one", "support_criteria": "s1", "refute_criteria": "r1"},
        {"statement": "H two", "support_criteria": "s2", "refute_criteria": "r2"},
    ],
    "quota": [{"segment": "Owners", "criteria": "c", "count": 1}, {"segment": "Skeptics", "criteria": "c", "count": 1}],
    "interview_rounds": 3,
    "guide_review": [{"issue": "leading", "before": "Don't you hate it?", "after": "What happened last time?"}],
}


async def _study_at(tmp_path, phase_events):
    tool = UpdateStudy(base_dir=tmp_path)
    created = await tool.execute(
        _context(), UpdateStudyParams(event="created", title="T", question="Q?", slug_hint="Owner Pain")
    )
    study_dir = created.data["study_dir"]
    for event in phase_events:
        extra = PLAN if event == "plan_confirmed" else {}
        if event == "desk_research_done":
            _write(tmp_path, f"{study_dir}/desk-research.md", "Finding [S1] and [S2].")
        result = await tool.execute(_context(), UpdateStudyParams(event=event, study_dir=study_dir, **extra))
        assert result.ok, result.content
    return study_dir


# ── update_study ───────────────────────────────────────────────────────────


async def test_created_study_matches_contract_and_links_topic(tmp_path):
    study_dir = await _study_at(tmp_path, [])

    assert study_dir.startswith("studies/owner-pain-")
    study = _read(tmp_path, f"{study_dir}/study.json")
    assert study["schema_version"] == 1
    assert study["topic_id"] == TOPIC_ID
    assert study["phase"] == "clarify"
    assert [p["status"] for p in study["phases"]] == ["running", "pending", "pending", "pending", "pending", "pending"]


async def test_plan_confirmed_fills_plan_fields_and_numbers_hypotheses(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed"])

    study = _read(tmp_path, f"{study_dir}/study.json")
    assert study["phase"] == "desk_research"
    assert [p["status"] for p in study["phases"][:3]] == ["done", "done", "running"]
    assert [h["id"] for h in study["hypotheses"]] == ["H1", "H2"]
    assert all(h["verdict"] == "pending" for h in study["hypotheses"])
    assert study["limits"] == {"personas": 2, "interview_rounds": 3}
    assert study["guide_review"]["items"][0]["issue"] == "leading"


async def test_out_of_order_event_is_rejected_and_file_untouched(tmp_path):
    study_dir = await _study_at(tmp_path, [])
    before = _read(tmp_path, f"{study_dir}/study.json")

    result = await UpdateStudy(base_dir=tmp_path).execute(
        _context(), UpdateStudyParams(event="report_written", study_dir=study_dir)
    )

    assert result.ok is False
    assert "not allowed while phase is clarify" in result.content
    assert _read(tmp_path, f"{study_dir}/study.json") == before


async def test_hand_written_study_with_wrong_shape_is_reported(tmp_path):
    """例：模型手写的 phases 是对象、schema_version 是字符串，前端无法解析。"""
    _write(tmp_path, "studies/bad-1a2b/study.json", {
        "schema_version": "1.0", "phase": "clarify", "phases": {"clarify": "running"}, "title": "t", "question": "q",
    })

    result = await UpdateStudy(base_dir=tmp_path).execute(
        _context(), UpdateStudyParams(event="clarified", study_dir="studies/bad-1a2b")
    )

    assert result.ok is False
    assert "does not match the file contract" in result.content


async def test_interviews_finished_marks_failed_when_no_interview_succeeded(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    _write(tmp_path, f"{study_dir}/interviews/p_a_0001.json", {"schema_version": 1, "persona_id": "p_a_0001", "status": "failed", "error": "model", "rounds": []})

    result = await UpdateStudy(base_dir=tmp_path).execute(
        _context(), UpdateStudyParams(event="interviews_finished", study_dir=study_dir)
    )

    study = _read(tmp_path, f"{study_dir}/study.json")
    assert result.ok is True
    assert study["phase"] == "report"
    assert study["phases"][3]["status"] == "failed"


async def test_interviews_finished_waits_for_running_transcripts(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    _write(tmp_path, f"{study_dir}/interviews/p_a_0001.json", {"schema_version": 1, "persona_id": "p_a_0001", "status": "running", "rounds": []})

    result = await UpdateStudy(base_dir=tmp_path).execute(
        _context(), UpdateStudyParams(event="interviews_finished", study_dir=study_dir)
    )

    assert result.ok is False
    assert "still running" in result.content


async def test_created_without_topic_context_fails(tmp_path):
    result = await UpdateStudy(base_dir=tmp_path).execute(
        ToolContext(), UpdateStudyParams(event="created", title="T", question="Q", slug_hint="x")
    )

    assert result.ok is False
    assert "topic ID is unavailable" in result.content


# ── save_personas ──────────────────────────────────────────────────────────


def _persona(name, segment, evidence_types=("web", "web", "social"), behavior_sources=None):
    evidence = [
        {"id": f"e{i}", "type": kind, "platform": "xiaohongshu" if kind == "social" else "", "title": "t", "url": "u"}
        for i, kind in enumerate(evidence_types, start=1)
    ]
    ids = [e["id"] for e in evidence]
    return {
        "id_hint": name.lower(),
        "segment": segment,
        "reason": "fills the quota",
        "name": name,
        "dimensions": {
            "demographics": {"age": 40}, "geography": {"city_tier": "tier 2"}, "psychographics": {"values": ["x"]},
            "behavior": {"channel": "offline"}, "needs_pains": ["pain"], "tech_adoption": "late", "social": "peers",
        },
        "layers": {
            "expression": ["hmm"], "story": "story",
            "cognition": {"decision_weights": [{"factor": "price", "level": "high"}]}, "behavior": ["acts"],
        },
        "evidence": evidence,
        "field_sources": {
            "demographics": "inferred", "geography": "inferred", "psychographics": "inferred",
            "behavior": behavior_sources if behavior_sources is not None else ids[:1],
            "needs_pains": ids[:2], "tech_adoption": "inferred", "social": "inferred",
        },
    }


async def test_save_personas_assigns_ids_tiers_and_panel(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])

    result = await SavePersonas(base_dir=tmp_path).execute(ToolContext(), SavePersonasParams(
        study_dir=study_dir,
        panel_name="Study panel",
        personas=[_persona("Zhang", "Owners"), _persona("Li", "Skeptics", behavior_sources="inferred")],
    ))

    assert result.ok is True, result.content
    rows = result.data["personas"]
    assert [row["tier"] for row in rows] == ["evidence_based", "generated"]
    zhang = _read(tmp_path, f"personas/{rows[0]['persona_id']}.json")
    assert rows[0]["persona_id"].startswith("p_zhang_")
    assert zhang["schema_version"] == 1 and zhang["created_in"] == study_dir
    panel = _read(tmp_path, f"{study_dir}/panel.json")
    assert panel["persona_ids"] == [row["persona_id"] for row in rows]
    assert panel["selection"][1] == {"persona_id": rows[1]["persona_id"], "reason": "fills the quota", "reused": False, "segment": "Skeptics"}


async def test_save_personas_rejects_incomplete_persona_and_unknown_segment(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    incomplete = _persona("Zhang", "Owners")
    del incomplete["layers"]["story"]

    missing = await SavePersonas(base_dir=tmp_path).execute(
        ToolContext(), SavePersonasParams(study_dir=study_dir, panel_name="p", personas=[incomplete])
    )
    segment = await SavePersonas(base_dir=tmp_path).execute(
        ToolContext(), SavePersonasParams(study_dir=study_dir, panel_name="p", personas=[_persona("Li", "Nobody")])
    )

    assert missing.ok is False and "layers ['story']" in missing.content
    assert segment.ok is False and "unknown: Nobody" in segment.content
    assert not (tmp_path / study_dir / "panel.json").exists()


async def test_reused_persona_keeps_identity_and_appends_evidence(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    _write(tmp_path, "personas/p_old_1a2b.json", {
        "schema_version": 1, "id": "p_old_1a2b", "name": "Old", "tier": "generated",
        "evidence": [{"id": "e1", "type": "web"}], "field_sources": {"behavior": ["e1"]},
    })

    result = await SavePersonas(base_dir=tmp_path).execute(ToolContext(), SavePersonasParams(
        study_dir=study_dir, panel_name="p",
        personas=[{"id": "p_old_1a2b", "segment": "Owners", "reason": "reuse", "name": "Renamed",
                   "evidence": [{"id": "e2", "type": "web"}, {"id": "e3", "type": "upload", "file": "uploads/a.docx"}],
                   "field_sources": {"needs_pains": ["e2"]}}],
    ))

    saved = _read(tmp_path, "personas/p_old_1a2b.json")
    assert result.ok is True, result.content
    assert saved["name"] == "Old"
    assert [e["id"] for e in saved["evidence"]] == ["e1", "e2", "e3"]
    assert saved["tier"] == "evidence_based"


# ── finish_persona_transcript ──────────────────────────────────────────────

INTERVIEW = {
    "schema_version": 1, "persona_id": "p_a_0001", "status": "running", "error": "",
    "rounds": [
        {"role": "moderator", "text": "Last time?"},
        {"role": "persona", "text": "Last month I lost an order. I gave in (inferred)."},
        {"role": "moderator", "text": "Why?"},
        {"role": "persona", "text": "Arguing costs more than the discount."},
    ],
}


def test_inferred_ratio_counts_marked_sentences():
    assert compute_inferred_ratio(["一句。两句（无）。三句(inferred)。", "Four. Five (inferred)."]) == 0.4
    assert compute_inferred_ratio([]) == 0.0


async def test_finish_transcript_verifies_quotes_and_computes_quality(tmp_path):
    rel = "studies/s-1a2b/interviews/p_a_0001.json"
    _write(tmp_path, rel, INTERVIEW)

    result = await FinishPersonaTranscript(base_dir=tmp_path).execute(ToolContext(), FinishPersonaTranscriptParams(
        transcript_path=rel, status="done", summary="s", key_findings=["k"],
        quotes=[{"text": "“Arguing costs more than the discount.”", "theme": "relationship"}],
        concrete_stories=1,
    ))

    saved = _read(tmp_path, rel)
    assert result.ok is True, result.content
    assert saved["status"] == "done"
    assert saved["quotes"] == [{"text": "Arguing costs more than the discount.", "theme": "relationship"}]
    assert saved["quality"] == {"concrete_stories": 1, "inferred_ratio": 0.33, "agreement_flags": 0, "notes": ""}
    assert len(saved["rounds"]) == 4


async def test_finish_transcript_rejects_quotes_not_spoken_by_persona(tmp_path):
    rel = "studies/s-1a2b/interviews/p_a_0001.json"
    _write(tmp_path, rel, INTERVIEW)

    result = await FinishPersonaTranscript(base_dir=tmp_path).execute(ToolContext(), FinishPersonaTranscriptParams(
        transcript_path=rel, status="done", quotes=[{"text": "Last time?"}],
    ))

    assert result.ok is False
    assert "not the participants' exact words" in result.content
    assert _read(tmp_path, rel)["status"] == "running"


async def test_failed_transcript_needs_reason(tmp_path):
    rel = "studies/s-1a2b/interviews/p_a_0001.json"
    _write(tmp_path, rel, INTERVIEW)

    result = await FinishPersonaTranscript(base_dir=tmp_path).execute(
        ToolContext(), FinishPersonaTranscriptParams(transcript_path=rel, status="failed")
    )

    assert result.ok is False and "error is required" in result.content


# ── check_interviews ───────────────────────────────────────────────────────


async def test_check_interviews_lists_what_to_continue(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    _write(tmp_path, f"{study_dir}/panel.json", {"schema_version": 1, "id": "p", "name": "p", "persona_ids": ["p_a_0001", "p_b_0002", "p_c_0003"]})
    _write(tmp_path, f"{study_dir}/interviews/p_a_0001.json", {**INTERVIEW, "status": "done"})
    _write(tmp_path, f"{study_dir}/interviews/p_b_0002.json", {**INTERVIEW, "persona_id": "p_b_0002"})

    result = await CheckInterviews(base_dir=tmp_path).execute(ToolContext(), CheckInterviewsParams(study_dir=study_dir))

    assert result.ok is True
    assert result.data["effective_sample"] == 1
    assert "p_b_0002 round 3; p_c_0003 round 1" in result.content
    assert [row["status"] for row in result.data["interviews"]] == ["done", "running", "not_started"]


# ── save_study_synthesis ───────────────────────────────────────────────────


async def _report_ready(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed", "desk_research_done"])
    _write(tmp_path, f"{study_dir}/panel.json", {"schema_version": 1, "id": "p", "name": "p", "persona_ids": ["p_b_0002", "p_a_0001"]})
    _write(tmp_path, f"{study_dir}/interviews/p_a_0001.json", {**INTERVIEW, "status": "done", "quality": {"inferred_ratio": 0.1}})
    _write(tmp_path, f"{study_dir}/interviews/p_b_0002.json", {
        **INTERVIEW, "persona_id": "p_b_0002", "status": "done", "quality": {"inferred_ratio": 0.5},
        "rounds": [{"role": "moderator", "text": "Q"}, {"role": "persona", "text": "Too expensive for me."}],
    })
    _write(tmp_path, f"{study_dir}/discussions/fg_1.json", {
        "schema_version": 1, "id": "fg_1", "participants": ["p_a_0001", "p_b_0002"], "status": "done",
        "rounds": [{"speaker": "moderator", "text": "Price?"}, {"speaker": "p_b_0002", "text": "Not before a friend uses it."}],
    })
    result = await UpdateStudy(base_dir=tmp_path).execute(_context(), UpdateStudyParams(event="interviews_finished", study_dir=study_dir))
    assert result.ok, result.content
    return study_dir


async def test_synthesis_locates_quotes_caps_rules_and_counts_saturation(tmp_path):
    study_dir = await _report_ready(tmp_path)

    result = await SaveStudySynthesis(base_dir=tmp_path).execute(ToolContext(), SaveStudySynthesisParams(
        study_dir=study_dir,
        segments=[{"name": "Owners", "persona_ids": ["p_a_0001"]}, {"name": "Skeptics", "persona_ids": ["p_b_0002"]}],
        themes=[
            {"name": "Relationships win", "stance_by_persona": {"p_a_0001": "support"},
             "quotes": [{"persona_id": "p_a_0001", "text": "Arguing costs more than the discount."},
                        {"persona_id": "p_a_0001", "text": "Something never said"}],
             "source_refs": ["S1", "S9"], "hypothesis_ids": ["H1"], "confidence": "high"},
            {"name": "Price barrier", "stance_by_persona": {"p_b_0002": "oppose", "p_x_9999": "support"},
             "quotes": [{"persona_id": "p_b_0002", "text": "Not before a friend uses it."}],
             "confidence": "medium"},
        ],
        dimensions=[{"name": "Price", "level_by_segment": {"Owners": "low", "Skeptics": "high"},
                     "quotes": [{"persona_id": "p_b_0002", "text": "Too expensive for me."}]}],
        hypotheses=[
            {"id": "H1", "verdict": "supported", "verdict_reason": "Most agree.",
             "quotes": [{"persona_id": "p_a_0001", "text": "Arguing costs more than the discount."}]},
            {"id": "H2", "verdict": "refuted", "verdict_reason": "S2 contradicts it.", "source_refs": ["S2"],
             "quotes": [{"persona_id": "p_b_0002", "text": "Not before a friend uses it."}]},
        ],
    ))

    assert result.ok is True, result.content
    synthesis = _read(tmp_path, f"{study_dir}/synthesis.json")
    t1, t2 = synthesis["themes"]
    assert t1["quote_refs"] == [{"persona_id": "p_a_0001", "source": "interview", "file": "interviews/p_a_0001.json", "round_index": 3, "text": "Arguing costs more than the discount."}]
    assert t1["source_refs"] == ["S1"]
    assert t1["confidence"] == "medium"  # high 需要 2 个外部来源
    assert t2["quote_refs"][0]["file"] == "discussions/fg_1.json"
    assert t2["confidence"] == "to_validate"
    assert t2["stance_by_persona"] == {"p_a_0001": "not_mentioned", "p_b_0002": "oppose"}
    assert synthesis["dimensions"][0]["level_by_segment"] == {"seg_1": "low", "seg_2": "high"}
    # panel 顺序 p_b → p_a：T2 首次出现在 p_b，T1 首次出现在 p_a。
    assert synthesis["saturation"] == {"new_themes_per_interview": [1, 1], "saturated": False}
    assert "Something never said" in result.content
    assert "S9" in result.content

    hypotheses = {h["id"]: h for h in _read(tmp_path, f"{study_dir}/study.json")["hypotheses"]}
    assert hypotheses["H1"]["verdict"] == "mixed"
    assert hypotheses["H1"]["verdict_reason"].startswith("Pending real-person validation")
    assert hypotheses["H1"]["evidence_refs"] == [{"kind": "quote", "persona_id": "p_a_0001", "round_index": 3, "text": "Arguing costs more than the discount."}]
    assert hypotheses["H2"]["verdict"] == "refuted"
    assert hypotheses["H2"]["evidence_refs"][0]["file"] == "discussions/fg_1.json"
    assert hypotheses["H2"]["evidence_refs"][1] == {"kind": "source", "ref": "S2"}


async def test_synthesis_lowers_confidence_resting_on_downweighted_interviews(tmp_path):
    study_dir = await _report_ready(tmp_path)

    await SaveStudySynthesis(base_dir=tmp_path).execute(ToolContext(), SaveStudySynthesisParams(
        study_dir=study_dir,
        segments=[{"name": "Skeptics", "persona_ids": ["p_b_0002"]}],
        themes=[{"name": "价格门槛", "stance_by_persona": {"p_b_0002": "support"},
                 "quotes": [{"persona_id": "p_b_0002", "text": "Too expensive for me."}],
                 "source_refs": ["S1", "S2"], "confidence": "high", "confidence_reason": "两个来源"}],
    ))

    theme = _read(tmp_path, f"{study_dir}/synthesis.json")["themes"][0]
    assert theme["confidence"] == "low"
    assert "按规则调整" in theme["confidence_reason"]


async def test_synthesis_is_rejected_before_report_phase(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified"])

    result = await SaveStudySynthesis(base_dir=tmp_path).execute(ToolContext(), SaveStudySynthesisParams(
        study_dir=study_dir, segments=[{"name": "Owners"}], themes=[{"name": "x", "confidence": "low"}],
    ))

    assert result.ok is False and "report phase" in result.content


# ── save_validation_questionnaire ──────────────────────────────────────────


async def test_questionnaire_csv_has_bom_and_contract_columns(tmp_path):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed"])

    result = await SaveValidationQuestionnaire(base_dir=tmp_path).execute(ToolContext(), SaveValidationQuestionnaireParams(
        study_dir=study_dir,
        questions=[
            {"id": "S1", "question": "Do you own a shop?", "type": "single_choice", "options": ["Yes", "No"]},
            {"id": "Q1", "question": "Tell me about the last dispute.", "type": "open", "hypothesis_id": "H1"},
        ],
    ))

    raw = (tmp_path / study_dir / "validation-questionnaire.csv").read_bytes()
    assert result.ok is True, result.content
    assert raw.startswith(b"\xef\xbb\xbf")
    assert raw.decode("utf-8-sig").splitlines() == [
        "question_id,question,type,options,hypothesis_id",
        "S1,Do you own a shop?,single_choice,Yes|No,",
        "Q1,Tell me about the last dispute.,open,,H1",
    ]


@pytest.mark.parametrize("question, message", [
    ({"id": "Q1", "question": "q", "type": "single_choice", "options": ["Only"]}, "at least 2 options"),
    ({"id": "Q1", "question": "q", "type": "open", "hypothesis_id": "H9"}, "H9"),
])
async def test_questionnaire_rejects_invalid_questions(tmp_path, question, message):
    study_dir = await _study_at(tmp_path, ["clarified", "plan_confirmed"])

    result = await SaveValidationQuestionnaire(base_dir=tmp_path).execute(
        ToolContext(), SaveValidationQuestionnaireParams(study_dir=study_dir, questions=[question])
    )

    assert result.ok is False and message in result.content
