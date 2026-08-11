"""画布元素稳定查询模型。"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class CanvasContentView:
    """表示跨版本查询结果中的一个 Content 视图。"""

    content_id: Optional[str]
    fields: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CanvasElementView:
    """表示跨版本稳定查询结果中的一个 Element。"""

    element_id: str
    element_type: str
    name: str
    active_content_id: Optional[str]
    main_content_id: Optional[str]
    contents: List[CanvasContentView]
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CanvasConnectionView:
    """表示查询结果中的 Element 级 Connection。"""

    connection_id: str
    source_element_id: str
    target_element_id: str
    locked: bool


@dataclass(frozen=True)
class CanvasQueryResult:
    """表示一次跨版本批量画布查询结果。"""

    version: str
    elements: List[CanvasElementView]
    connections: List[CanvasConnectionView]
    missing_element_ids: List[str]
