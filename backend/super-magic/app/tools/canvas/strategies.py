"""Canvas 布局、Content 和 Connection 的可替换策略。"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from math import floor
from typing import Any

from app.tools.canvas.codec import COMMON_CONTENT_FIELDS, CONTENT_FIELDS
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasDocument, CanvasElement

DEFAULT_ELEMENT_SPACING = 200.0
DEFAULT_ELEMENT_WIDTH = 1024.0
DEFAULT_ELEMENT_HEIGHT = 1024.0


@dataclass(frozen=True)
class LayoutStrategyRequest:
    """布局策略的强类型输入。"""

    element_id: str
    options: dict[str, Any]
    index: int = 0


@dataclass(frozen=True)
class LayoutMutationPlan:
    """布局策略返回的最小变更计划，不直接持久化 Canvas。"""

    element_id: str
    properties: dict[str, Any]

    def apply(self, canvas: CanvasDocument) -> None:
        """将已计算的布局字段应用到内存 Canvas 快照。"""
        element = canvas.get_element(self.element_id)
        if element is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {self.element_id} does not exist.")
        element.properties.update(self.properties)


class LayoutStrategyInterface(ABC):
    """布局策略接口。"""

    name: str

    @abstractmethod
    def plan(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: LayoutStrategyRequest,
    ) -> LayoutMutationPlan:
        """根据布局请求计算目标 Element 的布局变更计划。"""

    def apply(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: dict[str, Any],
        index: int,
    ) -> None:
        """兼容旧调用方，将策略计划应用到内存快照。"""
        self.plan(
            canvas,
            element,
            LayoutStrategyRequest(element.element_id, dict(request), index),
        ).apply(canvas)


class RowIncrementalLayoutStrategy(LayoutStrategyInterface):
    """复刻 Design 默认的行式增量布局。"""

    name = "row_incremental"
    max_per_row = {"image": 6, "video": 4}

    def plan(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: LayoutStrategyRequest,
    ) -> LayoutMutationPlan:
        """复用默认设计布局语义，为新节点寻找下一处稳定位置。"""
        changes: dict[str, Any] = {}
        positioned = [
            item
            for item in canvas.siblings(element.element_id)
            if item.element_id != element.element_id
            and item.properties.get("visible") is not False
            and _number(item.properties.get("x")) is not None
            and _number(item.properties.get("y")) is not None
        ]
        if "x" not in element.properties or "y" not in element.properties:
            x, y = self._next_position(positioned, element.element_type)
            changes.update({"x": element.properties.get("x", x), "y": element.properties.get("y", y)})
        if _number(element.properties.get("zIndex")) is None:
            changes["zIndex"] = _next_z_index(canvas, element)
        return LayoutMutationPlan(element.element_id, changes)

    def _next_position(self, positioned: list[CanvasElement], element_type: str) -> tuple[float, float]:
        """按当前最后一行容量计算下一个位置。"""
        if not positioned:
            return 0.0, 0.0
        max_y = max(float(item.properties["y"]) for item in positioned)
        last_row = [item for item in positioned if abs(float(item.properties["y"]) - max_y) < 1.0]
        maximum = self.max_per_row.get(element_type, 4)
        if last_row and len(last_row) < maximum:
            rightmost = max(last_row, key=lambda item: float(item.properties["x"]))
            return (
                float(rightmost.properties["x"]) + _width(rightmost) + DEFAULT_ELEMENT_SPACING,
                max_y,
            )
        min_x = min(float(item.properties["x"]) for item in positioned)
        max_bottom = max(float(item.properties["y"]) + _height(item) for item in positioned)
        return min_x, max_bottom + DEFAULT_ELEMENT_SPACING


class DependencyFlowLayoutStrategy(LayoutStrategyInterface):
    """根据直接上游语义提供稳定的流程布局起点。"""

    name = "dependency_flow"
    horizontal_gap = 560.0
    vertical_gap = 240.0

    def plan(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: LayoutStrategyRequest,
    ) -> LayoutMutationPlan:
        """根据直接上游把目标放在右侧，并只向下避让碰撞。"""
        parent_id = canvas.parent_map().get(element.element_id)
        occupied = [
            item
            for item in canvas.siblings(element.element_id)
            if item.element_id != element.element_id
            and _number(item.properties.get("x")) is not None
            and _number(item.properties.get("y")) is not None
        ]
        source_ids = [
            connection.source_element_id
            for connection in canvas.connections
            if connection.target_element_id == element.element_id
        ]
        sources = [canvas.get_element(source_id) for source_id in dict.fromkeys(source_ids)]
        sources = [source for source in sources if source is not None]
        parent_map = canvas.parent_map()
        if any(parent_map.get(source.element_id) != parent_id for source in sources):
            raise CanvasDomainError(
                "LAYOUT_CROSS_CONTAINER_UNSUPPORTED",
                "Dependency layout requires all connected Elements to share the same direct parent.",
            )
        if sources:
            if any(_number(source.properties.get("x")) is None or _number(source.properties.get("y")) is None for source in sources):
                raise CanvasDomainError("LAYOUT_SOURCE_UNPOSITIONED", "Dependency layout requires positioned upstream Elements.")
            preferred_x = max(float(source.properties["x"]) + _width(source) for source in sources) + self.horizontal_gap
            preferred_y = float(sources[0].properties["y"])
        else:
            preferred_x = 0.0
            root_column = [item for item in occupied if abs(float(item.properties["x"])) < 1.0]
            preferred_y = (
                max(float(item.properties["y"]) + _height(item) for item in root_column) + self.vertical_gap
                if root_column
                else 0.0
            )
        x, y = self._find_available(element, preferred_x, preferred_y, occupied)
        changes: dict[str, Any] = {"x": x, "y": y}
        if _number(element.properties.get("zIndex")) is None:
            changes["zIndex"] = _next_z_index(canvas, element)
        return LayoutMutationPlan(element.element_id, changes)

    def _find_available(
        self,
        element: CanvasElement,
        preferred_x: float,
        preferred_y: float,
        occupied: list[CanvasElement],
    ) -> tuple[float, float]:
        """从首选位置开始只向下寻找无碰撞位置。"""
        candidate_y = preferred_y
        while True:
            collisions = [
                item
                for item in occupied
                if _overlaps(element, preferred_x, candidate_y, item)
            ]
            if not collisions:
                return preferred_x, candidate_y
            candidate_y = max(float(item.properties["y"]) + _height(item) for item in collisions) + self.vertical_gap


class ExplicitPositionLayoutStrategy(LayoutStrategyInterface):
    """只在用户明确提供坐标时写入显式位置。"""

    name = "explicit_position"

    def plan(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: LayoutStrategyRequest,
    ) -> LayoutMutationPlan:
        """写入用户提供的 x/y 坐标。"""
        position = request.options.get("position") or {}
        if "x" not in position or "y" not in position:
            raise CanvasDomainError("EXPLICIT_POSITION_REQUIRED", "Explicit positioning requires x and y.")
        changes: dict[str, Any] = {"x": position["x"], "y": position["y"]}
        if _number(element.properties.get("zIndex")) is None:
            changes["zIndex"] = _next_z_index(canvas, element)
        return LayoutMutationPlan(element.element_id, changes)


def _number(value: Any) -> float | None:
    """读取排除布尔值的数值。"""
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _width(element: CanvasElement) -> float:
    """读取布局宽度，缺失时使用统一占位宽度。"""
    value = _number(element.properties.get("width"))
    return value if value is not None and value > 0 else DEFAULT_ELEMENT_WIDTH


def _height(element: CanvasElement) -> float:
    """读取布局高度，缺失时使用统一占位高度。"""
    value = _number(element.properties.get("height"))
    return value if value is not None and value > 0 else DEFAULT_ELEMENT_HEIGHT


def _next_z_index(canvas: CanvasDocument, element: CanvasElement) -> int:
    """计算目标 Element 所在父级的下一个图层值。"""
    maximum = max(
        (
            value
            for item in canvas.siblings(element.element_id)
            if item.element_id != element.element_id
            and (value := _number(item.properties.get("zIndex"))) is not None
        ),
        default=0.0,
    )
    return floor(maximum) + 1


def _overlaps(target: CanvasElement, target_x: float, target_y: float, occupied: CanvasElement) -> bool:
    """判断目标候选矩形是否与已布局节点相交。"""
    occupied_x = float(occupied.properties["x"])
    occupied_y = float(occupied.properties["y"])
    return not (
        target_x + _width(target) <= occupied_x
        or target_x >= occupied_x + _width(occupied)
        or target_y + _height(target) <= occupied_y
        or target_y >= occupied_y + _height(occupied)
    )


class LayoutStrategyRegistry:
    """布局策略注册表。"""

    def __init__(self, strategies: list[LayoutStrategyInterface] | None = None):
        """初始化默认布局策略。"""
        values = strategies or [RowIncrementalLayoutStrategy(), DependencyFlowLayoutStrategy(), ExplicitPositionLayoutStrategy()]
        self._strategies = {strategy.name: strategy for strategy in values}

    def get(self, name: str) -> LayoutStrategyInterface:
        """按策略名称取得实现。"""
        try:
            return self._strategies[name]
        except KeyError as exc:
            raise CanvasDomainError("LAYOUT_STRATEGY_NOT_FOUND", f"Unknown layout strategy: {name}.") from exc


class ContentStrategyInterface(ABC):
    """Content 创建策略接口。"""

    @abstractmethod
    def plan(self, data: dict[str, Any]) -> "ContentMutationPlan":
        """把外部 Content 输入转换为主协议 Content 变更计划。"""

    def build(self, data: dict[str, Any]) -> CanvasContent:
        """兼容旧调用方，返回计划中的 Content。"""
        return self.plan(data).content


@dataclass(frozen=True)
class ContentMutationPlan:
    """Content 策略返回的不可变创建计划。"""

    content: CanvasContent


class UserContentStrategy(ContentStrategyInterface):
    """处理用户直接提供的 Content。"""

    def plan(self, data: dict[str, Any]) -> ContentMutationPlan:
        """创建不包含内部 source 字段的 Content 计划。"""
        content_id = data.get("content_id")
        if not content_id:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Content ID must be assigned before strategy execution.")
        content_type = str(data.get("content_type") or "")
        fields = {key: value for key, value in data.items() if key not in {"source", "content_id", "content_type", "prompt", "size", "model_id", "name", "output_path", "reference_images", "reference_image_paths", "reference_video_paths", "reference_audio_paths", "frame_start_path", "frame_end_path", "duration_seconds", "aspect_ratio", "resolution", "fps", "seed", "watermark", "extensions"}}
        allowed = CONTENT_FIELDS.get(content_type)
        if allowed is None:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", f"Unsupported Content type: {content_type}.")
        unexpected = set(fields) - allowed - COMMON_CONTENT_FIELDS
        if unexpected:
            fields_text = ", ".join(sorted(unexpected))
            raise CanvasDomainError("CONTENT_INPUT_INVALID", f"Content type {content_type} does not allow: {fields_text}.")
        return ContentMutationPlan(CanvasContent(content_id, fields))


class ImportedAssetContentStrategy(UserContentStrategy):
    """处理从工作区导入的图片或视频 Content。"""

    def plan(self, data: dict[str, Any]) -> ContentMutationPlan:
        """校验 imported Content 必须提供素材 URI。"""
        content = super().plan(data).content
        if not content.fields.get("src"):
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Imported Content requires src.")
        return ContentMutationPlan(content)


class GeneratedContentStrategy(UserContentStrategy):
    """处理生成意图，并把生成状态写入协议允许的 Content 字段。"""

    def plan(self, data: dict[str, Any]) -> ContentMutationPlan:
        """创建 pending Content，具体生成由 Application 的能力端口执行。"""
        content_type = data.get("content_type")
        if content_type not in {"image", "video"}:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Generated Content requires content_type=image or video.")
        content = super().plan(data).content
        content.fields["status"] = "pending"
        request_key = "generateImageRequest" if content_type == "image" else "generateVideoRequest"
        request_fields = {
            key: value
            for key, value in data.items()
            if key not in {"source", "content_id", "content_type"} and value is not None
        }
        content.fields.setdefault(request_key, request_fields)
        return ContentMutationPlan(content)


# 兼容包内早期实验代码的名称，不作为公开工具 API。
BasicContentStrategy = UserContentStrategy


class ContentStrategyRegistry:
    """Content 策略注册表。"""

    def __init__(self, strategies: dict[str, ContentStrategyInterface] | None = None):
        """初始化按 source 选择的 Content 策略。"""
        self._strategies = strategies or {
            "user": UserContentStrategy(),
            "imported": ImportedAssetContentStrategy(),
            "generated": GeneratedContentStrategy(),
        }

    def build(self, data: dict[str, Any], element_type: str | None = None) -> CanvasContent:
        """执行当前 Content 策略。"""
        return self.plan(data, element_type).content

    def plan(self, data: dict[str, Any], element_type: str | None = None) -> ContentMutationPlan:
        """执行当前 Content 策略并返回强类型计划。"""
        source = str(data.get("source") or "user")
        content_type = str(data.get("content_type") or "")
        if element_type is not None and content_type != element_type:
            raise CanvasDomainError(
                "CONTENT_TYPE_MISMATCH",
                f"Content type {content_type} does not match Element type {element_type}.",
            )
        strategy = self._strategies.get(source)
        if strategy is None:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", f"Unsupported Content source: {source}.")
        return strategy.plan(data)


@dataclass(frozen=True)
class ConnectionStrategyRequest:
    """连线策略的强类型输入。"""

    source_element_id: str
    target_element_id: str


@dataclass(frozen=True)
class ConnectionMutationPlan:
    """连线策略返回的变更计划。"""

    connection: CanvasConnection
    already_exists: bool = False

    def apply(self, canvas: CanvasDocument) -> CanvasConnection:
        """将新连线加入内存 Canvas；重复关系保持幂等。"""
        if self.already_exists:
            return self.connection
        if not any(item.connection_id == self.connection.connection_id for item in canvas.connections):
            canvas.connections.append(self.connection)
        return self.connection


class ConnectionStrategyInterface(ABC):
    """Connection 创建策略接口。"""

    @abstractmethod
    def plan(
        self,
        canvas: CanvasDocument,
        request: ConnectionStrategyRequest,
    ) -> ConnectionMutationPlan:
        """校验并计算一条 Connection 的变更计划。"""

    def add(self, canvas: CanvasDocument, source: str, target: str) -> CanvasConnection:
        """兼容旧调用方，将连线计划应用到内存快照。"""
        return self.plan(
            canvas,
            ConnectionStrategyRequest(source, target),
        ).apply(canvas)


class DirectConnectionStrategy(ConnectionStrategyInterface):
    """处理 Element 直接关系的策略。"""

    def plan(
        self,
        canvas: CanvasDocument,
        request: ConnectionStrategyRequest,
    ) -> ConnectionMutationPlan:
        """新增或幂等返回同向关系的变更计划。"""
        source = request.source_element_id
        target = request.target_element_id
        if canvas.get_element(source) is None or canvas.get_element(target) is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", "Connection endpoints must reference existing Elements.")
        if source == target:
            raise CanvasDomainError("INVALID_CONNECTION", "A Connection cannot point to the same Element.")
        existing = next((item for item in canvas.connections if item.source_element_id == source and item.target_element_id == target), None)
        if existing is not None:
            return ConnectionMutationPlan(existing, already_exists=True)
        connection = CanvasConnection(f"connection-{uuid.uuid4().hex[:16]}", source, target)
        return ConnectionMutationPlan(connection)


class ConnectionStrategyRegistry:
    """Connection 策略注册表。"""

    def __init__(self, strategy: ConnectionStrategyInterface | None = None):
        """初始化直接关系策略。"""
        self._strategy = strategy or DirectConnectionStrategy()

    def add(self, canvas: CanvasDocument, source: str, target: str) -> CanvasConnection:
        """执行当前 Connection 策略。"""
        return self._strategy.add(canvas, source, target)

    def plan(
        self,
        canvas: CanvasDocument,
        source: str,
        target: str,
    ) -> ConnectionMutationPlan:
        """返回当前连线策略的强类型变更计划。"""
        return self._strategy.plan(canvas, ConnectionStrategyRequest(source, target))
