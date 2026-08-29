"""Canvas 3.0 主文件编解码器。

该模块独立实现前后端约定的 3.0 格式，不依赖旧 Design Canvas 代码。
"""

from __future__ import annotations

import base64
import gzip
import json
import re
from copy import deepcopy
from typing import Any

from app.tools.canvas.domain.content_fields import ContentFieldsFactory
from app.tools.canvas.domain.errors import CanvasProtocolError
from app.tools.canvas.domain.models import (
    CanvasConnection,
    CanvasContent,
    CanvasDocument,
    CanvasElement,
    CanvasProject,
    ElementProperties,
)
from app.tools.canvas.domain.protocol import BASE_ELEMENT_FIELDS, CONTENT_FIELDS, SUPPORTED_ELEMENT_TYPES

MAGIC_PROJECT_VERSION = "3.0.0"
MAGIC_PROJECT_TYPE = "design"
CANVAS_PREFIX = "MAGICPROJECTDESIGNDATA://"

_ENVELOPE_PATTERN = re.compile(r"(?:window\.)?magicProjectConfig\s*=\s*(\{.*\})\s*;?\s*$", re.DOTALL)


class CanvasCodec:
    """负责 3.0 magic.project.js 文本和领域对象之间的转换。"""

    @classmethod
    def decode(cls, source: str) -> CanvasProject:
        """解码并严格校验 3.0 项目。"""
        try:
            match = _ENVELOPE_PATTERN.search(source.strip())
            if match is None:
                raise ValueError("magic.project.js does not contain a JSON project envelope")
            envelope = json.loads(match.group(1))
        except (json.JSONDecodeError, ValueError) as exc:
            raise CanvasProtocolError("INVALID_CANVAS_DOCUMENT", str(exc)) from exc
        if envelope.get("version") != MAGIC_PROJECT_VERSION:
            raise CanvasProtocolError("UNSUPPORTED_CANVAS_VERSION", "Only the current Canvas project format is supported.")
        if envelope.get("type") != MAGIC_PROJECT_TYPE:
            raise CanvasProtocolError("INVALID_CANVAS_PROJECT_TYPE", "Only design Canvas projects are supported.")
        name = envelope.get("name")
        if not isinstance(name, str):
            raise CanvasProtocolError("INVALID_CANVAS_DOCUMENT", "Project name must be a string.")
        encoded_canvas = envelope.get("canvas")
        if not isinstance(encoded_canvas, str) or not encoded_canvas.startswith(CANVAS_PREFIX):
            raise CanvasProtocolError("INVALID_CANVAS_COMPRESSION", "Canvas data uses an unsupported encoding.")
        try:
            raw = base64.b64decode(encoded_canvas[len(CANVAS_PREFIX):], validate=True)
            canvas_data = json.loads(gzip.decompress(raw).decode("utf-8"))
        except (ValueError, OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise CanvasProtocolError("INVALID_CANVAS_COMPRESSION", "Canvas data could not be decoded.") from exc
        project = CanvasProject(
            version=MAGIC_PROJECT_VERSION,
            project_type=MAGIC_PROJECT_TYPE,
            name=name,
            canvas=cls._decode_document(canvas_data),
            extra_data={key: deepcopy(value) for key, value in envelope.items() if key not in {"version", "type", "name", "canvas"}},
        )
        project.canvas.validate()
        return project

    @classmethod
    def encode(cls, project: CanvasProject) -> str:
        """校验并编码 3.0 项目。"""
        if project.version != MAGIC_PROJECT_VERSION:
            raise CanvasProtocolError("UNSUPPORTED_CANVAS_VERSION", "Only the current Canvas project format is supported.")
        if project.project_type != MAGIC_PROJECT_TYPE:
            raise CanvasProtocolError("INVALID_CANVAS_PROJECT_TYPE", "Only design Canvas projects are supported.")
        project.canvas.validate()
        payload = json.dumps(project.canvas.to_dict(), ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        encoded = CANVAS_PREFIX + base64.b64encode(gzip.compress(payload)).decode("ascii")
        envelope = {
            **deepcopy(project.extra_data),
            "version": MAGIC_PROJECT_VERSION,
            "type": MAGIC_PROJECT_TYPE,
            "name": project.name,
            "canvas": encoded,
        }
        return f"window.magicProjectConfig = {json.dumps(envelope, ensure_ascii=False, separators=(',', ':'))};\n"

    @classmethod
    def empty_project(cls, name: str) -> CanvasProject:
        """创建空的合法 3.0 项目。"""
        return CanvasProject(MAGIC_PROJECT_VERSION, MAGIC_PROJECT_TYPE, name, CanvasDocument())

    @classmethod
    def _decode_document(cls, data: Any) -> CanvasDocument:
        """解码 Canvas 文档主体。"""
        if not isinstance(data, dict):
            raise CanvasProtocolError("INVALID_CANVAS_DOCUMENT", "Canvas data must be an object.")
        elements = data.get("elements", [])
        connections = data.get("connections", [])
        if not isinstance(elements, list) or not isinstance(connections, list):
            raise CanvasProtocolError("INVALID_CANVAS_DOCUMENT", "Canvas elements and connections must be arrays.")
        return CanvasDocument(
            elements=[cls._decode_element(item, f"elements[{index}]") for index, item in enumerate(elements)],
            connections=[cls._decode_connection(item, f"connections[{index}]") for index, item in enumerate(connections)],
            extra_data={key: deepcopy(value) for key, value in data.items() if key not in {"elements", "connections"}},
        )

    @classmethod
    def _decode_element(cls, data: Any, path: str) -> CanvasElement:
        """解码单个 Element 并拒绝未知字段。"""
        if not isinstance(data, dict):
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path} must be an object.")
        element_id = data.get("id")
        element_type = data.get("type")
        if not isinstance(element_id, str) or not element_id:
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path}.id must be a non-empty string.")
        if element_type not in SUPPORTED_ELEMENT_TYPES:
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path}.type is unsupported.")
        allowed = BASE_ELEMENT_FIELDS | ({"children"} if element_type in {"frame", "group"} else set())
        unexpected = set(data) - allowed
        if unexpected:
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path} contains unsupported fields.")
        raw_contents = data.get("contents")
        if not isinstance(raw_contents, list):
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path}.contents must be an array.")
        contents = [cls._decode_content(item, element_type, f"{path}.contents[{index}]") for index, item in enumerate(raw_contents)]
        content_ids = [content.content_id for content in contents]
        active = data.get("activeContentId")
        main = data.get("mainContentId")
        if contents and (active not in content_ids or main not in content_ids):
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path} Content pointers must reference existing Content.")
        if not contents and (active is not None or main is not None):
            raise CanvasProtocolError("INVALID_ELEMENT", f"{path} empty contents require null pointers.")
        children = None
        if element_type in {"frame", "group"} and "children" in data:
            raw_children = data["children"]
            if not isinstance(raw_children, list):
                raise CanvasProtocolError("INVALID_ELEMENT", f"{path}.children must be an array.")
            children = [cls._decode_element(item, f"{path}.children[{index}]") for index, item in enumerate(raw_children)]
        properties = ElementProperties.from_dict({
            key: value
            for key, value in data.items()
            if key not in {"id", "type", "contents", "activeContentId", "mainContentId", "children"}
        })
        return CanvasElement(element_id, element_type, properties, contents, active, main, children)

    @classmethod
    def _decode_content(cls, data: Any, element_type: str, path: str) -> CanvasContent:
        """解码 Element Content 并检查类型字段。"""
        if not isinstance(data, dict):
            raise CanvasProtocolError("INVALID_CONTENT", f"{path} must be an object.")
        content_id = data.get("contentId")
        if not isinstance(content_id, str) or not content_id or "id" in data or "type" in data:
            raise CanvasProtocolError("INVALID_CONTENT", f"{path} has an invalid contentId or forbidden field.")
        allowed = CONTENT_FIELDS[element_type] | {"contentId"}
        if set(data) - allowed:
            raise CanvasProtocolError("INVALID_CONTENT", f"{path} contains unsupported fields.")
        fields = ContentFieldsFactory.from_protocol(
            element_type,
            {key: deepcopy(value) for key, value in data.items() if key != "contentId"},
        )
        return CanvasContent(content_id, fields)

    @staticmethod
    def _decode_connection(data: Any, path: str) -> CanvasConnection:
        """解码一条 Element Connection。"""
        if not isinstance(data, dict):
            raise CanvasProtocolError("INVALID_CONNECTION", f"{path} must be an object.")
        if set(data) != {"id", "sourceElementId", "targetElementId"}:
            raise CanvasProtocolError("INVALID_CONNECTION", f"{path} contains unsupported fields.")
        values = (data.get("id"), data.get("sourceElementId"), data.get("targetElementId"))
        if not all(isinstance(value, str) and value for value in values):
            raise CanvasProtocolError("INVALID_CONNECTION", f"{path} contains invalid identifiers.")
        return CanvasConnection(*values)
