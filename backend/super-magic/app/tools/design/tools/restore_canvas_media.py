"""恢复画布媒体图层工具。

该工具扫描设计项目本地的 images/videos 目录，将仍在磁盘但已从
magic.project.js 中丢失的媒体文件重新注册为画布元素。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, TypedDict

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.design.constants import DEFAULT_ELEMENT_HEIGHT, DEFAULT_ELEMENT_WIDTH
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.tools.base_design_tool import BaseDesignTool
from app.tools.design.utils.canvas_image_utils import get_image_dimensions
from app.tools.design.utils.canvas_layout_utils import calculate_next_element_position
from app.tools.design.utils.magic_project_design_parser import (
    CanvasConfig,
    CanvasElement,
    ImageElement,
    MagicProjectConfig,
    VideoElement,
    ViewportState,
    flatten_all_elements,
)
from app.utils.async_file_utils import async_is_dir, async_is_file, async_scandir

logger = get_logger(__name__)

MediaType = Literal["image", "video"]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}
POSTER_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
DEFAULT_VIDEO_WIDTH = 1280.0
DEFAULT_VIDEO_HEIGHT = 720.0


class RestoreCanvasMediaParams(BaseToolParams):
    """restore_canvas_media 工具参数。"""

    project_path: str = Field(
        ...,
        description="""<!--zh: 设计项目的相对路径（包含 magic.project.js 的文件夹）。-->
Relative path to the design project folder containing magic.project.js."""
    )
    dry_run: bool = Field(
        True,
        description="""<!--zh: 默认为 true，只扫描并返回将恢复的媒体，不写入 magic.project.js。用户确认后传 false 才会真正恢复。-->
Defaults to true. Only scan and report recoverable media without writing magic.project.js. Pass false only after user confirmation."""
    )


@dataclass(frozen=True)
class CanvasMediaFile:
    """画布项目中的本地媒体文件描述。"""

    media_type: MediaType
    file_path: Path
    project_relative_path: str
    src: str
    poster_src: Optional[str] = None
    poster_path: Optional[Path] = None


@dataclass(frozen=True)
class RestoredMediaElement:
    """单个恢复结果的轻量摘要。"""

    id: str
    name: str
    media_type: MediaType
    src: str
    x: float
    y: float
    width: float
    height: float


class RestoreMediaTransactionResult(TypedDict):
    """恢复媒体写事务的返回结果。"""

    scanned: List[CanvasMediaFile]
    missing: List[CanvasMediaFile]
    restored: List[RestoredMediaElement]


class CanvasMediaScanner:
    """扫描画布项目本地媒体目录。"""

    def __init__(self, project_path: Path) -> None:
        """初始化扫描器。"""
        self.project_path = project_path

    async def scan(self) -> List[CanvasMediaFile]:
        """扫描 images 和 videos 目录中的本地媒体文件。"""
        results: List[CanvasMediaFile] = []
        results.extend(await self._scan_images())
        results.extend(await self._scan_videos())
        return sorted(results, key=lambda item: (item.media_type, item.project_relative_path))

    async def _scan_images(self) -> List[CanvasMediaFile]:
        """扫描 images 目录中的图片文件。"""
        return [
            CanvasMediaFile(
                media_type="image",
                file_path=file_path,
                project_relative_path=self._to_project_relative(file_path),
                src=f"./{self._to_project_relative(file_path)}",
            )
            for file_path in await self._iter_media_files("images", IMAGE_EXTENSIONS)
        ]

    async def _scan_videos(self) -> List[CanvasMediaFile]:
        """扫描 videos 目录中的视频文件，并尝试匹配封面图。"""
        results: List[CanvasMediaFile] = []
        for file_path in await self._iter_media_files("videos", VIDEO_EXTENSIONS):
            poster_path = await self._find_video_poster(file_path)
            poster_src = f"./{self._to_project_relative(poster_path)}" if poster_path else None
            results.append(
                CanvasMediaFile(
                    media_type="video",
                    file_path=file_path,
                    project_relative_path=self._to_project_relative(file_path),
                    src=f"./{self._to_project_relative(file_path)}",
                    poster_src=poster_src,
                    poster_path=poster_path,
                )
            )
        return results

    async def _iter_media_files(self, directory_name: str, extensions: Set[str]) -> List[Path]:
        """遍历指定媒体目录下匹配扩展名的文件。"""
        media_dir = self.project_path / directory_name
        if not await async_is_dir(media_dir):
            return []
        return [
            Path(entry.path)
            for entry in await async_scandir(media_dir)
            if entry.is_file() and Path(entry.path).suffix.lower() in extensions
        ]

    async def _find_video_poster(self, video_path: Path) -> Optional[Path]:
        """根据视频文件名查找同名封面图。"""
        candidates: List[Path] = []
        for extension in POSTER_EXTENSIONS:
            candidates.append(video_path.with_suffix(extension))
            candidates.append(self.project_path / "posters" / f"{video_path.stem}{extension}")
        for candidate in candidates:
            if await async_is_file(candidate):
                return candidate
        return None

    def _to_project_relative(self, file_path: Path) -> str:
        """将文件路径转换为项目相对路径。"""
        return file_path.relative_to(self.project_path).as_posix()


class CanvasMediaRegistry:
    """读取当前画布中已注册的媒体资源。"""

    def __init__(self, project_path: str) -> None:
        """初始化媒体注册表。"""
        self.project_path = project_path.strip("/")

    def collect_existing_sources(self, config: MagicProjectConfig) -> Set[str]:
        """收集当前配置中已存在的 image/video src。"""
        sources: Set[str] = set()
        for element in flatten_all_elements(config):
            src = getattr(element, "src", None)
            if isinstance(src, str) and src.strip():
                sources.add(self.normalize_src(src))
        return sources

    def normalize_src(self, src: str) -> str:
        """将不同历史格式的媒体路径归一为项目相对路径。"""
        normalized = src.strip()
        if "://" in normalized or normalized.startswith("data:"):
            return normalized
        normalized = normalized.replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        normalized = normalized.lstrip("/")

        if self.project_path and normalized.startswith(f"{self.project_path}/"):
            normalized = normalized[len(self.project_path) + 1:]

        parts = normalized.split("/")
        for media_dir in ("images", "videos"):
            if media_dir in parts:
                index = parts.index(media_dir)
                return "/".join(parts[index:])

        return normalized


class CanvasMediaElementFactory:
    """将本地媒体文件构建为画布元素。"""

    def __init__(self) -> None:
        """初始化元素工厂。"""

    async def create_element(
        self,
        media_file: CanvasMediaFile,
        element_id: str,
        x: float,
        y: float,
        z_index: int,
    ) -> Tuple[CanvasElement, RestoredMediaElement]:
        """根据媒体文件创建对应的画布元素与摘要。"""
        width, height = await self.resolve_display_size(media_file)
        name = media_file.file_path.stem
        common: Dict[str, Any] = {
            "id": element_id,
            "name": name,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "zIndex": z_index,
            "visible": True,
            "locked": False,
            "status": "completed",
        }
        if media_file.media_type == "image":
            element: CanvasElement = ImageElement(type="image", src=media_file.src, **common)
        else:
            element = VideoElement(
                type="video",
                src=media_file.src,
                poster=media_file.poster_src,
                **common,
            )

        element._absolute_x = x
        element._absolute_y = y
        restored = RestoredMediaElement(
            id=element_id,
            name=name,
            media_type=media_file.media_type,
            src=media_file.src,
            x=x,
            y=y,
            width=width,
            height=height,
        )
        return element, restored

    async def resolve_display_size(self, media_file: CanvasMediaFile) -> Tuple[float, float]:
        """读取媒体展示尺寸。"""
        width: float
        height: float
        if media_file.media_type == "image":
            width, height = await self._read_image_size_or_default(media_file.file_path)
        else:
            width, height = await self._read_video_size_or_default(media_file)
        return width, height

    async def _read_image_size_or_default(self, image_path: Path) -> Tuple[float, float]:
        """读取图片尺寸，失败时返回默认元素尺寸。"""
        try:
            width, height = await get_image_dimensions(image_path)
            return float(width), float(height)
        except Exception as error:  # noqa: BLE001
            logger.warning("Failed to read media dimensions for %s: %s", image_path, error)
            return DEFAULT_ELEMENT_WIDTH, DEFAULT_ELEMENT_HEIGHT

    async def _read_video_size_or_default(self, media_file: CanvasMediaFile) -> Tuple[float, float]:
        """读取视频原始尺寸，失败时使用封面或默认视频尺寸。"""
        try:
            from moviepy import VideoFileClip
        except ImportError:
            VideoFileClip = None

        if VideoFileClip is not None:
            try:
                import asyncio

                def _read_video_size() -> Tuple[float, float]:
                    """同步读取视频尺寸，供 asyncio.to_thread 调用。"""
                    with VideoFileClip(str(media_file.file_path)) as clip:
                        width, height = clip.size
                        return float(width), float(height)

                return await asyncio.to_thread(_read_video_size)
            except Exception as error:  # noqa: BLE001
                logger.warning("Failed to read video dimensions for %s: %s", media_file.file_path, error)

        if media_file.poster_path:
            return await self._read_image_size_or_default(media_file.poster_path)
        return DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT


@tool()
class RestoreCanvasMedia(BaseDesignTool[RestoreCanvasMediaParams]):
    """从本地媒体目录恢复画布图层。

    工具只扫描 super-magic 画布项目自身的 images/videos 目录，并将当前
    magic.project.js 中缺失的媒体资源恢复为 image/video 元素。
    """

    async def execute(self, tool_context: ToolContext, params: RestoreCanvasMediaParams) -> ToolResult:
        """执行画布媒体恢复。"""
        project_path, error_result = await self._ensure_project_ready(
            params.project_path,
            require_magic_project_js=True,
        )
        if error_result:
            return error_result

        scanner = CanvasMediaScanner(project_path)
        scanned_media = await scanner.scan()
        registry = CanvasMediaRegistry(params.project_path)
        manager = await get_canvas_manager(str(project_path))
        config_file = self._get_magic_project_js_path(project_path)

        current_config = await manager.read_current_canvas()
        preview_existing_sources = registry.collect_existing_sources(current_config)
        preview_missing_media = [
            item
            for item in scanned_media
            if registry.normalize_src(item.src) not in preview_existing_sources
        ]

        if params.dry_run:
            return self._build_tool_result(
                params,
                {
                    "scanned": scanned_media,
                    "missing": preview_missing_media,
                    "restored": [],
                },
            )

        if not preview_missing_media:
            return self._build_tool_result(
                params,
                {
                    "scanned": scanned_media,
                    "missing": [],
                    "restored": [],
                },
            )

        async def restore_missing(config: MagicProjectConfig) -> RestoreMediaTransactionResult:
            """在写事务中补齐缺失的媒体元素。"""
            if config.canvas is None:
                config.canvas = CanvasConfig(
                    viewport=ViewportState(scale=1.0, x=0, y=0),
                    elements=[],
                )

            transaction_existing_sources = registry.collect_existing_sources(config)
            media_to_restore = [
                item
                for item in scanned_media
                if registry.normalize_src(item.src) not in transaction_existing_sources
            ]

            factory = CanvasMediaElementFactory()
            restored: List[RestoredMediaElement] = []
            z_indices = [
                element.zIndex
                for element in flatten_all_elements(config)
                if element.zIndex is not None
            ]
            next_z_index = (max(z_indices) + 1) if z_indices else 1

            for media_file in media_to_restore:
                width_hint, height_hint = await factory.resolve_display_size(media_file)
                x, y = calculate_next_element_position(
                    config,
                    width_hint,
                    height_hint,
                    max_elements_per_row=4,
                )
                element_id = manager.generate_element_id()
                element, restored_item = await factory.create_element(
                    media_file,
                    element_id,
                    x,
                    y,
                    next_z_index,
                )
                await manager.add_element(element, config=config)
                restored.append(restored_item)
                transaction_existing_sources.add(registry.normalize_src(media_file.src))
                next_z_index += 1

            return {
                "scanned": scanned_media,
                "missing": media_to_restore,
                "restored": restored,
            }

        def verify_restored(
            verified_config: MagicProjectConfig,
            result: RestoreMediaTransactionResult,
        ) -> bool:
            """校验本次恢复的媒体 src 已写入最新配置。"""
            expected = {
                registry.normalize_src(item.src)
                for item in result["restored"]
            }
            if not expected:
                return True
            actual = registry.collect_existing_sources(verified_config)
            return expected.issubset(actual)

        transaction_result = await manager.run_write_transaction(
            restore_missing,
            verify_content=verify_restored,
            before_write=lambda: self._dispatch_file_event(
                tool_context, str(config_file), EventType.BEFORE_FILE_UPDATED
            ),
            after_write=lambda _: self._dispatch_file_event(
                tool_context, str(config_file), EventType.FILE_UPDATED
            ),
        )

        return self._build_tool_result(params, transaction_result)

    def _build_tool_result(
        self,
        params: RestoreCanvasMediaParams,
        transaction_result: RestoreMediaTransactionResult,
    ) -> ToolResult:
        """构建工具返回结果。"""
        scanned: List[CanvasMediaFile] = transaction_result["scanned"]
        missing: List[CanvasMediaFile] = transaction_result["missing"]
        restored: List[RestoredMediaElement] = transaction_result["restored"]
        if params.dry_run:
            lines = [
                "Canvas media restore preview completed.",
                f"- Project: {params.project_path}",
                f"- Scanned: {len(scanned)} media file(s)",
                f"- Missing from canvas: {len(missing)} media file(s)",
                f"- Would restore: {len(missing)} media element(s)",
                "- Next step: show this preview to the user and ask for confirmation. Do not call dry_run=false unless the user confirms.",
            ]
        else:
            lines = [
                "Canvas media restore completed.",
                f"- Project: {params.project_path}",
                f"- Scanned: {len(scanned)} media file(s)",
                f"- Missing from canvas: {len(missing)} media file(s)",
                f"- Restored: {len(restored)} media element(s)",
            ]

        display_items = restored if not params.dry_run else [
            RestoredMediaElement(
                id="",
                name=item.file_path.stem,
                media_type=item.media_type,
                src=item.src,
                x=0,
                y=0,
                width=0,
                height=0,
            )
            for item in missing
        ]
        if display_items:
            lines.append("")
            lines.append("Media:")
            for item in display_items:
                id_part = f", id: {item.id}" if item.id else ""
                lines.append(f"- {item.media_type}: {item.name} ({item.src}{id_part})")

        restored_elements = [self._restored_element_to_dict(item) for item in restored]

        return ToolResult(
            content="\n".join(lines),
            data={
                "project_path": params.project_path,
                "dry_run": params.dry_run,
                "scanned_count": len(scanned),
                "missing_count": len(missing),
                "restored_count": len(restored) if not params.dry_run else 0,
                "missing_media": [
                    {
                        "type": item.media_type,
                        "src": item.src,
                        "poster": item.poster_src,
                    }
                    for item in missing
                ],
                "restored_elements": restored_elements,
            },
            extra_info={
                "project_path": params.project_path,
                "dry_run": params.dry_run,
                "scanned_count": len(scanned),
                "missing_count": len(missing),
                "restored_count": len(restored) if not params.dry_run else 0,
                "elements": restored_elements,
            },
        )

    def _restored_element_to_dict(self, item: RestoredMediaElement) -> Dict[str, Any]:
        """将恢复元素摘要转换为结构化字典。"""
        return {
            "id": item.id,
            "name": item.name,
            "type": item.media_type,
            "src": item.src,
            "x": item.x,
            "y": item.y,
            "width": item.width,
            "height": item.height,
        }

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        """获取工具执行后的展示备注。"""
        extra_info = result.extra_info or {}
        missing_count = int(extra_info.get("missing_count", 0) or 0)
        restored_count = int(extra_info.get("restored_count", 0) or 0)
        dry_run = bool(extra_info.get("dry_run", True))

        if dry_run:
            return i18n.translate(
                "restore_canvas_media.preview",
                category="tool.messages",
                missing_count=missing_count,
            )
        return i18n.translate(
            "restore_canvas_media.restored",
            category="tool.messages",
            restored_count=restored_count,
        )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Dict[str, Any] = None,
    ) -> Dict[str, str]:
        """获取工具调用前的友好动作与备注。"""
        args = arguments or {}
        project_path = args.get("project_path", "")
        dry_run = args.get("dry_run", True)
        action_code = "restore_canvas_media.preview" if dry_run else "restore_canvas_media.restore"
        return {
            "action": i18n.translate(action_code, category="tool.actions"),
            "remark": Path(project_path).name if project_path else "",
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict[str, str]:
        """获取工具调用后的友好动作与备注。"""
        if not result.ok:
            result.use_custom_remark = True
            return {
                "action": i18n.translate("restore_canvas_media.restore", category="tool.actions"),
                "remark": result.content or i18n.translate(
                    "restore_canvas_media.exception",
                    category="tool.messages",
                ),
            }

        args = arguments or {}
        dry_run = bool((result.extra_info or {}).get("dry_run", args.get("dry_run", True)))
        action_code = "restore_canvas_media.preview" if dry_run else "restore_canvas_media.restore"
        return {
            "action": i18n.translate(action_code, category="tool.actions"),
            "remark": self._get_remark_content(result, arguments),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Dict[str, Any] = None,
    ) -> Optional[ToolDetail]:
        """生成工具详情，用于前端展示 Markdown 恢复报告。"""
        if not result.ok:
            return None

        try:
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(
                    file_name="restore_canvas_media.md",
                    content=self._build_tool_detail_markdown(result),
                ),
            )
        except Exception as e:
            logger.error(f"生成恢复媒体工具详情失败: {e!s}")
            return None

    def _build_tool_detail_markdown(self, result: ToolResult) -> str:
        """构建恢复媒体工具详情的 Markdown 内容。"""
        data = result.data or {}
        extra_info = result.extra_info or {}
        project_path = data.get("project_path") or extra_info.get("project_path") or ""
        dry_run = bool(data.get("dry_run", extra_info.get("dry_run", True)))
        scanned_count = int(data.get("scanned_count", extra_info.get("scanned_count", 0)) or 0)
        missing_count = int(data.get("missing_count", extra_info.get("missing_count", 0)) or 0)
        restored_count = int(data.get("restored_count", extra_info.get("restored_count", 0)) or 0)
        title = "可恢复画布媒体预览" if dry_run else "画布媒体恢复结果"
        lines = [
            f"# {title}",
            "",
            f"- 项目: {project_path or '-'}",
            f"- 已扫描媒体: {scanned_count}",
            f"- 缺失媒体: {missing_count}",
            f"- 已恢复图层: {restored_count}",
        ]

        if dry_run:
            lines.extend([
                "- 状态: 等待用户确认，确认前不会写入 magic.project.js",
                "- 提醒: 恢复完成前请不要操作画布，避免前端编辑覆盖恢复结果",
                "",
            ])
            missing_media = data.get("missing_media") or []
            self._append_missing_media_markdown(lines, missing_media)
        else:
            lines.extend([
                "- 状态: 已写入 magic.project.js",
                "",
            ])
            restored_elements = data.get("restored_elements") or extra_info.get("elements") or []
            self._append_restored_elements_markdown(lines, restored_elements)

        return "\n".join(lines).strip()

    def _append_missing_media_markdown(self, lines: List[str], missing_media: List[Dict[str, Any]]) -> None:
        """追加 dry-run 阶段缺失媒体的 Markdown 表格。"""
        if not missing_media:
            lines.append("没有发现需要恢复的媒体。")
            return
        lines.extend([
            "## 待恢复媒体",
            "",
            "| 类型 | 路径 | 封面 |",
            "| --- | --- | --- |",
        ])
        for item in missing_media:
            lines.append(
                f"| {item.get('type', '-')} | {item.get('src', '-')} | {item.get('poster') or '-'} |"
            )

    def _append_restored_elements_markdown(self, lines: List[str], restored_elements: List[Dict[str, Any]]) -> None:
        """追加已恢复元素的 Markdown 表格。"""
        if not restored_elements:
            lines.append("没有新增恢复图层。")
            return
        lines.extend([
            "## 已恢复图层",
            "",
            "| 类型 | 名称 | 路径 | 尺寸 | 元素 ID |",
            "| --- | --- | --- | --- | --- |",
        ])
        for item in restored_elements:
            size = f"{item.get('width', 0)} x {item.get('height', 0)}"
            lines.append(
                f"| {item.get('type', '-')} | {item.get('name', '-')} | {item.get('src', '-')} | {size} | {item.get('id', '-')} |"
            )
