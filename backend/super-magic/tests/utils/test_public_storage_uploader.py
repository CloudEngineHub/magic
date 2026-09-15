"""
Test public storage uploader and upload temporary credential parameter.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.infrastructure.sdk.magic_service.parameter.get_upload_temporary_credential_parameter import (
    GetUploadTemporaryCredentialParameter,
)
from app.infrastructure.storage.types import PlatformType, VolcEngineCredentials
from app.utils.public_storage_uploader import upload_file_to_public_storage


def test_get_upload_temporary_credential_parameter():
    param = GetUploadTemporaryCredentialParameter(
        storage="public",
        content_type="image/jpeg",
        sts=True,
        authorization="Bearer test_token",
        organization_code="DT001",
    )
    param.validate()
    body = param.to_body()
    assert body["storage"] == "public"
    assert body["content_type"] == "image/jpeg"
    assert body["sts"] is True

    headers = param.to_headers()
    assert headers["Authorization"] == "Bearer test_token"
    assert headers["organization-code"] == "DT001"


def test_get_upload_temporary_credential_parameter_validation():
    param = GetUploadTemporaryCredentialParameter(storage="invalid_storage")
    with pytest.raises(ValueError, match="storage must be either 'public' or 'private'"):
        param.validate()


@pytest.mark.asyncio
async def test_upload_file_to_public_storage_not_found(tmp_path):
    non_existent = tmp_path / "not_found.jpg"
    with pytest.raises(FileNotFoundError):
        await upload_file_to_public_storage(non_existent)


@pytest.mark.asyncio
async def test_upload_file_to_public_storage_tos_mock(tmp_path):
    test_file = tmp_path / "avatar.jpg"
    test_file.write_bytes(b"dummy image content")

    mock_cred_response = {
        "platform": "tos",
        "temporary_credential": {
            "bucket": "test-public-bucket",
            "dir": "DT001/user_123/4c91/u/123/",
            "host": "test-public-bucket.tos-cn-beijing.volces.com",
            "endpoint": "tos-cn-beijing.volces.com",
            "region": "cn-beijing",
            "expires": 3600,
            "credentials": {
                "AccessKeyId": "mock_ak",
                "SecretAccessKey": "mock_sk",
                "SessionToken": "mock_token",
                "ExpiredTime": "2099-12-31T23:59:59Z",
                "CurrentTime": "2026-09-15T00:00:00Z",
            },
        },
    }

    with (
        patch("app.utils.public_storage_uploader.get_magic_service_sdk") as mock_get_sdk,
        patch(
            "app.utils.public_storage_uploader.StorageFactory.get_storage",
            new_callable=AsyncMock,
        ) as mock_get_storage,
    ):
        mock_sdk = MagicMock()
        mock_sdk.file.get_upload_temporary_credential_async = AsyncMock(
            return_value=mock_cred_response
        )
        mock_get_sdk.return_value = mock_sdk
        mock_storage = MagicMock()
        mock_storage.upload = AsyncMock()
        mock_get_storage.return_value = mock_storage

        file_key = await upload_file_to_public_storage(test_file, custom_filename="custom_logo.jpg")

        assert file_key == "DT001/user_123/4c91/u/123/custom_logo.jpg"
        mock_get_storage.assert_awaited_once_with(platform=PlatformType.tos)
        credentials = mock_storage.set_credentials.call_args.args[0]
        assert isinstance(credentials, VolcEngineCredentials)
        assert credentials.temporary_credential.bucket == "test-public-bucket"
        mock_storage.upload.assert_awaited_once_with(
            file=str(test_file),
            key="DT001/user_123/4c91/u/123/custom_logo.jpg",
        )


@pytest.mark.asyncio
async def test_upload_file_to_public_storage_rejects_unsupported_platform(tmp_path):
    test_file = tmp_path / "avatar.jpg"
    test_file.write_bytes(b"dummy image content")

    mock_cred_response = {
        "platform": "unsupported",
        "temporary_credential": {"dir": "public/"},
    }

    with patch("app.utils.public_storage_uploader.get_magic_service_sdk") as mock_get_sdk:
        mock_sdk = MagicMock()
        mock_sdk.file.get_upload_temporary_credential_async = AsyncMock(
            return_value=mock_cred_response
        )
        mock_get_sdk.return_value = mock_sdk

        with pytest.raises(ValueError, match="Unsupported storage platform"):
            await upload_file_to_public_storage(test_file)
