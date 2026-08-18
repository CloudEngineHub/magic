"""Canvas V1/V2 原格式兼容基线测试。"""

import pytest

from agentlang.path_manager import PathManager
from app.tools.design.manager import canvas_manager
from app.tools.design.manager.canvas_manager import CanvasManager
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.manager.canvas_manager_v2 import CanvasManagerV2
from app.tools.design.utils.magic_project_compression import MAGIC_PROJECT_DESIGN_DATA_PREFIX
from app.tools.design.utils.magic_project_design_parser import (
    CanvasConfig,
    ImageElement,
    MagicProjectConfig,
    read_magic_project_js,
    write_magic_project_js,
    write_magic_project_js_v2,
)
from app.utils.async_file_utils import async_mkdir, async_read_text


def _build_mock_config(version: str, name: str) -> MagicProjectConfig:
    """构造不包含真实用户数据的画布测试配置。"""
    return MagicProjectConfig(
        version=version,
        type="design",
        name=name,
        canvas=CanvasConfig(
            elements=[
                ImageElement(
                    id="mock-image-1",
                    type="image",
                    name="模拟图片",
                    x=10,
                    y=20,
                    width=320,
                    height=180,
                    zIndex=1,
                    visible=True,
                    src="./images/mock.png",
                    status="completed",
                )
            ],
            _extra_canvas_data={"background": "#ffffff"},
        ),
        _extra_project_data={"frontendMeta": {"source": "mock"}},
    )


@pytest.mark.asyncio
async def test_legacy_manager_stops_immediately_when_project_file_is_missing(monkeypatch):
    """旧版画布路径错误时立即失败，不重复等待确定不存在的文件。"""
    attempts = 0

    async def missing_file(_project_path):
        """模拟确定不存在的旧版项目文件。"""
        nonlocal attempts
        attempts += 1
        raise FileNotFoundError("mock legacy magic.project.js missing")

    monkeypatch.setattr(canvas_manager, "read_magic_project_js", missing_file)

    with pytest.raises(FileNotFoundError, match="mock legacy magic.project.js missing"):
        await CanvasManager("missing-project").read_current_canvas()

    assert attempts == 1


@pytest.mark.asyncio
async def test_v1_manager_keeps_plaintext_format_and_version(monkeypatch, tmp_path):
    """V1 事务写回后仍保持 V1 明文格式和已有扩展字段。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v1-project", parents=True, exist_ok=True)
    await write_magic_project_js("v1-project", _build_mock_config("1.0.0", "V1 基线"))

    manager = await get_canvas_manager("v1-project")
    assert type(manager) is CanvasManager

    def rename_project(config: MagicProjectConfig) -> str:
        """修改项目名称并返回写后校验所需结果。"""
        config.name = "V1 更新"
        return config.name

    await manager.run_write_transaction(
        rename_project,
        verify_content=lambda config, expected: config.name == expected,
    )

    raw_content = await async_read_text(tmp_path / "v1-project" / "magic.project.js")
    parsed = await read_magic_project_js("v1-project")
    assert MAGIC_PROJECT_DESIGN_DATA_PREFIX not in raw_content
    assert parsed.version == "1.0.0"
    assert parsed.name == "V1 更新"
    assert parsed._extra_project_data == {"frontendMeta": {"source": "mock"}}
    assert parsed.canvas is not None
    assert parsed.canvas._extra_canvas_data == {"background": "#ffffff"}


@pytest.mark.asyncio
async def test_v2_manager_keeps_compressed_format_and_version(monkeypatch, tmp_path):
    """V2 事务写回后仍保持 V2 压缩格式和已有扩展字段。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v2-project", parents=True, exist_ok=True)
    await write_magic_project_js_v2("v2-project", _build_mock_config("2.0.0", "V2 基线"))

    manager = await get_canvas_manager("v2-project")
    assert isinstance(manager, CanvasManagerV2)

    def rename_project(config: MagicProjectConfig) -> str:
        """修改项目名称并返回写后校验所需结果。"""
        config.name = "V2 更新"
        return config.name

    await manager.run_write_transaction(
        rename_project,
        verify_content=lambda config, expected: config.name == expected,
    )

    raw_content = await async_read_text(tmp_path / "v2-project" / "magic.project.js")
    parsed = await read_magic_project_js("v2-project")
    assert MAGIC_PROJECT_DESIGN_DATA_PREFIX in raw_content
    assert parsed.version == "2.0.0"
    assert parsed.name == "V2 更新"
    assert parsed._extra_project_data == {"frontendMeta": {"source": "mock"}}
    assert parsed.canvas is not None
    assert parsed.canvas._extra_canvas_data == {"background": "#ffffff"}
