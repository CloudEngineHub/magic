"""本地视频生成结果后台同步服务测试。"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.tools.design.service.local_video_result_sync_service import (
    LocalVideoResultSyncRequest,
    LocalVideoResultSyncService,
)


def _build_request(tmp_path: Path, *, set_as_main: bool = False) -> LocalVideoResultSyncRequest:
    """构造不依赖真实项目数据的同步请求。"""
    return LocalVideoResultSyncRequest(
        project_path=tmp_path / "demo-project",
        project_id="project-1",
        video_id="video-1",
        element_id="element-1",
        content_id="element-1-content-2",
        output_path=tmp_path / "demo-project" / "videos" / "result.mp4",
        relative_output_path="./videos/result.mp4",
        width=1280,
        height=720,
        set_as_main=set_as_main,
    )


@pytest.mark.asyncio
async def test_wait_for_result_returns_after_running_becomes_completed(monkeypatch, tmp_path):
    """轮询应忽略运行中状态并返回最终完成结果。"""
    client = SimpleNamespace(
        query_video_generation_result=AsyncMock(
            side_effect=[
                {"status": "running"},
                {"status": "completed", "file_url": "https://example.test/result.mp4"},
            ]
        )
    )
    sleep = AsyncMock()
    monkeypatch.setattr(
        "app.tools.design.service.local_video_result_sync_service.asyncio.sleep",
        sleep,
    )

    result = await LocalVideoResultSyncService._wait_for_result(
        client,
        _build_request(tmp_path),
    )

    assert result["status"] == "completed"
    assert client.query_video_generation_result.await_count == 2
    sleep.assert_awaited_once()


@pytest.mark.asyncio
async def test_mark_completed_updates_exact_content_and_sets_main_after_completion(
    monkeypatch,
    tmp_path,
):
    """完成回写必须定位提交时 Content，并在完成后按需设为主版本。"""
    element = SimpleNamespace(id="element-1")
    manager = SimpleNamespace(
        supports_content_versions=lambda: True,
        get_element_by_id=AsyncMock(return_value=element),
        update_element=AsyncMock(return_value=True),
    )

    async def run_write_transaction(mutator):
        """执行 mock 写事务。"""
        return await mutator(SimpleNamespace())

    manager.run_write_transaction = run_write_transaction

    async def get_manager(_project_path):
        """返回 mock Canvas Manager。"""
        return manager

    set_main_content = MagicMock()
    monkeypatch.setattr(
        "app.tools.design.service.local_video_result_sync_service.get_canvas_manager",
        get_manager,
    )
    monkeypatch.setattr(
        "app.tools.design.service.local_video_result_sync_service.ContentService.set_main_content",
        set_main_content,
    )
    request = _build_request(tmp_path, set_as_main=True)

    await LocalVideoResultSyncService._mark_completed(request)

    manager.update_element.assert_awaited_once()
    args, kwargs = manager.update_element.await_args
    assert args[0] == "element-1"
    assert args[1] == {
        "status": "completed",
        "src": "./videos/result.mp4",
        "width": 1280.0,
        "height": 720.0,
        "errorMessage": None,
    }
    assert kwargs["content_id"] == "element-1-content-2"
    set_main_content.assert_called_once_with(element, "element-1-content-2")


@pytest.mark.asyncio
async def test_mark_failed_updates_exact_content_without_switching_active_content(
    monkeypatch,
    tmp_path,
):
    """失败回写必须更新确定 Content，不能退化为更新当前 active Content。"""
    manager = SimpleNamespace(
        supports_content_versions=lambda: True,
        get_element_by_id=AsyncMock(return_value=SimpleNamespace(id="element-1")),
        update_element=AsyncMock(return_value=True),
    )

    async def run_write_transaction(mutator):
        """执行 mock 写事务。"""
        return await mutator(SimpleNamespace())

    manager.run_write_transaction = run_write_transaction

    async def get_manager(_project_path):
        """返回 mock Canvas Manager。"""
        return manager

    monkeypatch.setattr(
        "app.tools.design.service.local_video_result_sync_service.get_canvas_manager",
        get_manager,
    )
    request = _build_request(tmp_path)

    await LocalVideoResultSyncService._mark_failed(request, "远端任务失败")

    manager.update_element.assert_awaited_once()
    args, kwargs = manager.update_element.await_args
    assert args[0] == "element-1"
    assert args[1] == {
        "status": "failed",
        "width": 1280.0,
        "height": 720.0,
        "errorMessage": "远端任务失败",
    }
    assert kwargs["content_id"] == "element-1-content-2"
