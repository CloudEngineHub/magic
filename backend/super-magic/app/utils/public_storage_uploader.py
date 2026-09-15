"""
Public Storage Uploader

Utility for uploading local files to public object storage via Magic Service STS credentials.
"""

import mimetypes
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Type, Union

from agentlang.logger import get_logger
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.get_upload_temporary_credential_parameter import (
    GetUploadTemporaryCredentialParameter,
)
from app.utils.async_file_utils import async_exists
from app.infrastructure.storage.factory import StorageFactory
from app.infrastructure.storage.types import (
    AliyunCredentials,
    BaseStorageCredentials,
    LocalCredentials,
    PlatformType,
    S3Credentials,
    VolcEngineCredentials,
)

logger = get_logger(__name__)


_CREDENTIAL_MODELS: Dict[PlatformType, Type[BaseStorageCredentials]] = {
    PlatformType.tos: VolcEngineCredentials,
    PlatformType.aliyun: AliyunCredentials,
    PlatformType.minio: S3Credentials,
    PlatformType.local: LocalCredentials,
}


async def upload_file_to_public_storage(
    local_file_path: Union[Path, str],
    custom_filename: Optional[str] = None,
) -> str:
    """
    Upload a local file to public object storage using Magic Service credentials.

    Args:
        local_file_path: Path to the local file to upload.
        custom_filename: Optional filename to use in destination path. If omitted,
                         a unique filename with original extension is generated.

    Returns:
        str: The public object storage file_key.

    Raises:
        FileNotFoundError: If the local file does not exist.
        ValueError: If the storage platform is unsupported.
        Exception: If uploading fails.
    """
    path = Path(local_file_path)
    if not await async_exists(path):
        raise FileNotFoundError(f"Local file not found: {path}")

    # Determine MIME type
    content_type, _ = mimetypes.guess_type(str(path))
    if not content_type:
        content_type = "application/octet-stream"

    # Request public STS upload credential from Magic Service
    sdk = get_magic_service_sdk()
    param = GetUploadTemporaryCredentialParameter(
        storage="public",
        content_type=content_type,
        sts=True,
    )
    cred_resp: Dict[str, Any] = await sdk.file.get_upload_temporary_credential_async(param)

    platform_name = cred_resp.get("platform", "tos")
    normalized_platform_name = "minio" if platform_name == "s3" else platform_name
    try:
        platform = PlatformType(normalized_platform_name)
    except ValueError as exc:
        raise ValueError(f"Unsupported storage platform: {platform_name!r}") from exc

    tc = cred_resp.get("temporary_credential", {})
    dir_prefix = tc.get("dir", "")

    # Build target file_key
    if custom_filename:
        filename = custom_filename
    else:
        ext = path.suffix or ".jpg"
        filename = f"avatar_{uuid.uuid4().hex[:12]}{ext}"

    file_key = f"{dir_prefix.rstrip('/')}/{filename.lstrip('/')}"

    logger.info(
        f"Uploading local file {path} to public storage (platform={platform_name}, key={file_key})"
    )

    credential_model = _CREDENTIAL_MODELS[platform]
    credentials = credential_model.model_validate(
        {
            **cred_resp,
            "platform": platform.value,
        }
    )
    storage_service = await StorageFactory.get_storage(platform=platform)
    storage_service.set_credentials(credentials)
    await storage_service.upload(file=str(path), key=file_key)

    logger.info(f"Public storage upload succeeded: {path} -> {file_key}")
    return file_key
