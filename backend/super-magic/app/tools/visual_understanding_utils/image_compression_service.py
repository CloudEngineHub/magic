"""图片临时压缩与 Base64 编码服务。"""

from __future__ import annotations

import asyncio
import base64
import io
import mimetypes
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.utils.async_file_utils import async_mkdir, async_read_bytes

logger = get_logger(__name__)

WEBP_BASE64_QUALITY = 90
WEBP_BASE64_MAX_DIMENSION = 1920
WEBP_BASE64_MAX_SIZE_BYTES = 512 * 1024


@dataclass(frozen=True)
class WebPCompressionResult:
    """WebP 压缩结果，记录输出文件和图片元数据。"""

    output_path: Path
    width: int
    height: int
    output_size: int


def _build_data_url(content_type: str, content: bytes) -> str:
    """将文件内容编码为带 MIME 前缀的 Data URL。"""
    encoded = base64.b64encode(content).decode("utf-8")
    return f"data:{content_type};base64,{encoded}"


def _data_url_size(content_type: str, content: bytes) -> int:
    """计算 Data URL 的 UTF-8 字节大小。"""
    encoded_size = 4 * ((len(content) + 2) // 3)
    prefix_size = len(f"data:{content_type};base64,".encode("utf-8"))
    return prefix_size + encoded_size


def _quality_candidates(quality: int) -> list[int]:
    """生成从首选质量到最低质量的有序候选值。"""
    candidates = [quality, 80, 70, 60, 50, 40, 30, 20, 10, 1]
    return list(dict.fromkeys(value for value in candidates if value <= quality))


def _resize_for_max_dimension(image: Image.Image, max_dimension: int) -> Image.Image:
    """复制并按最大边长缩放图片。"""
    resized = image.copy()
    if max_dimension and max(resized.size) > max_dimension:
        resized.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    return resized


def _compress_webp_sync(
    file_content: bytes,
    quality: int,
    max_dimension: int,
    max_size_bytes: int,
) -> tuple[bytes, int, int]:
    """在工作线程中完成图片解码、压缩和大小限制。"""
    with Image.open(io.BytesIO(file_content)) as source_image:
        original_width, original_height = source_image.size

        # 动图原生视觉只使用第一帧，避免把动画容器传给静态图片接口。
        if getattr(source_image, "is_animated", False):
            source_image.seek(0)

        image = ImageOps.exif_transpose(source_image)
        if image is source_image:
            image = source_image.copy()
        else:
            image.load()

        # WebP 支持透明通道；其余模式统一转 RGB，避免保存阶段出现模式错误。
        if image.mode in ("RGBA", "LA", "PA"):
            image = image.convert("RGBA")
        elif image.mode != "RGB":
            image = image.convert("RGB")

        initial_image = _resize_for_max_dimension(image, max_dimension)

        def encode_webp(candidate: Image.Image, webp_quality: int) -> bytes:
            """将候选图片编码为 WebP 二进制内容。"""
            output = io.BytesIO()
            candidate.save(output, format="WEBP", quality=webp_quality, method=6)
            return output.getvalue()

        # 先降低质量，再缩小尺寸，尽量保留图片尺寸和清晰度。
        dimension = max(initial_image.size)
        while dimension >= 1:
            candidate_image = _resize_for_max_dimension(initial_image, dimension)
            for candidate_quality in _quality_candidates(quality):
                candidate_content = encode_webp(candidate_image, candidate_quality)
                if _data_url_size("image/webp", candidate_content) <= max_size_bytes:
                    return candidate_content, int(candidate_image.width), int(candidate_image.height)

            if dimension == 1:
                break
            dimension = max(1, int(dimension * 0.8))

        raise ValueError(f"image cannot be compressed below {max_size_bytes} bytes")


class ImageCompressionService:
    """负责在非工作区目录完成图片 WebP 压缩和 Base64 编码。"""

    def __init__(self, workspace_dir: str | Path | None = None) -> None:
        """初始化服务，可显式传入工作区路径以便测试或多工作区场景使用。"""
        if workspace_dir is not None:
            self.workspace_dir = Path(workspace_dir).expanduser().resolve()
            return

        try:
            self.workspace_dir = Path(PathManager.get_workspace_dir()).resolve()
        except RuntimeError:
            self.workspace_dir = None

    def is_workspace_file(self, file_path: str | Path) -> bool:
        """判断路径是否位于工作区内。"""
        if self.workspace_dir is None:
            return False
        try:
            Path(file_path).expanduser().resolve().relative_to(self.workspace_dir)
            return True
        except ValueError:
            return False

    async def compress_to_webp(
        self,
        file_path: str | Path,
        output_dir: str | Path,
        *,
        quality: int = WEBP_BASE64_QUALITY,
        max_dimension: int = WEBP_BASE64_MAX_DIMENSION,
        max_size_bytes: int = WEBP_BASE64_MAX_SIZE_BYTES,
    ) -> WebPCompressionResult:
        """将图片压缩为 WebP 文件，并写入指定的非工作区目录。"""
        if not 1 <= quality <= 100:
            raise ValueError("quality must be between 1 and 100")
        if max_dimension < 0:
            raise ValueError("max_dimension must be non-negative")
        if max_size_bytes <= 0:
            raise ValueError("max_size_bytes must be positive")

        source_path = Path(file_path).expanduser().resolve()
        target_dir = Path(output_dir).expanduser().resolve()
        source_in_workspace = self.is_workspace_file(source_path)
        target_in_workspace = self.is_workspace_file(target_dir)
        started_at = time.monotonic()
        logger.info(
            f"开始压缩图片: source={source_path} source_in_workspace={source_in_workspace} "
            f"output_dir={target_dir} quality={quality} max_dimension={max_dimension} "
            f"max_data_url_size={max_size_bytes}"
        )
        if target_in_workspace:
            raise ValueError("image processing output must be outside the workspace")
        await async_mkdir(target_dir, parents=True, exist_ok=True)

        staging_path: Path | None = None
        processing_path = source_path
        try:
            if source_in_workspace:
                staging_path = target_dir / f".source_{uuid.uuid4().hex}{source_path.suffix}"
                await asyncio.to_thread(shutil.copy2, source_path, staging_path)
                processing_path = staging_path
                logger.info(f"工作区图片已复制到临时目录: source={source_path} staging={staging_path}")

            file_content = await async_read_bytes(str(processing_path))
            compressed_content, width, height = await asyncio.to_thread(
                _compress_webp_sync,
                file_content,
                quality,
                max_dimension,
                max_size_bytes,
            )
            output_path = target_dir / f"{source_path.stem}_{uuid.uuid4().hex}.webp"
            await asyncio.to_thread(output_path.write_bytes, compressed_content)
            data_url_size = _data_url_size("image/webp", compressed_content)
            logger.info(
                f"图片压缩完成: source={source_path} output={output_path} "
                f"source_size={len(file_content)} output_size={len(compressed_content)} "
                f"data_url_size={data_url_size} dimensions={width}x{height} "
                f"elapsed_ms={(time.monotonic() - started_at) * 1000:.1f}"
            )
            return WebPCompressionResult(
                output_path=output_path,
                width=width,
                height=height,
                output_size=len(compressed_content),
            )
        except Exception:
            logger.exception(
                f"图片压缩失败: source={source_path} output_dir={target_dir} "
                f"elapsed_ms={(time.monotonic() - started_at) * 1000:.1f}"
            )
            raise
        finally:
            if staging_path is not None:
                await asyncio.to_thread(staging_path.unlink, missing_ok=True)

    async def file_to_base64(
        self,
        file_path: str | Path,
        content_type: str | None = None,
    ) -> str:
        """读取文件并生成 Base64 Data URL，不执行图片压缩。"""
        path = Path(file_path).expanduser().resolve()
        file_content = await async_read_bytes(str(path))
        mime_type = (content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream").split(";", 1)[0]
        return _build_data_url(mime_type, file_content)

    async def get_base64(
        self,
        file_path: str | Path,
        *,
        output_dir: str | Path | None = None,
        quality: int = WEBP_BASE64_QUALITY,
        max_dimension: int = WEBP_BASE64_MAX_DIMENSION,
        max_size_bytes: int = WEBP_BASE64_MAX_SIZE_BYTES,
    ) -> str:
        """压缩图片并返回最终 Base64；未指定目录时自动使用系统临时目录。"""
        started_at = time.monotonic()
        owns_output_dir = output_dir is None
        temporary_dir = Path(tempfile.mkdtemp(prefix="super_magic_image_")) if owns_output_dir else None
        target_dir = temporary_dir or Path(output_dir).expanduser().resolve()
        logger.info(
            f"开始生成图片 Base64: source={Path(file_path).expanduser().resolve()} "
            f"output_dir={target_dir} temporary_dir={owns_output_dir}"
        )
        try:
            result = await self.compress_to_webp(
                file_path,
                target_dir,
                quality=quality,
                max_dimension=max_dimension,
                max_size_bytes=max_size_bytes,
            )
            data_url = await self.file_to_base64(result.output_path, "image/webp")
            logger.info(
                f"图片 Base64 生成完成: source={Path(file_path).expanduser().resolve()} "
                f"output_size={result.output_size} data_url_size={len(data_url.encode('utf-8'))} "
                f"elapsed_ms={(time.monotonic() - started_at) * 1000:.1f}"
            )
            return data_url
        except Exception:
            logger.exception(
                f"图片 Base64 生成失败: source={Path(file_path).expanduser().resolve()} "
                f"elapsed_ms={(time.monotonic() - started_at) * 1000:.1f}"
            )
            raise
        finally:
            if temporary_dir is not None:
                await asyncio.to_thread(shutil.rmtree, temporary_dir, ignore_errors=True)
