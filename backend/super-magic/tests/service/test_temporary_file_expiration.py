"""临时文件过期策略与清理管理器单元测试。"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.service.temporary_file_expiration import manager as manager_module
from app.service.temporary_file_expiration.constants import (
    DEFAULT_TTL_SECONDS,
    IMAGE_TTL_SECONDS,
    TEXT_TTL_SECONDS,
)
from app.service.temporary_file_expiration.manager import TemporaryFileExpirationManager
from app.service.temporary_file_expiration.policy_registry import TemporaryFileExpirationPolicyRegistry

MOCK_TEMPORARY_DIRECTORY = Path("/mock/.workspace/.tmp")
MOCK_CURRENT_TIME = 2_000_000.0


def _make_directory_entry(
    path: Path,
    *,
    is_directory: bool = False,
    is_file: bool = False,
    is_symlink: bool = False,
) -> MagicMock:
    """创建不访问真实文件系统的模拟目录项。"""
    entry = MagicMock()
    entry.path = str(path)
    entry.is_dir.return_value = is_directory
    entry.is_file.return_value = is_file
    entry.is_symlink.return_value = is_symlink
    return entry


def _patch_file_operations(
    monkeypatch: pytest.MonkeyPatch,
    *,
    scandir: AsyncMock,
    is_symlink: AsyncMock | None = None,
    rmdir: AsyncMock | None = None,
    stat: AsyncMock | None = None,
    unlink: AsyncMock | None = None,
) -> tuple[AsyncMock, AsyncMock, AsyncMock, AsyncMock]:
    """统一替换清理器使用的异步文件操作，确保测试不访问真实文件。"""
    exists_mock = AsyncMock(return_value=True)
    is_symlink_mock = is_symlink or AsyncMock(return_value=False)
    rmdir_mock = rmdir or AsyncMock()
    stat_mock = stat or AsyncMock()
    unlink_mock = unlink or AsyncMock()
    monkeypatch.setattr(manager_module, "async_exists", exists_mock)
    monkeypatch.setattr(manager_module, "async_is_symlink", is_symlink_mock)
    monkeypatch.setattr(manager_module, "async_rmdir", rmdir_mock)
    monkeypatch.setattr(manager_module, "async_scandir", scandir)
    monkeypatch.setattr(manager_module, "async_stat", stat_mock)
    monkeypatch.setattr(manager_module, "async_unlink", unlink_mock)
    return exists_mock, is_symlink_mock, stat_mock, unlink_mock


def test_default_policy_registry_prioritizes_specific_policies() -> None:
    """验证默认策略优先匹配文本和图片类型，最后才使用兜底策略。"""
    registry = TemporaryFileExpirationPolicyRegistry.create_default()

    text_policy = registry.resolve(Path("temporary-note.txt"))
    image_policy = registry.resolve(Path("copied-image.PNG"))
    fallback_policy = registry.resolve(Path("temporary-data.bin"))

    assert text_policy.name == "text"
    assert text_policy.ttl_seconds == TEXT_TTL_SECONDS
    assert image_policy.name == "image"
    assert image_policy.ttl_seconds == IMAGE_TTL_SECONDS
    assert fallback_policy.name == "default"
    assert fallback_policy.ttl_seconds == DEFAULT_TTL_SECONDS


@pytest.mark.parametrize(
    ("file_path", "ttl_seconds"),
    [
        (Path("temporary-note.txt"), TEXT_TTL_SECONDS),
        (Path("copied-image.webp"), IMAGE_TTL_SECONDS),
        (Path("temporary-data.bin"), DEFAULT_TTL_SECONDS),
    ],
)
def test_policy_expiration_uses_inclusive_ttl_boundary(
    file_path: Path,
    ttl_seconds: int,
) -> None:
    """验证文件未满 TTL 时保留，达到 12 小时或 24 小时边界即过期。"""
    policy = TemporaryFileExpirationPolicyRegistry.create_default().resolve(file_path)

    assert not policy.is_expired(MOCK_CURRENT_TIME - ttl_seconds + 0.001, MOCK_CURRENT_TIME)
    assert policy.is_expired(MOCK_CURRENT_TIME - ttl_seconds, MOCK_CURRENT_TIME)


@pytest.mark.asyncio
async def test_cleanup_deletes_expired_file_and_keeps_fresh_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证清理器仅删除达到过期时间的文件，并保留未过期文件。"""
    expired_file = MOCK_TEMPORARY_DIRECTORY / "expired.png"
    fresh_file = MOCK_TEMPORARY_DIRECTORY / "fresh.png"
    scandir_mock = AsyncMock(
        return_value=[
            _make_directory_entry(expired_file, is_file=True),
            _make_directory_entry(fresh_file, is_file=True),
        ]
    )
    stat_mock = AsyncMock(
        side_effect=[
            SimpleNamespace(st_mtime=MOCK_CURRENT_TIME - IMAGE_TTL_SECONDS),
            SimpleNamespace(st_mtime=MOCK_CURRENT_TIME - IMAGE_TTL_SECONDS + 1),
        ]
    )
    unlink_mock = AsyncMock()
    exists_mock, is_symlink_mock, _, _ = _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
        stat=stat_mock,
        unlink=unlink_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    is_symlink_mock.assert_awaited_once_with(MOCK_TEMPORARY_DIRECTORY)
    exists_mock.assert_awaited_once_with(MOCK_TEMPORARY_DIRECTORY)
    assert stat_mock.await_args_list == [call(expired_file), call(fresh_file)]
    unlink_mock.assert_awaited_once_with(expired_file)
    assert result.scanned_files == 2
    assert result.deleted_files == 1
    assert result.failed_files == 0


@pytest.mark.asyncio
async def test_cleanup_recursively_scans_nested_directories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证清理器会递归扫描子目录并删除其中的过期文件。"""
    nested_directory = MOCK_TEMPORARY_DIRECTORY / "nested"
    nested_file = nested_directory / "expired.txt"
    directory_entry = _make_directory_entry(nested_directory, is_directory=True)
    file_entry = _make_directory_entry(nested_file, is_file=True)

    scandir_mock = AsyncMock(
        side_effect=[
            [directory_entry],
            [file_entry],
            [],
        ]
    )
    stat_mock = AsyncMock(
        return_value=SimpleNamespace(
            st_mtime=MOCK_CURRENT_TIME - DEFAULT_TTL_SECONDS,
        )
    )
    unlink_mock = AsyncMock()
    rmdir_mock = AsyncMock()
    _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
        rmdir=rmdir_mock,
        stat=stat_mock,
        unlink=unlink_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    assert scandir_mock.await_args_list == [
        call(MOCK_TEMPORARY_DIRECTORY),
        call(nested_directory),
        call(nested_directory),
    ]
    unlink_mock.assert_awaited_once_with(nested_file)
    rmdir_mock.assert_awaited_once_with(nested_directory)
    assert result.scanned_files == 1
    assert result.deleted_files == 1
    assert result.deleted_directories == 1
    assert result.failed_files == 0


@pytest.mark.asyncio
async def test_cleanup_keeps_nested_directory_with_fresh_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证子目录仍有未过期文件时不会删除该目录。"""
    nested_directory = MOCK_TEMPORARY_DIRECTORY / "nested"
    fresh_file = nested_directory / "fresh.png"
    directory_entry = _make_directory_entry(nested_directory, is_directory=True)
    file_entry = _make_directory_entry(fresh_file, is_file=True)
    scandir_mock = AsyncMock(
        side_effect=[
            [directory_entry],
            [file_entry],
            [file_entry],
        ]
    )
    stat_mock = AsyncMock(
        return_value=SimpleNamespace(
            st_mtime=MOCK_CURRENT_TIME - IMAGE_TTL_SECONDS + 1,
        )
    )
    rmdir_mock = AsyncMock()
    _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
        rmdir=rmdir_mock,
        stat=stat_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    rmdir_mock.assert_not_awaited()
    assert result.scanned_files == 1
    assert result.deleted_files == 0
    assert result.deleted_directories == 0
    assert result.failed_files == 0


@pytest.mark.asyncio
async def test_cleanup_continues_after_single_file_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证单个文件处理异常会被记录，且不会阻断后续文件清理。"""
    failed_file = MOCK_TEMPORARY_DIRECTORY / "failed.png"
    expired_file = MOCK_TEMPORARY_DIRECTORY / "expired.png"
    scandir_mock = AsyncMock(
        return_value=[
            _make_directory_entry(failed_file, is_file=True),
            _make_directory_entry(expired_file, is_file=True),
        ]
    )
    stat_mock = AsyncMock(
        side_effect=[
            OSError("mock stat failure"),
            SimpleNamespace(st_mtime=MOCK_CURRENT_TIME - IMAGE_TTL_SECONDS),
        ]
    )
    unlink_mock = AsyncMock()
    _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
        stat=stat_mock,
        unlink=unlink_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    assert stat_mock.await_args_list == [call(failed_file), call(expired_file)]
    unlink_mock.assert_awaited_once_with(expired_file)
    assert result.scanned_files == 2
    assert result.deleted_files == 1
    assert result.failed_files == 1


@pytest.mark.asyncio
async def test_cleanup_skips_symbolic_links(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证清理器跳过软链接，且不会读取或删除软链接指向的文件。"""
    symlink_path = MOCK_TEMPORARY_DIRECTORY / "linked-file.png"
    symlink_entry = _make_directory_entry(
        symlink_path,
        is_file=True,
        is_symlink=True,
    )
    scandir_mock = AsyncMock(return_value=[symlink_entry])
    _, _, stat_mock, unlink_mock = _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    stat_mock.assert_not_awaited()
    unlink_mock.assert_not_awaited()
    symlink_entry.is_dir.assert_not_called()
    symlink_entry.is_file.assert_not_called()
    assert result.scanned_files == 0
    assert result.deleted_files == 0
    assert result.failed_files == 0


@pytest.mark.asyncio
async def test_cleanup_skips_symbolic_link_root_directory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证临时目录根路径是软链接时不进入扫描，避免删除链接目标中的文件。"""
    scandir_mock = AsyncMock()
    is_symlink_mock = AsyncMock(return_value=True)
    exists_mock, _, stat_mock, unlink_mock = _patch_file_operations(
        monkeypatch,
        scandir=scandir_mock,
        is_symlink=is_symlink_mock,
    )
    manager = TemporaryFileExpirationManager(
        temporary_directory=MOCK_TEMPORARY_DIRECTORY,
        clock=lambda: MOCK_CURRENT_TIME,
    )

    result = await manager.cleanup_expired_files()

    is_symlink_mock.assert_awaited_once_with(MOCK_TEMPORARY_DIRECTORY)
    exists_mock.assert_not_awaited()
    scandir_mock.assert_not_awaited()
    stat_mock.assert_not_awaited()
    unlink_mock.assert_not_awaited()
    assert result.scanned_files == 0
    assert result.deleted_files == 0
    assert result.failed_files == 0


def test_trigger_uses_single_flight_for_running_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """验证已有后台清理任务运行时，重复触发不会创建第二个任务。"""
    manager = TemporaryFileExpirationManager(temporary_directory=MOCK_TEMPORARY_DIRECTORY)
    cleanup_awaitable = object()
    cleanup_mock = MagicMock(return_value=cleanup_awaitable)
    running_task = MagicMock()
    running_task.done.return_value = False
    create_task_mock = MagicMock(return_value=running_task)
    monkeypatch.setattr(manager, "cleanup_expired_files", cleanup_mock)
    monkeypatch.setattr(manager_module.asyncio, "create_task", create_task_mock)

    manager.trigger()
    manager.trigger()

    cleanup_mock.assert_called_once_with()
    create_task_mock.assert_called_once_with(cleanup_awaitable)
    running_task.add_done_callback.assert_called_once_with(manager._handle_cleanup_done)
    running_task.done.assert_called_once_with()
