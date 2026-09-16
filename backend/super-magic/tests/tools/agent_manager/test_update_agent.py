import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.path_manager import PathManager
from app.tools.agent_manager.update_agent import UpdateAgent


@pytest.mark.asyncio
async def test_resolve_icon_key_tolerates_path_variants(tmp_path):
    workspace_dir = tmp_path / "workspace"
    magic_dir = workspace_dir / ".magic"

    with patch.object(PathManager, "get_workspace_dir", return_value=workspace_dir), \
         patch.object(PathManager, "get_magic_dir", return_value=magic_dir), \
         patch("app.utils.public_storage_uploader.upload_file_to_public_storage", new_callable=AsyncMock) as mock_upload:
        mock_upload.return_value = "DT001/public/avatar_mock123.jpg"

        # 1. Exact path
        avatars_dir = magic_dir / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)
        logo_file = avatars_dir / "agent-logo.jpg"
        logo_file.write_bytes(b"dummy-image-data")
        res1 = await UpdateAgent._resolve_icon_key(".magic/avatars/agent-logo.jpg")
        assert res1 == "DT001/public/avatar_mock123.jpg"
        assert not logo_file.exists()

        # 2. Tolerates .magics misspelling
        avatars_dir.mkdir(parents=True, exist_ok=True)
        logo_file.write_bytes(b"dummy-image-data")
        res2 = await UpdateAgent._resolve_icon_key(".magics/avatars/agent-logo.jpg")
        assert res2 == "DT001/public/avatar_mock123.jpg"
        assert not logo_file.exists()

        # 3. Tolerates avatars/... relative path
        avatars_dir.mkdir(parents=True, exist_ok=True)
        logo_file.write_bytes(b"dummy-image-data")
        res3 = await UpdateAgent._resolve_icon_key("avatars/agent-logo.jpg")
        assert res3 == "DT001/public/avatar_mock123.jpg"
        assert not logo_file.exists()

        # 4. Tolerates bare filename
        avatars_dir.mkdir(parents=True, exist_ok=True)
        logo_file.write_bytes(b"dummy-image-data")
        res4 = await UpdateAgent._resolve_icon_key("agent-logo.jpg")
        assert res4 == "DT001/public/avatar_mock123.jpg"
        assert not logo_file.exists()


@pytest.mark.asyncio
async def test_resolve_icon_key_rejects_missing_local_file(tmp_path):
    workspace_dir = tmp_path / "workspace"
    magic_dir = workspace_dir / ".magic"
    magic_dir.mkdir(parents=True, exist_ok=True)

    with patch.object(PathManager, "get_workspace_dir", return_value=workspace_dir), \
         patch.object(PathManager, "get_magic_dir", return_value=magic_dir):

        # Missing local relative path must return None rather than being treated as object storage key
        assert await UpdateAgent._resolve_icon_key(".magic/avatars/missing.jpg") is None
        assert await UpdateAgent._resolve_icon_key(".magics/avatars/missing.jpg") is None
        assert await UpdateAgent._resolve_icon_key("avatars/missing.png") is None
        assert await UpdateAgent._resolve_icon_key("missing.jpg") is None


@pytest.mark.asyncio
async def test_resolve_icon_key_url_and_remote_key():
    # Direct HTTP URL
    assert await UpdateAgent._resolve_icon_key("https://cdn.example.com/avatar.jpg") == "https://cdn.example.com/avatar.jpg"

    # Already valid object storage key (without local image filename suffix / local prefix)
    assert await UpdateAgent._resolve_icon_key("DT001/12345/u/67890/avatar_abc123") == "DT001/12345/u/67890/avatar_abc123"


@pytest.mark.asyncio
async def test_resolve_icon_key_rejects_path_traversal_and_out_of_bounds(tmp_path):
    workspace_dir = tmp_path / "workspace"
    magic_dir = workspace_dir / ".magic"
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir(parents=True, exist_ok=True)
    secret_file = outside_dir / "secret.key"
    secret_file.write_bytes(b"sensitive_secret_data")

    avatars_dir = magic_dir / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)

    with patch.object(PathManager, "get_workspace_dir", return_value=workspace_dir), \
         patch.object(PathManager, "get_magic_dir", return_value=magic_dir), \
         patch("app.utils.public_storage_uploader.upload_file_to_public_storage", new_callable=AsyncMock) as mock_upload:

        # 1. 相对路径 traversal
        res1 = await UpdateAgent._resolve_icon_key("../../outside/secret.key")
        assert res1 is None
        assert secret_file.exists()
        mock_upload.assert_not_called()

        # 2. 外部绝对路径
        res2 = await UpdateAgent._resolve_icon_key(str(secret_file))
        assert res2 is None
        assert secret_file.exists()
        mock_upload.assert_not_called()

        # 3. 符号链接逃逸到工作区外部
        symlink_file = avatars_dir / "escaped_symlink.jpg"
        symlink_file.symlink_to(secret_file)
        res3 = await UpdateAgent._resolve_icon_key(".magic/avatars/escaped_symlink.jpg")
        assert res3 is None
        assert secret_file.exists()
        mock_upload.assert_not_called()

