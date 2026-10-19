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
    raw["topic_ids"] = ["child"]
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
    assert saved["topic_ids"] == ["child"]
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
