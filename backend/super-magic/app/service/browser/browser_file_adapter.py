"""Browser 仅供外部能力读取的短期文件适配。"""

from __future__ import annotations

import asyncio
import io
import os
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from app.utils.async_file_utils import (
    async_close_fd,
    async_mkdir,
    async_mkstemp,
    async_realpath,
    async_stat,
    async_unlink,
    async_write_bytes,
)


@dataclass(frozen=True, slots=True)
class BrowserSavedScreenshot:
    file_path: Path
    workspace_path: str
    format: str
    scale: float
    width: int
    height: int
    quality: int | None
    file_size: int
    uses_artifact_defaults: bool


@dataclass(frozen=True, slots=True)
class _EncodedScreenshot:
    content: bytes
    width: int
    height: int
    scale: float


class BrowserFileAdapter:
    _SUPPORTED_OUTPUT_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}

    @staticmethod
    @asynccontextmanager
    async def temporary_png(image: bytes) -> AsyncIterator[str]:
        """为只接受文件路径的视觉能力短暂提供原始 PNG。"""
        temp_dir = Path(tempfile.gettempdir()) / "super-magic" / "browser-visual"
        await async_mkdir(temp_dir, parents=True, exist_ok=True)
        fd, file_path = await async_mkstemp(suffix=".png", prefix="browser-", dir=temp_dir)
        await async_close_fd(fd)
        try:
            await async_write_bytes(file_path, image)
            yield file_path
        finally:
            await async_unlink(file_path)

    @staticmethod
    @asynccontextmanager
    async def temporary_image(image: bytes) -> AsyncIterator[str]:
        """将视觉分析截图编码为高质量 WebP，并在调用结束后清理临时文件。"""
        temp_dir = Path(tempfile.gettempdir()) / "super-magic" / "browser-visual"
        await async_mkdir(temp_dir, parents=True, exist_ok=True)
        fd, file_path = await async_mkstemp(suffix=".webp", prefix="browser-", dir=temp_dir)
        await async_close_fd(fd)
        try:
            encoded = await asyncio.to_thread(BrowserFileAdapter._encode_visual_webp, image)
            await async_write_bytes(file_path, encoded)
            yield file_path
        finally:
            await async_unlink(file_path)

    @staticmethod
    def _encode_visual_webp(image: bytes) -> bytes:
        with Image.open(io.BytesIO(image)) as source:
            output = io.BytesIO()
            source.convert("RGB").save(output, format="WEBP", quality=90, method=6)
            return output.getvalue()

    @classmethod
    async def resolve_workspace_output_path(
        cls,
        workspace_dir: str,
        output_path: str,
    ) -> tuple[Path, str]:
        workspace = await async_realpath(workspace_dir, strict=True)
        candidate = Path(output_path)
        if not candidate.is_absolute():
            candidate = workspace / candidate
        candidate = await async_realpath(candidate, strict=False)
        if os.path.commonpath((workspace, candidate)) != str(workspace):
            raise ValueError("Screenshot output_path must be inside the current workspace")
        if candidate.suffix.lower() not in cls._SUPPORTED_OUTPUT_SUFFIXES:
            raise ValueError("Screenshot output_path must end with .webp, .jpg, .jpeg, or .png")
        return candidate, candidate.relative_to(workspace).as_posix()

    @classmethod
    async def save_workspace_screenshot(
        cls,
        image: bytes,
        *,
        file_path: Path,
        workspace_path: str,
        scale: float | None,
        quality: int | None,
        default_width: int,
        default_height: int,
        default_quality: int,
    ) -> BrowserSavedScreenshot:
        suffix = file_path.suffix.lower()
        if suffix == ".png":
            if quality is not None:
                raise ValueError("quality is only valid for WebP or JPEG screenshot output")
            image_format = "png"
            effective_quality = None
        else:
            effective_quality = quality if quality is not None else default_quality
            image_format = "webp" if suffix == ".webp" else "jpeg"
        encoded = await asyncio.to_thread(
            cls._encode,
            image,
            image_format,
            scale,
            effective_quality,
            default_width,
            default_height,
        )
        await async_write_bytes(file_path, encoded.content)
        file_size = (await async_stat(file_path)).st_size
        return BrowserSavedScreenshot(
            file_path=file_path,
            workspace_path=workspace_path,
            format=image_format,
            scale=encoded.scale,
            width=encoded.width,
            height=encoded.height,
            quality=effective_quality,
            file_size=file_size,
            uses_artifact_defaults=scale is None and quality is None,
        )

    @staticmethod
    def _encode(
        image: bytes,
        image_format: str,
        scale: float | None,
        quality: int | None,
        default_width: int,
        default_height: int,
    ) -> _EncodedScreenshot:
        with Image.open(io.BytesIO(image)) as source:
            if scale is None:
                width = default_width
                height = default_height
                effective_scale = min(width / source.width, height / source.height)
            else:
                width = max(1, round(source.width * scale))
                height = max(1, round(source.height * scale))
                effective_scale = scale
            if (width, height) == source.size and image_format == "png":
                return _EncodedScreenshot(
                    content=image,
                    width=source.width,
                    height=source.height,
                    scale=effective_scale,
                )

            rendered = source
            if rendered.size != (width, height):
                rendered = rendered.resize((width, height), Image.Resampling.LANCZOS)

            output = io.BytesIO()
            if image_format == "png":
                rendered.save(output, format="PNG", optimize=True)
            else:
                if quality is None:
                    raise ValueError("quality is required for WebP or JPEG screenshot output")
                save_options: dict[str, int | bool] = {"quality": quality, "optimize": True}
                if image_format == "webp":
                    save_options["method"] = 6
                rendered.convert("RGB").save(
                    output,
                    format=image_format.upper(),
                    **save_options,
                )
            return _EncodedScreenshot(
                content=output.getvalue(),
                width=width,
                height=height,
                scale=effective_scale,
            )
