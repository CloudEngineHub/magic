"""整项目 mention handler 单元测试。"""

import pytest

from app.service.mention.builder import MentionContextBuilder
from app.service.mention.handlers.project_handler import ProjectHandler

PROJECT_PATH = "/mnt/agfs/magicfs/referenced-projects/904730666716749825"
PROJECT_NAME = "更换模型"


@pytest.mark.asyncio
async def test_project_handler_handle_outputs_absolute_path() -> None:
    """handle 应保留 project_path 的绝对路径（不做 normalize）。"""
    handler = ProjectHandler()
    mention = {
        "type": "project",
        "project_id": "904730666716749825",
        "project_name": PROJECT_NAME,
        "project_path": PROJECT_PATH,
    }

    lines = await handler.handle(mention, 1)

    assert lines[0] == f"1. [@project:{PROJECT_PATH}]"
    assert f"   - Project name: {PROJECT_NAME}" in lines
    assert f"   - Project path: {PROJECT_PATH}" in lines
    # 绝对路径前导 / 必须保留
    assert all(PROJECT_PATH.startswith("/") for _ in [0])


@pytest.mark.asyncio
async def test_project_handler_handle_without_name() -> None:
    """缺少 project_name 时不应报错，仅省略 name 行。"""
    handler = ProjectHandler()
    mention = {
        "type": "project",
        "project_id": "904730666716749825",
        "project_path": PROJECT_PATH,
    }

    lines = await handler.handle(mention, 1)

    assert lines[0] == f"1. [@project:{PROJECT_PATH}]"
    assert not any("Project name:" in line for line in lines)
    assert f"   - Project path: {PROJECT_PATH}" in lines


@pytest.mark.asyncio
async def test_project_handler_get_type() -> None:
    assert ProjectHandler().get_type() == "project"


@pytest.mark.asyncio
async def test_project_handler_get_tip() -> None:
    tip = await ProjectHandler().get_tip({"type": "project"}, None)
    assert "referenced project" in tip


@pytest.mark.asyncio
async def test_builder_renders_project_mention_not_fallback() -> None:
    """MentionContextBuilder 对 project 类型应走 ProjectHandler，不再输出 'reference: {mention}' 兜底。"""
    builder = MentionContextBuilder()
    mentions = [
        {
            "type": "project",
            "project_id": "904730666716749825",
            "project_name": PROJECT_NAME,
            "project_path": PROJECT_PATH,
        }
    ]

    result = await builder.build(mentions, None)

    assert f"[@project:{PROJECT_PATH}]" in result
    assert PROJECT_NAME in result
    # 不应出现未知类型的兜底输出
    assert "reference: {" not in result
