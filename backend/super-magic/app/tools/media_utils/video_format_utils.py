"""视频格式前置校验工具。"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from app.utils.async_file_utils import async_exists, async_read_bytes

# 视频文件扩展名到 MIME 类型的映射。
VIDEO_MIME_MAP: dict[str, str] = {
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "mov": "video/quicktime",
    "avi": "video/x-msvideo",
    "wmv": "video/x-ms-wmv",
    "flv": "video/x-flv",
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "ts": "video/mp2t",
    "m3u8": "application/x-mpegURL",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    "ogv": "video/ogg",
    "mpeg": "video/mpeg",
    "mpg": "video/mpeg",
}

SUPPORTED_VIDEO_EXTENSIONS = frozenset(VIDEO_MIME_MAP.keys())
KNOWN_NON_VIDEO_EXTENSIONS = frozenset({
    "aac", "avif", "bmp", "bz2", "csv", "doc", "docx", "flac", "gif", "gz", "heic",
    "heif", "htm", "html", "jpeg", "jpg", "json", "m4a", "md", "mp3", "ogg", "pdf",
    "png", "ppt", "pptx", "rar", "svg", "tar", "tif", "tiff", "txt", "wav", "webp",
    "wma", "xls", "xlsx", "zip", "7z",
})


@dataclass(frozen=True)
class VideoFormatCheckResult:
    """视频格式检查结果。"""

    ok: bool
    extension: Optional[str] = None
    error: Optional[str] = None


class VideoFormatGuard:
    """视频格式前置校验器。

    负责在生成预签名 URL、base64 或调用视频模型前筛掉明显非视频来源。
    """

    HTTP_URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)
    HEADER_READ_BYTES = 512
    FTYP_VIDEO_BRANDS = {
        b"3g2a", b"3g2b", b"3g2c", b"3ge6", b"3ge7", b"3gg6", b"3gp1", b"3gp2",
        b"3gp3", b"3gp4", b"3gp5", b"3gp6", b"3gp7", b"avc1", b"dash", b"isom",
        b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mmp4", b"mp41", b"mp42",
        b"MSNV", b"M4V ", b"qt  ",
    }
    ASF_HEADER = b"\x30\x26\xb2\x75\x8e\x66\xcf\x11\xa6\xd9\x00\xaa\x00\x62\xce\x6c"

    @classmethod
    async def validate_source(cls, source: str) -> VideoFormatCheckResult:
        """校验视频来源是否适合继续进入视频理解链路。"""
        normalized_source = source.strip()
        if not normalized_source:
            return VideoFormatCheckResult(
                ok=False,
                error="VIDEO SOURCE IS EMPTY: Provide a valid video file path or video URL.",
            )

        extension = cls.extract_extension(normalized_source)
        if cls.is_http_url(normalized_source):
            if extension and extension in KNOWN_NON_VIDEO_EXTENSIONS:
                return cls._unsupported_result(normalized_source, extension)
            return VideoFormatCheckResult(ok=True, extension=extension)

        if not await async_exists(normalized_source):
            return VideoFormatCheckResult(
                ok=False,
                extension=extension,
                error=f"Local video file not found: {normalized_source}",
            )

        if extension and cls.is_supported_extension(extension):
            return VideoFormatCheckResult(ok=True, extension=extension)

        try:
            header = await async_read_bytes(normalized_source, size=cls.HEADER_READ_BYTES)
        except Exception as exc:
            return VideoFormatCheckResult(
                ok=False,
                extension=extension,
                error=f"Failed to read video file for format validation: {exc}",
            )

        if cls.has_video_signature(header):
            return VideoFormatCheckResult(ok=True, extension=extension)

        return cls._unsupported_result(normalized_source, extension)

    @classmethod
    def is_http_url(cls, source: str) -> bool:
        """判断来源是否为 HTTP/HTTPS URL。"""
        return bool(cls.HTTP_URL_PATTERN.match(source))

    @classmethod
    def extract_extension(cls, source: str) -> Optional[str]:
        """从本地路径或 URL 路径中提取小写扩展名。"""
        if cls.is_http_url(source):
            path = unquote(urlparse(source).path)
        else:
            path = source
        suffix = Path(path).suffix.lower().lstrip(".")
        return suffix or None

    @classmethod
    def is_supported_extension(cls, extension: str) -> bool:
        """判断扩展名是否属于当前支持的视频格式。"""
        return extension.lower().lstrip(".") in SUPPORTED_VIDEO_EXTENSIONS

    @classmethod
    def has_video_signature(cls, header: bytes) -> bool:
        """基于文件头识别常见视频容器格式。"""
        if not header:
            return False
        if header.startswith(b"FLV"):
            return True
        if header.startswith(b"\x1a\x45\xdf\xa3"):
            return True
        if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"AVI ":
            return True
        if header.startswith(cls.ASF_HEADER):
            return True
        if header.startswith(b"\x00\x00\x01\xba") or header.startswith(b"\x00\x00\x01\xb3"):
            return True
        if cls._has_mp4_video_brand(header):
            return True
        if cls._has_mpeg_ts_sync_byte(header):
            return True
        return False

    @classmethod
    def build_unsupported_error(cls, source: str, extension: Optional[str]) -> str:
        """构建给模型读取的非视频格式错误。"""
        source_name = cls.get_source_name(source)
        format_text = f".{extension}" if extension else "an unknown or unsupported format"
        supported_text = ", ".join(f".{ext}" for ext in sorted(SUPPORTED_VIDEO_EXTENSIONS))
        return (
            f"UNSUPPORTED VIDEO FORMAT: {source_name} uses {format_text}. "
            f"video_understanding only accepts video files ({supported_text}). "
            "For presentations, documents, spreadsheets, images, or audio files, use the matching "
            "document, slide, image, or audio workflow instead of retrying video_understanding."
        )

    @classmethod
    def get_source_name(cls, source: str) -> str:
        """提取用于错误文案展示的来源名称。"""
        if cls.is_http_url(source):
            path = unquote(urlparse(source).path)
            name = Path(path).name
            return name or source
        return source

    @classmethod
    def _unsupported_result(
        cls,
        source: str,
        extension: Optional[str],
    ) -> VideoFormatCheckResult:
        """构建非视频格式检查结果。"""
        return VideoFormatCheckResult(
            ok=False,
            extension=extension,
            error=cls.build_unsupported_error(source, extension),
        )

    @classmethod
    def _has_mp4_video_brand(cls, header: bytes) -> bool:
        """识别 MP4/MOV/3GP 等 ftyp 容器中的视频品牌。"""
        if len(header) < 12 or header[4:8] != b"ftyp":
            return False

        brands = {header[8:12]}
        compatible = header[16:64]
        for index in range(0, len(compatible) - 3, 4):
            brands.add(compatible[index:index + 4])
        return any(brand in cls.FTYP_VIDEO_BRANDS for brand in brands)

    @classmethod
    def _has_mpeg_ts_sync_byte(cls, header: bytes) -> bool:
        """识别 MPEG-TS 常见的同步字节布局。"""
        return len(header) > 376 and header[0] == 0x47 and header[188] == 0x47 and header[376] == 0x47


def get_video_mime_type(file_path: str) -> Optional[str]:
    """根据视频扩展名获取 MIME 类型。"""
    extension = VideoFormatGuard.extract_extension(file_path)
    if not extension:
        return None
    return VIDEO_MIME_MAP.get(extension)
