"""Canvas V3 文档领域模型。"""

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.tools.design.domain.content import ElementContent


@dataclass
class CanvasElementV3:
    """表示 V3 Canvas 中的一个 Element。"""

    id: str
    type: str
    contents: List[ElementContent]
    active_content_id: Optional[str]
    main_content_id: Optional[str]
    properties: Dict[str, Any] = field(default_factory=dict)
    children: Optional[List["CanvasElementV3"]] = None

    @property
    def name(self) -> Optional[str]:
        """返回 Element 名称，供稳定查询 DTO 和旧工具只读兼容。"""
        value = self.properties.get("name")
        return value if isinstance(value, str) else None

    @property
    def x(self) -> Optional[float]:
        """返回 Element 的 X 坐标。"""
        return self._number_property("x")

    @property
    def y(self) -> Optional[float]:
        """返回 Element 的 Y 坐标。"""
        return self._number_property("y")

    @property
    def width(self) -> Optional[float]:
        """返回 Element 展示宽度。"""
        return self._number_property("width")

    @property
    def height(self) -> Optional[float]:
        """返回 Element 展示高度。"""
        return self._number_property("height")

    @property
    def zIndex(self) -> Optional[int]:  # noqa: N802
        """返回 Element 的图层值。"""
        value = self.properties.get("zIndex")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    @property
    def absolute_x(self) -> Optional[float]:
        """兼容旧查询接口，V3 不计算容器层级坐标。"""
        return self.x

    @property
    def absolute_y(self) -> Optional[float]:
        """兼容旧查询接口，V3 不计算容器层级坐标。"""
        return self.y

    @property
    def visible(self) -> Optional[bool]:
        """返回 Element 可见状态。"""
        value = self.properties.get("visible")
        return value if isinstance(value, bool) else None

    @property
    def locked(self) -> Optional[bool]:
        """返回 Element 锁定状态。"""
        value = self.properties.get("locked")
        return value if isinstance(value, bool) else None

    @property
    def src(self) -> Optional[str]:
        """返回 main Content 的媒体路径，缺失时退回 active Content。"""
        content = self.get_main_content() or self.get_active_content()
        value = content.fields.get("src") if content is not None else None
        return value if isinstance(value, str) else None

    @property
    def status(self) -> Optional[str]:
        """返回 active Content 的生成状态。"""
        content = self.get_active_content()
        value = content.fields.get("status") if content is not None else None
        return value if isinstance(value, str) else None

    def get_content(self, content_id: Optional[str]) -> Optional[ElementContent]:
        """按 contentId 查询 Content。"""
        if not content_id:
            return None
        return next((content for content in self.contents if content.content_id == content_id), None)

    def get_active_content(self) -> Optional[ElementContent]:
        """返回当前展示和编辑使用的 Content。"""
        return self.get_content(self.active_content_id)

    def get_main_content(self) -> Optional[ElementContent]:
        """返回 Connection 和下游业务消费的稳定 Content。"""
        return self.get_content(self.main_content_id)

    def to_dict(self) -> Dict[str, Any]:
        """转换为 V3 DSL Element 字典。"""
        result: Dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            **deepcopy(self.properties),
            "activeContentId": self.active_content_id,
            "mainContentId": self.main_content_id,
            "contents": [content.to_dict() for content in self.contents],
        }
        if self.children is not None:
            result["children"] = [child.to_dict() for child in self.children]
        return result

    def clone(self) -> "CanvasElementV3":
        """返回当前 Element 的深拷贝。"""
        return CanvasElementV3(
            id=self.id,
            type=self.type,
            contents=[content.clone() for content in self.contents],
            active_content_id=self.active_content_id,
            main_content_id=self.main_content_id,
            properties=deepcopy(self.properties),
            children=[child.clone() for child in self.children] if self.children is not None else None,
        )

    def _number_property(self, field_name: str) -> Optional[float]:
        """读取一个排除布尔值的数值外壳字段。"""
        value = self.properties.get(field_name)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        return None


@dataclass
class CanvasConnection:
    """表示两个 Element 之间的持久化业务连接。"""

    id: str
    source_element_id: str
    target_element_id: str
    locked: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """转换为 V3 DSL Connection 字典。"""
        result: Dict[str, Any] = {
            "id": self.id,
            "sourceElementId": self.source_element_id,
            "targetElementId": self.target_element_id,
        }
        if self.locked:
            result["locked"] = True
        return result


@dataclass
class CanvasDocumentV3:
    """表示 V3 Canvas 文档。"""

    elements: List[CanvasElementV3] = field(default_factory=list)
    connections: List[CanvasConnection] = field(default_factory=list)
    extra_data: Dict[str, Any] = field(default_factory=dict)

    def iter_elements(self) -> List[CanvasElementV3]:
        """按文档顺序返回全部 Element，包含被动透传的嵌套节点。"""
        result: List[CanvasElementV3] = []

        def collect(element: CanvasElementV3) -> None:
            """递归收集单个 Element 及其已有子节点。"""
            result.append(element)
            for child in element.children or []:
                collect(child)

        for element in self.elements:
            collect(element)
        return result

    def get_element(self, element_id: str) -> Optional[CanvasElementV3]:
        """按 Element ID 查询节点。"""
        return next((element for element in self.iter_elements() if element.id == element_id), None)

    def to_dict(self) -> Dict[str, Any]:
        """转换为 V3 Canvas DSL 字典。"""
        result: Dict[str, Any] = {
            **deepcopy(self.extra_data),
            "elements": [element.to_dict() for element in self.elements],
        }
        if self.connections:
            result["connections"] = [connection.to_dict() for connection in self.connections]
        return result

    def clone(self) -> "CanvasDocumentV3":
        """返回当前 Canvas 文档的深拷贝。"""
        return CanvasDocumentV3(
            elements=[element.clone() for element in self.elements],
            connections=[deepcopy(connection) for connection in self.connections],
            extra_data=deepcopy(self.extra_data),
        )


@dataclass
class MagicProjectConfigV3:
    """表示顶层版本为 3.0.0 的 magic.project.js 配置。"""

    version: str
    type: str
    name: str
    canvas: CanvasDocumentV3
    extra_data: Dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "MagicProjectConfigV3":
        """返回当前项目配置的深拷贝。"""
        return MagicProjectConfigV3(
            version=self.version,
            type=self.type,
            name=self.name,
            canvas=self.canvas.clone(),
            extra_data=deepcopy(self.extra_data),
        )
