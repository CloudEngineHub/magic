"""Canvas Manager Skill 的静态约束测试。"""

from pathlib import Path

SKILL_PATH = Path(__file__).parents[2] / "agents" / "skills" / "canvas-manager" / "SKILL.md"


def test_skill_constrains_retry_and_connection_boundaries() -> None:
    """Skill 必须覆盖重试上限和受控 Connection 删除。"""
    content = SKILL_PATH.read_text(encoding="utf-8")

    assert "at most 2 times" in content
    assert "Never loop retries automatically" in content
    assert "replace_existing_connections=true" in content
    assert "remove_connection_ids" in content
    assert "asset_path" in content
    assert "Element and Content deletion are not available" in content


def test_skill_describes_frame_boundaries_and_follow_up_ids() -> None:
    """Skill 必须说明 Frame 的选区边界、局部坐标和后续真实 ID。"""
    content = SKILL_PATH.read_text(encoding="utf-8")

    assert "frame_canvas_elements" in content
    assert "frame_element_id" in content
    assert "child_element_ids" in content
    assert "local" in content
    assert "does not frame existing Frames/Groups" in content
    assert "unframing" in content


def test_skill_does_not_expose_protocol_version_or_storage_driver() -> None:
    """Skill 不应把协议版本和底层驱动暴露给模型。"""
    content = SKILL_PATH.read_text(encoding="utf-8")

    assert "Canvas version" not in content
    assert "magic.project.js" not in content
    assert "magic-service" not in content


def test_canvas_agent_and_references_do_not_expose_storage_protocol_details() -> None:
    """Agent、Skill 和 reference 的模型可见文案不能泄露协议或驱动实现。"""
    root = SKILL_PATH.parent
    paths = [root.parent.parent / "canvas.agent", SKILL_PATH, *sorted((root / "references").glob("*.md"))]
    forbidden = ("Canvas version", "magic.project.js", "magic-service", "3.0.0")
    for path in paths:
        content = path.read_text(encoding="utf-8")
        assert all(value not in content for value in forbidden), path
