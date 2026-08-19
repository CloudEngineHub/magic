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


def test_skill_does_not_expose_protocol_version_or_storage_driver() -> None:
    """Skill 不应把协议版本和底层驱动暴露给模型。"""
    content = SKILL_PATH.read_text(encoding="utf-8")

    assert "Canvas version" not in content
    assert "magic.project.js" not in content
    assert "magic-service" not in content
