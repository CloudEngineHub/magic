"""规范化聊天消息中的图片引用，并按模型能力渲染请求消息。"""

import asyncio
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

from PIL import Image

from agentlang.chat_history.chat_history_models import UserMessage
from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.tools.visual_understanding_utils.image_compression_service import (
    WEBP_BASE64_MAX_DIMENSION,
    WEBP_BASE64_MAX_SIZE_BYTES,
    WEBP_BASE64_QUALITY,
    ImageCompressionService,
)
from app.utils.async_file_utils import async_exists, async_stat

logger = get_logger(__name__)


@dataclass(frozen=True)
class _WorkspaceURLCacheEntry:
    """工作区图片 URL 缓存项，记录文件版本和保守过期时间。"""

    url: str
    file_signature: tuple[int, int]
    resize_percent: int | None
    expires_at: float


class WorkspaceImageURLResolver:
    """仅为工作区内文件生成可供模型访问的预签名 URL。"""

    ENV_NAME = "VISUAL_URL_MODE_ENABLED"
    URL_EXPIRES_IN = 3600
    URL_REFRESH_MARGIN = 60
    MAX_IMAGE_DIMENSION = 1920
    # URL 字符串本身占用较小；原生视觉不限制图片数量时适当扩大复用窗口。
    MAX_CACHE_ENTRIES = 256

    def __init__(
        self,
        workspace_dir: Path,
        enabled: bool | None = None,
        expires_in: int = URL_EXPIRES_IN,
        clock: Callable[[], float] | None = None,
    ) -> None:
        """初始化 URL 解析策略，并允许测试显式覆盖环境变量和时间。"""
        self.workspace_dir = workspace_dir.resolve()
        self.enabled = self._read_enabled_from_env() if enabled is None else enabled
        self.expires_in = max(1, expires_in)
        self._clock = clock or time.monotonic
        self._cache: dict[str, _WorkspaceURLCacheEntry] = {}
        self._inflight: dict[str, asyncio.Task[str | None]] = {}

    @classmethod
    def _read_enabled_from_env(cls) -> bool:
        """读取视觉 URL 模式开关，当前默认关闭以避免远端下载不可靠。"""
        return os.environ.get(cls.ENV_NAME, "false").strip().lower() == "true"

    def is_workspace_file(self, file_path: Path) -> bool:
        """判断解析后的文件路径是否严格位于当前工作区内。"""
        try:
            file_path.resolve().relative_to(self.workspace_dir)
            return True
        except ValueError:
            return False

    async def resolve(
        self,
        file_path: Path,
        file_signature: tuple[int, int] | None = None,
    ) -> str | None:
        """在有效期内复用工作区图片 URL，文件变化或临近过期时重新生成。"""
        if not self.enabled or not self.is_workspace_file(file_path):
            return None

        key = str(file_path.resolve())
        signature = file_signature or await self._read_file_signature(file_path)
        resize_percent = await self._resolve_resize_percent(file_path)
        now = self._clock()
        cached = self._cache.get(key)
        if (
            cached
            and cached.file_signature == signature
            and cached.resize_percent == resize_percent
            and now < cached.expires_at
        ):
            return cached.url

        inflight = self._inflight.get(key)
        if inflight is not None:
            return await inflight

        task = asyncio.create_task(
            self._generate_and_cache(key, file_path, signature, resize_percent)
        )
        self._inflight[key] = task
        try:
            return await task
        finally:
            # 仅清理当前 task，避免旧任务结束时误删同一 key 的新任务。
            if self._inflight.get(key) is task:
                del self._inflight[key]

    async def _read_file_signature(self, file_path: Path) -> tuple[int, int]:
        """读取文件版本标识，用于文件修改后自动使 URL 缓存失效。"""
        stat_result = await asyncio.to_thread(file_path.stat)
        return stat_result.st_mtime_ns, stat_result.st_size

    async def _generate_and_cache(
        self,
        key: str,
        file_path: Path,
        file_signature: tuple[int, int],
        resize_percent: int | None,
    ) -> str | None:
        """生成预签名 URL，并以安全余量写入进程内缓存。"""
        try:
            from app.service.file_service import FileService

            options = {"resize": resize_percent} if resize_percent is not None else None
            url = await FileService().get_workspace_file_url(
                file_path,
                expires_in=self.expires_in,
                options=options,
            )
            if not url:
                return None
            self._cache[key] = _WorkspaceURLCacheEntry(
                url=url,
                file_signature=file_signature,
                resize_percent=resize_percent,
                expires_at=self._clock() + max(1, self.expires_in - self.URL_REFRESH_MARGIN),
            )
            while len(self._cache) > self.MAX_CACHE_ENTRIES:
                oldest_key = next(iter(self._cache))
                self._cache.pop(oldest_key, None)
            return url
        except Exception as exc:
            logger.warning("工作区图片 URL 生成失败，回退 base64: path=%s error=%s", file_path, exc)
            return None

    async def _resolve_resize_percent(self, file_path: Path) -> int | None:
        """根据图片最大边长计算工作区 URL 所需的缩放百分比。"""
        try:
            width, height = await asyncio.to_thread(self._read_image_dimensions, file_path)
        except Exception as exc:
            logger.debug("读取图片尺寸失败，不附加 URL 缩放参数: path=%s error=%s", file_path, exc)
            return None

        max_dimension = max(width, height)
        if max_dimension <= self.MAX_IMAGE_DIMENSION:
            return None

        resize_percent = math.floor(self.MAX_IMAGE_DIMENSION * 100 / max_dimension)
        return max(1, min(100, resize_percent))

    @staticmethod
    def _read_image_dimensions(file_path: Path) -> tuple[int, int]:
        """仅读取图片元数据中的宽高，不加载完整像素数据。"""
        with Image.open(file_path) as image:
            return image.size


class LLMMessageRenderer:
    """将规范化图片引用转换为当前模型可接受的请求消息。"""

    # -1 表示本期不限制原生视觉图片数量和请求图片总大小；限制逻辑仍保留，后续可直接恢复正数配置。
    MAX_NATIVE_IMAGE_REFS = -1
    MAX_NATIVE_IMAGE_BYTES = -1
    # base64 缓存位于 Python 堆内存，扩大后仍保持硬上限，避免长会话无限增长。
    MAX_CACHE_ENTRIES = 32
    MAX_CACHE_BYTES = 128 * 1024 * 1024

    def __init__(
        self,
        workspace_dir: str | Path | None = None,
        url_mode_enabled: bool | None = None,
        max_native_image_refs: int | None = None,
        max_native_image_bytes: int | None = None,
    ) -> None:
        """初始化消息渲染器及 WebP Base64 图片传输策略。"""
        self.workspace_dir = Path(workspace_dir or PathManager.get_workspace_dir()).resolve()
        self.max_native_image_refs = (
            self.MAX_NATIVE_IMAGE_REFS if max_native_image_refs is None else max_native_image_refs
        )
        self.max_native_image_bytes = (
            self.MAX_NATIVE_IMAGE_BYTES if max_native_image_bytes is None else max_native_image_bytes
        )
        self._image_compression_service = ImageCompressionService(workspace_dir=self.workspace_dir)
        # URL 解析器暂时不接入原生视觉；保留参数和实现，便于后续恢复时保持调用兼容。
        self._base64_cache: dict[tuple[str, int, int, int, int, int], str] = {}

    def _cache_data_url(self, key: tuple[str, int, int, int, int, int], data_url: str) -> None:
        """写入有界图片缓存，避免长会话持续保留大体积 base64。"""
        self._base64_cache[key] = data_url
        total_bytes = sum(len(value.encode("utf-8")) for value in self._base64_cache.values())
        while len(self._base64_cache) > self.MAX_CACHE_ENTRIES or total_bytes > self.MAX_CACHE_BYTES:
            oldest_key = next(iter(self._base64_cache))
            oldest = self._base64_cache.pop(oldest_key)
            total_bytes -= len(oldest.encode("utf-8"))

    async def render_messages(
        self,
        messages: Sequence[Any],
        *,
        supports_multimodal: bool,
    ) -> list[dict[str, Any]]:
        """生成请求副本，不修改 ChatHistory 中的消息对象。"""
        image_parts = [
            part
            for message in messages
            if isinstance(message, UserMessage)
            for part in (message.content_parts or [])
            if part.type == "image_ref"
        ]
        selected = self._select_native_image_parts(image_parts, supports_multimodal)
        used_bytes = 0
        rendered: list[dict[str, Any]] = []

        for message in messages:
            if not isinstance(message, UserMessage) or not message.content_parts:
                rendered.append(message.to_llm_dict())
                continue
            if not any(part.type == "image_ref" for part in message.content_parts):
                rendered.append(message.to_llm_dict())
                continue

            content: list[dict[str, Any]] = []
            native_only_text_indexes: set[int] = set()
            has_native_image = False
            for part in message.content_parts:
                if part.type == "text":
                    if part.text:
                        content.append({"type": "text", "text": part.text})
                        if not part.include_in_fallback:
                            native_only_text_indexes.add(len(content) - 1)
                    continue
                if part.type != "image_ref":
                    continue

                path = part.path or ""
                if id(part) not in selected:
                    content.append({"type": "text", "text": self._fallback_text(path, "outside the recent image window")})
                    continue

                image_url, error = await self._render_image(path)
                if error:
                    content.append({"type": "text", "text": self._fallback_text(path, error)})
                    continue
                if image_url is None:
                    content.append({"type": "text", "text": self._fallback_text(path, "image conversion failed")})
                    continue
                image_bytes = len(image_url.encode("utf-8"))
                if (
                    0 <= self.max_native_image_bytes < used_bytes + image_bytes
                ):
                    content.append({"type": "text", "text": self._fallback_text(path, "the request image budget was exceeded")})
                    continue
                used_bytes += image_bytes
                has_native_image = True
                content.append({"type": "image_url", "image_url": {"url": image_url}})

            if not has_native_image and native_only_text_indexes:
                content = [
                    item
                    for index, item in enumerate(content)
                    if index not in native_only_text_indexes
                ]
            if not content:
                content = [{"type": "text", "text": message.content or " "}]
            if all(item.get("type") == "text" for item in content):
                rendered.append({
                    "role": "user",
                    "content": "\n\n".join(item.get("text", "") for item in content),
                })
            else:
                rendered.append({"role": "user", "content": content})

        return rendered

    def _select_native_image_parts(
        self,
        image_parts: list[Any],
        supports_multimodal: bool,
    ) -> set[int]:
        """根据图片数量配置选择本次允许发送的图片；负数表示不限制。"""
        if not supports_multimodal or self.max_native_image_refs == 0:
            return set()
        if self.max_native_image_refs < 0:
            selected_parts = image_parts
        else:
            selected_parts = image_parts[-self.max_native_image_refs:]
        return {id(part) for part in selected_parts}

    async def _render_image(self, image_path: str) -> tuple[str | None, str | None]:
        """将图片在系统临时目录压缩为 WebP，再转换为 Base64。"""
        target, path_error = self._resolve_image_target(image_path)
        if path_error:
            return None, path_error
        if target is None:
            return None, "the image path is invalid"
        if not await async_exists(target):
            return None, "the image file was removed"
        try:
            stat_result = await async_stat(target)
            if stat_result.st_size <= 0:
                return None, "the image file is empty"

            cache_key = (
                str(target),
                stat_result.st_mtime_ns,
                stat_result.st_size,
                WEBP_BASE64_QUALITY,
                WEBP_BASE64_MAX_DIMENSION,
                WEBP_BASE64_MAX_SIZE_BYTES,
            )
            if cache_key in self._base64_cache:
                return self._base64_cache[cache_key], None
            data_url = await self._image_compression_service.get_base64(
                str(target),
            )
            self._cache_data_url(cache_key, data_url)
            return data_url, None
        except Exception as exc:
            logger.warning("原生视觉图片转换失败: path=%s reason=%s", image_path, exc)
            return None, "image conversion failed"

    def _resolve_image_target(self, image_path: str) -> tuple[Path | None, str | None]:
        """解析图片路径；允许外部绝对路径，拒绝相对路径逃逸工作区。"""
        if not image_path:
            return None, "the image path is invalid"
        raw_path = Path(image_path).expanduser()
        if raw_path.is_absolute():
            return raw_path.resolve(), None

        target = (self.workspace_dir / raw_path).resolve()
        try:
            target.relative_to(self.workspace_dir)
        except ValueError:
            return None, "the image path is outside the workspace"
        return target, None

    @staticmethod
    def _fallback_text(path: str, reason: str) -> str:
        """构造图片未发送时的文本降级提示。"""
        return (
            f"The image was not sent as native visual input ({reason}).\n"
            f"Image path: {path}\n"
            "If the image is still needed, call visual_understanding."
        )


__all__ = ["LLMMessageRenderer", "WorkspaceImageURLResolver"]
