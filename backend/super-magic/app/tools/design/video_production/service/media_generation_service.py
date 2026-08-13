"""视频制作参考媒体的路径解析与画布素材登记。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from hashlib import sha256
from pathlib import Path
from typing import Any, Sequence

from app.tools.design.constants import DEFAULT_ELEMENT_HEIGHT, DEFAULT_ELEMENT_WIDTH
from app.tools.design.domain.canvas_document import CanvasElementV3
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.utils.canvas_image_utils import get_image_dimensions
from app.tools.design.utils.canvas_layout_utils import calculate_next_element_position
from app.tools.design.utils.magic_project_design_parser import (
    ImageElement,
    VideoElement,
    flatten_all_elements,
)
from app.utils.async_file_utils import (
    async_copy2,
    async_exists,
    async_is_file,
    async_realpath,
    async_stat,
)


class MediaSourceType(StrEnum):
    """视频制作参考素材的稳定媒体类型。"""

    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}
MEDIA_DIRECTORY_BY_TYPE = {
    MediaSourceType.IMAGE: "images",
    MediaSourceType.VIDEO: "videos",
    MediaSourceType.AUDIO: "audio",
}


@dataclass(frozen=True)
class MediaSourceInput:
    """模型参数中的单个参考素材路径及类型。"""

    path: str
    media_type: MediaSourceType
    name: str | None = None


@dataclass(frozen=True)
class MaterializedMediaPath:
    """已经持久化到项目并可供生成、画布共同使用的路径。"""

    file_path: Path
    canvas_src: str
    generation_path: str


@dataclass(frozen=True)
class PreparedMediaSource:
    """生成前准备好的来源素材快照。"""

    element_id: str
    content_id: str
    media_type: MediaSourceType
    name: str
    src: str
    generation_path: str
    file_path: Path
    width: float
    height: float
    register_if_missing: bool


@dataclass(frozen=True)
class CanvasAssetRegistration:
    """已经登记到画布、可供后续工具串联的素材结果。"""

    element_id: str
    content_id: str
    media_type: MediaSourceType
    name: str
    src: str
    generation_path: str
    created: bool

    def to_dict(self) -> dict[str, Any]:
        """转换为工具结果使用的稳定字典。"""
        return {
            "element_id": self.element_id,
            "content_id": self.content_id,
            "media_type": self.media_type.value,
            "name": self.name,
            "media_path": self.src,
            "generation_path": self.generation_path,
            "created": self.created,
        }


class MediaGenerationService:
    """准备参考媒体路径，并支持显式素材导入工具登记节点。"""

    @staticmethod
    def infer_media_type(path: str) -> MediaSourceType:
        """根据素材扩展名推断稳定媒体类型。"""
        extension = Path(str(path or "").strip()).suffix.lower()
        if extension in IMAGE_EXTENSIONS:
            return MediaSourceType.IMAGE
        if extension in VIDEO_EXTENSIONS:
            return MediaSourceType.VIDEO
        if extension in AUDIO_EXTENSIONS:
            return MediaSourceType.AUDIO
        raise ValueError(f"Unsupported canvas asset file type: {path}")

    @classmethod
    async def prepare_source_references(
        cls,
        manager: CanvasManagerProtocol,
        project_path: Path,
        workspace_root: Path,
        source_inputs: Sequence[MediaSourceInput],
    ) -> list[PreparedMediaSource]:
        """把工作区素材持久化为项目路径，并匹配或准备来源 Element。"""
        if not source_inputs:
            return []

        config = await manager.read_current_canvas()
        elements = cls._iter_elements(config)
        prepared: list[PreparedMediaSource] = []
        generated_source_ids: dict[tuple[MediaSourceType, str], tuple[str, str]] = {}
        for source_input in source_inputs:
            materialized = await cls._materialize_media_path(
                source_input.path,
                source_input.media_type,
                project_path,
                workspace_root,
            )
            matches = cls._find_element_content_matches(
                elements,
                source_input.media_type,
                materialized.canvas_src,
            )
            matches_by_element: dict[str, list[tuple[Any, str]]] = {}
            for match in matches:
                matches_by_element.setdefault(match[0].id, []).append(match)
            if len(matches_by_element) > 1:
                raise ValueError(
                    f"Reference media path '{source_input.path}' is ambiguous on the current Canvas"
                )
            if matches_by_element:
                element_matches = next(iter(matches_by_element.values()))
                element, content_id = cls._select_content_match(element_matches)
                prepared.append(
                    PreparedMediaSource(
                        element_id=element.id,
                        content_id=content_id,
                        media_type=source_input.media_type,
                        name=getattr(element, "name", None)
                        or source_input.name
                        or materialized.file_path.stem,
                        src=materialized.canvas_src,
                        generation_path=materialized.generation_path,
                        file_path=materialized.file_path,
                        width=float(getattr(element, "width", None) or DEFAULT_ELEMENT_WIDTH),
                        height=float(getattr(element, "height", None) or DEFAULT_ELEMENT_HEIGHT),
                        register_if_missing=False,
                    )
                )
                continue

            width, height = await cls._resolve_display_size(
                materialized.file_path,
                source_input.media_type,
            )
            source_key = (
                source_input.media_type,
                cls._normalize_canvas_path(materialized.canvas_src),
            )
            generated_ids = generated_source_ids.get(source_key)
            if generated_ids is None:
                element_id = CanvasIdGenerator.generate_element_id()
                generated_ids = (
                    element_id,
                    CanvasIdGenerator.generate_initial_content_id(element_id),
                )
                generated_source_ids[source_key] = generated_ids
            element_id, content_id = generated_ids
            prepared.append(
                PreparedMediaSource(
                    element_id=element_id,
                    content_id=content_id,
                    media_type=source_input.media_type,
                    name=source_input.name or materialized.file_path.stem,
                    src=materialized.canvas_src,
                    generation_path=materialized.generation_path,
                    file_path=materialized.file_path,
                    width=width,
                    height=height,
                    register_if_missing=True,
                )
            )
        return prepared

    @classmethod
    async def ensure_canvas_assets(
        cls,
        manager: CanvasManagerProtocol,
        config: Any,
        sources: Sequence[PreparedMediaSource],
    ) -> list[CanvasAssetRegistration]:
        """在同一事务快照中幂等登记素材并返回后续工具所需信息。"""
        unique_sources = list(
            {
                (
                    source.element_id,
                    source.content_id,
                    source.media_type,
                    cls._normalize_canvas_path(source.src),
                ): source
                for source in sources
            }.values()
        )
        resolved: list[tuple[PreparedMediaSource, Any | None]] = []
        for source in unique_sources:
            element = await manager.get_element_by_id(source.element_id, config=config)
            if element is None and source.register_if_missing:
                path_matches = cls._find_elements_by_source(config, source)
                if len(path_matches) > 1:
                    raise ValueError(f"Reference media source is ambiguous: {source.src}")
                if path_matches:
                    element = path_matches[0]
                else:
                    if not await async_is_file(source.file_path):
                        raise ValueError(f"Reference media file no longer exists: {source.generation_path}")
            elif element is None:
                raise ValueError(f"Connection source does not exist: {source.element_id}")

            if element is not None:
                cls._validate_source_element(element, source)
            resolved.append((source, element))

        registrations: list[CanvasAssetRegistration] = []
        for source, element in resolved:
            created = element is None
            if element is None:
                await manager.add_element(
                    cls._build_source_element(manager, config, source),
                    config=config,
                )
                element = await manager.get_element_by_id(source.element_id, config=config)
            if element is None:
                raise ValueError(f"Unable to register reference media source: {source.src}")
            matches = cls._find_element_content_matches(
                [element],
                source.media_type,
                source.src,
            )
            if not matches:
                raise ValueError(f"Unable to resolve registered media Content: {source.src}")
            _, content_id = cls._select_content_match(matches)
            registrations.append(
                CanvasAssetRegistration(
                    element_id=element.id,
                    content_id=content_id,
                    media_type=source.media_type,
                    name=getattr(element, "name", None) or source.name,
                    src=source.src,
                    generation_path=source.generation_path,
                    created=created,
                )
            )
        return registrations

    @classmethod
    async def _materialize_media_path(
        cls,
        value: str,
        media_type: MediaSourceType,
        project_path: Path,
        workspace_root: Path,
    ) -> MaterializedMediaPath:
        """解析工作区路径，必要时复制到项目的对应媒体目录。"""
        workspace_real = await async_realpath(workspace_root)
        project_real = await async_realpath(project_path)
        source_path = await cls._resolve_workspace_file(
            value,
            project_real,
            workspace_real,
        )
        try:
            source_path.relative_to(project_real)
            persistent_path = source_path
        except ValueError:
            persistent_path = await cls._copy_to_project_media(
                source_path,
                media_type,
                project_real,
                workspace_real,
            )

        project_relative = persistent_path.relative_to(project_real).as_posix()
        workspace_relative = persistent_path.relative_to(workspace_real).as_posix()
        return MaterializedMediaPath(
            file_path=persistent_path,
            canvas_src=f"./{project_relative}",
            generation_path=workspace_relative,
        )

    @staticmethod
    async def _resolve_workspace_file(
        value: str,
        project_path: Path,
        workspace_root: Path,
    ) -> Path:
        """按项目相对、工作区相对或工作区内绝对路径解析参考文件。"""
        normalized = str(value or "").strip().replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        if not normalized:
            raise ValueError("Reference media path must not be empty")

        raw_path = Path(normalized)
        project_prefix = project_path.relative_to(workspace_root).as_posix()
        candidates: list[Path] = []
        if raw_path.is_absolute():
            # 真正存在的绝对路径只允许位于 workspace 内；不存在的“/项目/文件”
            # 兼容为模型误写的 workspace-relative 路径，再进入兜底搜索。
            if await async_is_file(raw_path):
                candidates.append(raw_path)
            else:
                normalized = normalized.lstrip("/")
                raw_path = Path(normalized)

        if not candidates:
            workspace_candidate = workspace_root / raw_path
            project_candidate = project_path / raw_path
            if normalized == project_prefix or normalized.startswith(f"{project_prefix}/"):
                candidates.append(workspace_candidate)
            else:
                candidates.extend([project_candidate, workspace_candidate])

        for candidate in candidates:
            resolved = await async_realpath(candidate)
            try:
                resolved.relative_to(workspace_root)
            except ValueError as error:
                raise ValueError(f"Reference media path is outside the workspace: {value}") from error
            if await async_is_file(resolved):
                return resolved

        requested_parts = tuple(part for part in normalized.split("/") if part)
        target_name = requested_parts[-1] if requested_parts else ""
        suffix_matches: list[Path] = []
        basename_matches: list[Path] = []
        for candidate in workspace_root.rglob(target_name):
            if not await async_is_file(candidate):
                continue
            relative_parts = candidate.relative_to(workspace_root).parts
            if requested_parts and len(relative_parts) >= len(requested_parts):
                if tuple(relative_parts[-len(requested_parts):]) == requested_parts:
                    suffix_matches.append(candidate)
                    continue
            basename_matches.append(candidate)
        matches = suffix_matches if len(suffix_matches) == 1 else (
            basename_matches if len(basename_matches) == 1 else []
        )
        if len(matches) == 1:
            return await async_realpath(matches[0])
        if suffix_matches or basename_matches:
            raise ValueError(f"Reference media path has multiple workspace candidates: {value}")
        raise ValueError(f"Reference media file does not exist in the workspace: {value}")

    @staticmethod
    async def _copy_to_project_media(
        source_path: Path,
        media_type: MediaSourceType,
        project_path: Path,
        workspace_root: Path,
    ) -> Path:
        """把项目外素材复制到类型对应目录，并避免覆盖已有文件。"""
        source_stat = await async_stat(source_path)
        source_relative = source_path.relative_to(workspace_root).as_posix()
        fingerprint = sha256(
            f"{source_relative}:{source_stat.st_size}:{source_stat.st_mtime_ns}".encode("utf-8")
        ).hexdigest()[:10]
        destination = (
            project_path
            / MEDIA_DIRECTORY_BY_TYPE[media_type]
            / f"{source_path.stem}-{fingerprint}{source_path.suffix.lower()}"
        )
        if not await async_exists(destination):
            await async_copy2(source_path, destination)
        return await async_realpath(destination)

    @staticmethod
    async def _resolve_display_size(
        file_path: Path,
        media_type: MediaSourceType,
    ) -> tuple[float, float]:
        """读取来源图片尺寸，其他媒体使用稳定的画布展示尺寸。"""
        if media_type == MediaSourceType.IMAGE:
            try:
                width, height = await get_image_dimensions(file_path)
                return float(width), float(height)
            except Exception:
                return DEFAULT_ELEMENT_WIDTH, DEFAULT_ELEMENT_HEIGHT
        if media_type == MediaSourceType.VIDEO:
            return 1280.0, 720.0
        return 480.0, 120.0

    @classmethod
    def _find_elements_by_source(
        cls,
        config: Any,
        source: PreparedMediaSource,
    ) -> list[Any]:
        """在最终事务快照中按媒体类型和 src 查找来源节点。"""
        matches = cls._find_element_content_matches(
            cls._iter_elements(config),
            source.media_type,
            source.src,
        )
        unique_elements = {element.id: element for element, _ in matches}
        return list(unique_elements.values())

    @staticmethod
    def _build_source_element(
        manager: CanvasManagerProtocol,
        config: Any,
        source: PreparedMediaSource,
    ) -> Any:
        """根据当前 Manager 能力构造对应格式的来源媒体 Element。"""
        if manager.supports_content_versions():
            fields = {"src": source.src}
            if source.media_type in {MediaSourceType.IMAGE, MediaSourceType.VIDEO}:
                fields["status"] = "completed"
            return CanvasElementV3(
                id=source.element_id,
                type=source.media_type.value,
                properties={
                    "name": source.name,
                    "width": source.width,
                    "height": source.height,
                    "visible": True,
                    "locked": False,
                },
                contents=[ElementContent(content_id=source.content_id, fields=fields)],
                active_content_id=source.content_id,
                main_content_id=source.content_id,
            )

        x, y = calculate_next_element_position(
            config,
            source.width,
            source.height,
            max_elements_per_row=6 if source.media_type == MediaSourceType.IMAGE else 4,
        )
        z_index = max(
            (
                element.zIndex
                for element in flatten_all_elements(config)
                if element.zIndex is not None
            ),
            default=0,
        ) + 1
        common = {
            "id": source.element_id,
            "name": source.name,
            "x": x,
            "y": y,
            "width": source.width,
            "height": source.height,
            "zIndex": z_index,
            "visible": True,
            "locked": False,
            "src": source.src,
            "status": "completed",
        }
        if source.media_type == MediaSourceType.IMAGE:
            return ImageElement(type="image", **common)
        if source.media_type == MediaSourceType.VIDEO:
            return VideoElement(type="video", **common)
        raise ValueError("Legacy Canvas formats do not support Audio Elements")

    @classmethod
    def _validate_source_element(
        cls,
        element: Any,
        source: PreparedMediaSource,
    ) -> None:
        """确认已有节点仍代表准备阶段记录的同一来源素材。"""
        if getattr(element, "type", None) != source.media_type.value:
            raise ValueError(f"Reference source type changed during generation: {source.element_id}")
        matching_content_ids = {
            content_id
            for matched_element, content_id in cls._find_element_content_matches(
                [element],
                source.media_type,
                source.src,
            )
        }
        if source.register_if_missing and element.id != source.element_id:
            if not matching_content_ids:
                raise ValueError(f"Reference source changed during generation: {source.element_id}")
            return
        if source.content_id not in matching_content_ids:
            raise ValueError(f"Reference source changed during generation: {source.element_id}")

    @staticmethod
    def _iter_elements(config: Any) -> list[Any]:
        """读取当前配置中的全部顶层业务 Element。"""
        canvas = getattr(config, "canvas", None)
        if canvas is None:
            return []
        iter_elements = getattr(canvas, "iter_elements", None)
        if callable(iter_elements):
            return list(iter_elements())
        return list(getattr(canvas, "elements", []))

    @classmethod
    def _find_element_content_matches(
        cls,
        elements: Sequence[Any],
        media_type: MediaSourceType,
        src: str,
    ) -> list[tuple[Any, str]]:
        """按媒体类型和路径匹配 Element 中的具体 Content。"""
        normalized_src = cls._normalize_canvas_path(src)
        matches: list[tuple[Any, str]] = []
        for element in elements:
            if getattr(element, "type", None) != media_type.value:
                continue
            contents = list(getattr(element, "contents", []) or [])
            if contents:
                for content in contents:
                    content_src = str(getattr(content, "fields", {}).get("src") or "")
                    if cls._normalize_canvas_path(content_src) == normalized_src:
                        matches.append((element, str(content.content_id)))
                continue
            element_src = str(getattr(element, "src", "") or "")
            if cls._normalize_canvas_path(element_src) == normalized_src:
                matches.append((element, str(element.id)))
        return matches

    @staticmethod
    def _select_content_match(matches: Sequence[tuple[Any, str]]) -> tuple[Any, str]:
        """同一 Element 多个 Content 路径相同时优先选择 active 或 main Content。"""
        element = matches[0][0]
        content_ids = {content_id for _, content_id in matches}
        active_content_id = getattr(element, "active_content_id", None)
        if active_content_id in content_ids:
            return element, str(active_content_id)
        main_content_id = getattr(element, "main_content_id", None)
        if main_content_id in content_ids:
            return element, str(main_content_id)
        return matches[0]

    @staticmethod
    def _normalize_canvas_path(value: str) -> str:
        """将 Canvas 中允许的相对路径写法统一为稳定比较值。"""
        normalized = str(value or "").strip().replace("\\", "/")
        if not normalized:
            return ""
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return normalized.casefold()
