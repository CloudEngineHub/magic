"""关联话题不能重建研究，也不能在后续阶段写回时丢失关联。"""

import json
from types import SimpleNamespace

from agentlang.context.tool_context import ToolContext
from app.tools.persona_research.update_study import UpdateStudy, UpdateStudyParams


def context(topic_id):
    result = ToolContext()
    product = SimpleNamespace(topic=SimpleNamespace(id=topic_id))
    result.register_extension("agent_context", SimpleNamespace(get_super_magic_product_context=lambda: product))
    return result


async def test_child_cannot_create_another_study_and_updates_keep_relationship(tmp_path):
    tool = UpdateStudy(base_dir=tmp_path)
    created = await tool.execute(context("main"), UpdateStudyParams(
        event="created", title="Study", question="Question", slug_hint="study",
    ))
    path = tmp_path / created.data["study_dir"] / "study.json"
    raw = json.loads(path.read_text())
    marker = {"schema_version": 1, "topic_id": "child", "primary_topic_id": "main", "study_dir": created.data["study_dir"], "state": "linked", "title": "Study"}
    (tmp_path / "study-topics").mkdir()
    (tmp_path / "study-topics" / "child.json").write_text(json.dumps(marker))
    raw["custom_field"] = "kept"
    path.write_text(json.dumps(raw))
    before = path.read_text()

    rejected = await tool.execute(context("child"), UpdateStudyParams(
        event="created", title="Wrong", question="Wrong", slug_hint="wrong",
    ))
    assert not rejected.ok
    assert created.data["study_dir"] in rejected.content
    assert path.read_text() == before
    assert len(list((tmp_path / "studies").iterdir())) == 1

    continued = await tool.execute(context("child"), UpdateStudyParams(
        event="clarified", study_dir=created.data["study_dir"],
    ))
    assert continued.ok
    saved = json.loads(path.read_text())
    assert saved["topic_id"] == "main"
    assert json.loads((tmp_path / "study-topics" / "child.json").read_text()) == marker
    assert saved["custom_field"] == "kept"


async def test_old_study_without_children_is_readable(tmp_path):
    tool = UpdateStudy(base_dir=tmp_path)
    result = await tool.execute(context("main"), UpdateStudyParams(
        event="created", title="Study", question="Question", slug_hint="study",
    ))
    path = tmp_path / result.data["study_dir"] / "study.json"
    raw = json.loads(path.read_text())
    raw.pop("topic_ids", None)
    path.write_text(json.dumps(raw))
    updated = await tool.execute(context("main"), UpdateStudyParams(
        event="clarified", study_dir=result.data["study_dir"],
    ))
    assert updated.ok
    assert json.loads(path.read_text())["topic_id"] == "main"


async def test_deletion_intent_blocks_linked_topic_creation_and_study_writes(tmp_path):
    tool = UpdateStudy(base_dir=tmp_path)
    created = await tool.execute(context("main"), UpdateStudyParams(event="created", title="Study", question="Question", slug_hint="study"))
    directory = tmp_path / "study-topics"
    directory.mkdir()
    base = {"schema_version": 1, "primary_topic_id": "main", "study_dir": created.data["study_dir"], "title": "Study"}
    (directory / "main.json").write_text(json.dumps({**base, "topic_id": "main", "state": "deleting"}))
    (directory / "child.json").write_text(json.dumps({**base, "topic_id": "child", "state": "linked"}))
    before = (tmp_path / created.data["study_dir"] / "study.json").read_text()
    for topic_id in ("main", "child"):
        result = await tool.execute(context(topic_id), UpdateStudyParams(event="created", title="Wrong", question="Wrong"))
        assert not result.ok
        assert "delet" in result.content
    result = await tool.execute(context("child"), UpdateStudyParams(event="clarified", study_dir=created.data["study_dir"]))
    assert not result.ok
    assert (tmp_path / created.data["study_dir"] / "study.json").read_text() == before


async def test_mismatched_or_malformed_marker_never_creates_another_study(tmp_path):
    tool = UpdateStudy(base_dir=tmp_path)
    created = await tool.execute(context("main"), UpdateStudyParams(event="created", title="Study", question="Question"))
    directory = tmp_path / "study-topics"
    directory.mkdir()
    marker = {"schema_version": 1, "primary_topic_id": "other", "topic_id": "child", "study_dir": created.data["study_dir"], "state": "linked", "title": "Study"}
    for raw in (json.dumps(marker), "{broken"):
        (directory / "child.json").write_text(raw)
        result = await tool.execute(context("child"), UpdateStudyParams(event="created", title="Wrong", question="Wrong"))
        assert not result.ok
        assert len(list((tmp_path / "studies").iterdir())) == 1
