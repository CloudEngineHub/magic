"""Browser Snapshot 编码、上传、去重与附件发布。"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import time
from dataclasses import dataclass
from pathlib import PurePosixPath

from PIL import Image

from agentlang.context.tool_context import ToolContext
from agentlang.environment import Environment
from app.core.context.agent_context import AgentContext
from app.core.entity.attachment import Attachment, AttachmentStorageType, AttachmentTag
from app.core.entity.event.event_context import EventContext
from app.i18n import i18n
from app.infrastructure.storage.factory import StorageFactory
from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from app.utils.path_utils import get_workspace_dir
from magic_use.config import BrowserArtifactConfig
from magic_use.errors import BrowserErrorCode, BrowserSDKError


@dataclass(frozen=True, slots=True)
class BrowserScreenshotArtifact:
    content_hash: str
    file_key: str
    file_size: int
    width: int
    height: int
    quality: int
    reused: bool
    file_url: str | None


@dataclass(frozen=True, slots=True)
class _EncodedWebP:
    content: bytes
    width: int
    height: int
    quality: int


class BrowserArtifactService:
    def __init__(self, tool_context: ToolContext) -> None:
        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        if agent_context is None:
            raise BrowserSDKError(BrowserErrorCode.INVALID_CONFIG, "Agent context is unavailable")
        self._tool_context = tool_context
        self._agent_context = agent_context

    async def publish(self, image: bytes) -> BrowserScreenshotArtifact:
        content_hash = hashlib.sha256(image).hexdigest()
        config = BrowserConfigAdapter.artifact_config()
        encoded = await asyncio.to_thread(self._encode_webp, image, config)
        try:
            artifact = await self._publish_remote(content_hash, encoded)
        except asyncio.CancelledError:
            raise
        except Exception:
            if not Environment.is_local():
                raise
            artifact = self._create_local_artifact(content_hash, encoded)
        self._add_attachment(artifact)
        return artifact

    async def _publish_remote(
        self,
        content_hash: str,
        encoded: _EncodedWebP,
    ) -> BrowserScreenshotArtifact:
        storage = await StorageFactory.get_storage(
            sts_token_refresh=self._agent_context.get_init_client_message_sts_token_refresh(),
            metadata=self._agent_context.get_metadata(),
            platform=self._agent_context.get_init_client_message_platform_type(),
        )
        if storage.credentials is None:
            raise BrowserSDKError(BrowserErrorCode.INVALID_CONFIG, "Object storage credentials are unavailable")
        file_key = self._snapshot_file_key(
            get_workspace_dir(storage.credentials),
            content_hash,
        )
        reused = await storage.exists(file_key)
        if not reused:
            await storage.upload(file=encoded.content, key=file_key)

        file_url = None
        try:
            file_url = await storage.get_download_url(key=file_key, expires_in=3600)
        except asyncio.CancelledError:
            raise
        except Exception:
            # file_key 是正式展示契约；预签名 URL 仅用于本地调试器即时展示。
            file_url = None

        return BrowserScreenshotArtifact(
            content_hash=content_hash,
            file_key=file_key,
            file_size=len(encoded.content),
            width=encoded.width,
            height=encoded.height,
            quality=encoded.quality,
            reused=reused,
            file_url=file_url,
        )

    @staticmethod
    def _create_local_artifact(
        content_hash: str,
        encoded: _EncodedWebP,
    ) -> BrowserScreenshotArtifact:
        encoded_image = base64.b64encode(encoded.content).decode("ascii")
        return BrowserScreenshotArtifact(
            content_hash=content_hash,
            file_key=f"local-browser-snapshot:{content_hash}",
            file_size=len(encoded.content),
            width=encoded.width,
            height=encoded.height,
            quality=encoded.quality,
            reused=False,
            file_url=f"data:image/webp;base64,{encoded_image}",
        )

    def _snapshot_file_key(self, workspace_key: str, content_hash: str) -> str:
        context = self._agent_context.get_super_magic_context()
        metadata = self._agent_context.get_metadata()
        project_id = context.project.id if context is not None else str(metadata.get("project_id") or "")
        topic_id = context.topic.id if context is not None else str(
            metadata.get("topic_id") or metadata.get("chat_topic_id") or ""
        )
        if not project_id or not topic_id:
            raise BrowserSDKError(
                BrowserErrorCode.INVALID_CONFIG,
                "Project and topic context are required to store a Browser snapshot",
            )

        parts = PurePosixPath(workspace_key.strip("/")).parts
        project_part = f"project_{project_id}"
        if project_part not in parts:
            raise BrowserSDKError(
                BrowserErrorCode.INVALID_CONFIG,
                "The Browser snapshot storage path does not match the current project",
            )

        project_index = parts.index(project_part)
        project_suffix = parts[project_index + 1 :]
        if project_suffix not in ((), ("workspace",)):
            raise BrowserSDKError(
                BrowserErrorCode.INVALID_CONFIG,
                "The Browser snapshot storage path is not a project root or workspace path",
            )

        return PurePosixPath(
            *parts[: project_index + 1],
            "runtime",
            f"topic_{topic_id}",
            "snapshots",
            f"{content_hash}.webp",
        ).as_posix()

    def _add_attachment(self, artifact: BrowserScreenshotArtifact) -> None:
        event_context = self._tool_context.get_extension_typed("event_context", EventContext)
        if event_context is None:
            raise BrowserSDKError(BrowserErrorCode.INVALID_CONFIG, "Event context is unavailable")
        filename = f"{artifact.content_hash}.webp"
        event_context.add_attachment(
            Attachment(
                file_key=artifact.file_key,
                file_tag=AttachmentTag.BROWSER,
                file_extension="webp",
                filepath="",
                filename=filename,
                display_filename=i18n.translate(
                    "browser.attachment.snapshot",
                    category="tool.messages",
                ),
                file_size=artifact.file_size,
                file_url=artifact.file_url,
                timestamp=int(time.time()),
                storage_type=AttachmentStorageType.SNAPSHOT,
            )
        )

    @staticmethod
    def _encode_webp(image: bytes, config: BrowserArtifactConfig) -> _EncodedWebP:
        with Image.open(io.BytesIO(image)) as source:
            rendered = source.convert("RGB")
        quality_values = list(
            range(config.webp_quality, config.webp_min_quality - 1, -config.webp_quality_step)
        )
        if quality_values[-1] != config.webp_min_quality:
            quality_values.append(config.webp_min_quality)

        last = _EncodedWebP(content=b"", width=rendered.width, height=rendered.height, quality=config.webp_min_quality)
        while True:
            for quality in quality_values:
                output = io.BytesIO()
                rendered.save(output, format="WEBP", quality=quality, method=6)
                last = _EncodedWebP(
                    content=output.getvalue(),
                    width=rendered.width,
                    height=rendered.height,
                    quality=quality,
                )
                if len(last.content) <= config.max_bytes:
                    return last

            if min(rendered.width, rendered.height) <= config.min_dimension:
                return last
            next_size = (
                max(config.min_dimension, int(rendered.width * config.resize_step)),
                max(config.min_dimension, int(rendered.height * config.resize_step)),
            )
            if next_size == rendered.size:
                return last
            rendered = rendered.resize(next_size, Image.Resampling.LANCZOS)
