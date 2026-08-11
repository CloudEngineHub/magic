"""视频制作媒体生成后的来源解析与 Element 关系维护。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable, Sequence
from uuid import uuid4

from app.tools.design.constants import DEFAULT_ELEMENT_HEIGHT, DEFAULT_ELEMENT_WIDTH
from app.tools.design.domain.canvas_document import CanvasConnection, CanvasElementV3
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.utils.canvas_image_utils import get_image_dimensions
from app.tools.design.utils.magic_project_design_parser import ImageElement, VideoElement
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


@dataclass(frozen=True)
class MediaSourceInput:
    """模型参数中的单个参考素材路径及类型。"""

    path: str
    media_type: MediaSourceType


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


class MediaGenerationService:
    """准备参考媒体来源，并在最终事务中登记节点和建立关系。"""

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
        for source_input in source_inputs:
            materialized = await cls._materialize_media_path(
                source_input.path,
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
                        name=getattr(element, "name", None) or materialized.file_path.stem,
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
            element_id = cls._source_element_id(source_input.media_type, materialized.canvas_src)
            prepared.append(
                PreparedMediaSource(
                    element_id=element_id,
                    content_id=cls._source_content_id(element_id, materialized.canvas_src),
                    media_type=source_input.media_type,
                    name=materialized.file_path.stem,
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
    async def ensure_source_elements(
        cls,
        manager: CanvasManagerProtocol,
        config: Any,
        sources: Sequence[PreparedMediaSource],
    ) -> list[str]:
        """在最终事务快照中复用已有来源，或登记尚未进入 Canvas 的素材。"""
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

        resolved_ids: list[str] = []
        for source, element in resolved:
            if element is None:
                await manager.add_element(
                    cls._build_source_element(manager, source),
                    config=config,
                )
                element = await manager.get_element_by_id(source.element_id, config=config)
            if element is None:
                raise ValueError(f"Unable to register reference media source: {source.src}")
            if element.id not in resolved_ids:
                resolved_ids.append(element.id)
        return resolved_ids

    @staticmethod
    def apply_source_connections(
        config: Any,
        pairs: Iterable[tuple[str, str]],
    ) -> list[dict[str, str]]:
        """在已有 Canvas 配置快照中幂等建立来源连接。"""
        unique_pairs = list(dict.fromkeys(pairs))
        MediaGenerationService._validate_source_connection_pairs(config, unique_pairs)
        result: list[dict[str, str]] = []
        for source_element_id, target_element_id in unique_pairs:
            connection = ConnectionService.ensure_connection(
                config.canvas,
                CanvasConnection(
                    id=f"connection-{uuid4()}",
                    source_element_id=source_element_id,
                    target_element_id=target_element_id,
                ),
            )
            result.append({
                "connection_id": connection.id,
                "source_element_id": connection.source_element_id,
                "target_element_id": connection.target_element_id,
            })
        return result

    @classmethod
    async def _materialize_media_path(
        cls,
        value: str,
        project_path: Path,
        workspace_root: Path,
    ) -> MaterializedMediaPath:
        """解析工作区路径，必要时复制到当前项目的 assets 目录。"""
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
            persistent_path = await cls._copy_to_project_assets(
                source_path,
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
        if raw_path.is_absolute():
            candidate = raw_path
        else:
            project_prefix = project_path.relative_to(workspace_root).as_posix()
            workspace_candidate = workspace_root / raw_path
            project_candidate = project_path / raw_path
            if normalized == project_prefix or normalized.startswith(f"{project_prefix}/"):
                candidate = workspace_candidate
            elif await async_is_file(project_candidate):
                candidate = project_candidate
            else:
                candidate = workspace_candidate

        resolved = await async_realpath(candidate)
        try:
            resolved.relative_to(workspace_root)
        except ValueError as error:
            raise ValueError(f"Reference media path is outside the workspace: {value}") from error
        if not await async_is_file(resolved):
            raise ValueError(f"Reference media file does not exist in the workspace: {value}")
        return resolved

    @staticmethod
    async def _copy_to_project_assets(
        source_path: Path,
        project_path: Path,
        workspace_root: Path,
    ) -> Path:
        """把项目外的工作区素材复制为稳定且不覆盖的项目资产。"""
        source_stat = await async_stat(source_path)
        source_relative = source_path.relative_to(workspace_root).as_posix()
        fingerprint = sha256(
            f"{source_relative}:{source_stat.st_size}:{source_stat.st_mtime_ns}".encode("utf-8")
        ).hexdigest()[:10]
        destination = (
            project_path
            / "assets"
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

        common = {
            "id": source.element_id,
            "name": source.name,
            "width": source.width,
            "height": source.height,
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
    def _validate_source_connection_pairs(
        config: Any,
        pairs: Sequence[tuple[str, str]],
    ) -> None:
        """在修改事务快照前完整校验来源关系，避免部分写入内存。"""
        canvas = config.canvas
        for source_element_id, target_element_id in pairs:
            if source_element_id == target_element_id:
                raise ValueError("A generated media Element cannot connect to itself")
            if canvas.get_element(source_element_id) is None:
                raise ValueError(f"Connection source does not exist: {source_element_id}")
            if canvas.get_element(target_element_id) is None:
                raise ValueError(f"Connection target does not exist: {target_element_id}")
            reverse_exists = any(
                connection.source_element_id == target_element_id
                and connection.target_element_id == source_element_id
                for connection in canvas.connections
            )
            same_direction_exists = any(
                connection.source_element_id == source_element_id
                and connection.target_element_id == target_element_id
                for connection in canvas.connections
            )
            if reverse_exists and not same_direction_exists:
                raise ValueError("Duplicate or reverse duplicate Connection is not allowed")

    @staticmethod
    def _normalize_canvas_path(value: str) -> str:
        """将 Canvas 中允许的相对路径写法统一为稳定比较值。"""
        normalized = str(value or "").strip().replace("\\", "/")
        if not normalized:
            return ""
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return normalized.casefold()

    @staticmethod
    def _source_element_id(media_type: MediaSourceType, src: str) -> str:
        """根据稳定项目路径生成可幂等复用的来源 Element ID。"""
        digest = sha256(src.casefold().encode("utf-8")).hexdigest()[:16]
        return f"source-{media_type.value}-{digest}"

    @staticmethod
    def _source_content_id(element_id: str, src: str) -> str:
        """根据来源路径生成稳定 Content ID。"""
        digest = sha256(src.casefold().encode("utf-8")).hexdigest()[:12]
        return f"{element_id}-content-{digest}"
