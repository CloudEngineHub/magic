"""Canvas 3.0 领域对象。

这些对象不依赖旧 Design 工具，负责承载主协议允许的字段和最小业务不变量。
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.tools.canvas.domain.errors import CanvasDomainError


@dataclass
class CanvasContent:
    """表示一个 Element 下的 Content 版本。"""

    content_id: str
    fields: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "CanvasContent":
        """返回当前 Content 的深拷贝。"""
        return CanvasContent(self.content_id, deepcopy(self.fields))

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Content 字典。"""
        return {"contentId": self.content_id, **deepcopy(self.fields)}


@dataclass
class CanvasElement:
    """表示一个可嵌套的 Canvas Element。"""

    element_id: str
    element_type: str
    properties: dict[str, Any] = field(default_factory=dict)
    contents: list[CanvasContent] = field(default_factory=list)
    active_content_id: str | None = None
    main_content_id: str | None = None
    children: list["CanvasElement"] | None = None

    def clone(self) -> "CanvasElement":
        """返回当前 Element 的深拷贝。"""
        return CanvasElement(
            element_id=self.element_id,
            element_type=self.element_type,
            properties=deepcopy(self.properties),
            contents=[content.clone() for content in self.contents],
            active_content_id=self.active_content_id,
            main_content_id=self.main_content_id,
            children=[child.clone() for child in self.children] if self.children is not None else None,
        )

    def iter_elements(self) -> Iterable["CanvasElement"]:
        """递归返回当前 Element 及其子节点。"""
        yield self
        for child in self.children or []:
            yield from child.iter_elements()

    def get_content(self, content_id: str | None) -> CanvasContent | None:
        """按 Content ID 查找版本。"""
        if not content_id:
            return None
        return next((item for item in self.contents if item.content_id == content_id), None)

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Element 字典。"""
        result = {
            "id": self.element_id,
            "type": self.element_type,
            **deepcopy(self.properties),
            "activeContentId": self.active_content_id,
            "mainContentId": self.main_content_id,
            "contents": [content.to_dict() for content in self.contents],
        }
        if self.children is not None:
            result["children"] = [child.to_dict() for child in self.children]
        return result


@dataclass
class CanvasConnection:
    """表示两个 Element 之间的关系。"""

    connection_id: str
    source_element_id: str
    target_element_id: str

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Connection 字典。"""
        return {
            "id": self.connection_id,
            "sourceElementId": self.source_element_id,
            "targetElementId": self.target_element_id,
        }


@dataclass
class CanvasDocument:
    """表示解压后的 Canvas 文档。"""

    elements: list[CanvasElement] = field(default_factory=list)
    connections: list[CanvasConnection] = field(default_factory=list)
    extra_data: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "CanvasDocument":
        """返回当前文档的深拷贝。"""
        return CanvasDocument(
            elements=[element.clone() for element in self.elements],
            connections=deepcopy(self.connections),
            extra_data=deepcopy(self.extra_data),
        )

    def iter_elements(self) -> list[CanvasElement]:
        """按文档顺序递归返回全部 Element。"""
        result: list[CanvasElement] = []
        for element in self.elements:
            result.extend(element.iter_elements())
        return result

    def get_element(self, element_id: str) -> CanvasElement | None:
        """按 Element ID 查找节点。"""
        return next((element for element in self.iter_elements() if element.element_id == element_id), None)

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Canvas 字典。"""
        return {
            **deepcopy(self.extra_data),
            "elements": [element.to_dict() for element in self.elements],
            "connections": [connection.to_dict() for connection in self.connections],
        }

    def validate(self) -> None:
        """校验 Element、Content、Connection 的领域不变量。"""
        elements = self.iter_elements()
        element_ids = [element.element_id for element in elements]
        if len(element_ids) != len(set(element_ids)):
            raise CanvasDomainError("INVALID_CANVAS_DOCUMENT", "Element IDs must be unique.")
        connection_ids: set[str] = set()
        connection_pairs: set[tuple[str, str]] = set()
        known_ids = set(element_ids)
        for connection in self.connections:
            if not connection.connection_id or connection.connection_id in connection_ids:
                raise CanvasDomainError("INVALID_CONNECTION", "Connection IDs must be unique and non-empty.")
            if connection.source_element_id not in known_ids or connection.target_element_id not in known_ids:
                raise CanvasDomainError("INVALID_CONNECTION", "Connection endpoints must reference existing Elements.")
            if connection.source_element_id == connection.target_element_id:
                raise CanvasDomainError("INVALID_CONNECTION", "A Connection cannot point to the same Element.")
            pair = (connection.source_element_id, connection.target_element_id)
            if pair in connection_pairs:
                raise CanvasDomainError("INVALID_CONNECTION", "Duplicate Connections are not allowed.")
            connection_ids.add(connection.connection_id)
            connection_pairs.add(pair)
        for element in elements:
            content_ids = [content.content_id for content in element.contents]
            if len(content_ids) != len(set(content_ids)):
                raise CanvasDomainError("INVALID_CONTENT", "Content IDs must be unique within an Element.")
            if element.contents:
                if element.active_content_id not in content_ids or element.main_content_id not in content_ids:
                    raise CanvasDomainError("INVALID_ELEMENT", "Content pointers must reference existing Content.")
            elif element.active_content_id is not None or element.main_content_id is not None:
                raise CanvasDomainError("INVALID_ELEMENT", "Empty Elements must have null Content pointers.")


@dataclass
class CanvasProject:
    """表示版本和类型已校验的 Canvas 项目。"""

    version: str
    project_type: str
    name: str
    canvas: CanvasDocument
    extra_data: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "CanvasProject":
        """返回当前项目的深拷贝。"""
        return CanvasProject(
            version=self.version,
            project_type=self.project_type,
            name=self.name,
            canvas=self.canvas.clone(),
            extra_data=deepcopy(self.extra_data),
        )
