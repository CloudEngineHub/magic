"""Canvas V3 DSL 编解码与结构校验。"""

from copy import deepcopy
from typing import Any, Dict, List, Optional, Set

from app.tools.design.codec.envelope_codec import CanvasEnvelopeCodec
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.utils.magic_project_compression import (
    compress_canvas_data,
    decompress_canvas_data,
    is_compressed_canvas,
)

MAGIC_PROJECT_VERSION_V3 = "3.0.0"

SUPPORTED_ELEMENT_TYPES: Set[str] = {
    "frame",
    "group",
    "image",
    "text",
    "rectangle",
    "ellipse",
    "triangle",
    "star",
    "video",
    "audio",
    "storyboard",
    "video-edit",
}

BASE_ELEMENT_FIELDS: Set[str] = {
    "id",
    "name",
    "type",
    "visible",
    "locked",
    "opacity",
    "x",
    "y",
    "width",
    "height",
    "scaleX",
    "scaleY",
    "zIndex",
    "interactionConfig",
    "contents",
    "activeContentId",
    "mainContentId",
}

COMMON_CONTENT_FIELDS: Set[str] = {"visualUnderstanding"}
CONTENT_FIELDS_BY_TYPE: Dict[str, Set[str]] = {
    "frame": set(),
    "group": set(),
    "image": {
        "src",
        "status",
        "errorMessage",
        "generateImageRequest",
        "imageGenerationTaskMeta",
        "crop",
    },
    "video": {
        "src",
        "status",
        "errorMessage",
        "generateVideoRequest",
        "videoGenerationResultMeta",
    },
    "audio": {"src"},
    "text": {"content", "defaultStyle"},
    "rectangle": {"fill", "stroke", "strokeWidth", "cornerRadius"},
    "ellipse": {"fill", "stroke", "strokeWidth"},
    "triangle": {"fill", "stroke", "strokeWidth"},
    "star": {"fill", "stroke", "strokeWidth", "cornerRadius", "sides", "innerRadiusRatio"},
    "storyboard": {"generationConfig", "shots"},
    "video-edit": {"videoSequence", "audioSequence", "output"},
}


class V3CanvasCodec:
    """负责 MagicProjectConfigV3 与 V3 JSONP 文本双向转换。"""

    @classmethod
    def decode(cls, content: str) -> MagicProjectConfigV3:
        """解析 V3 magic.project.js，并保留可修复业务告警。"""
        envelope = CanvasEnvelopeCodec.decode(content)
        if envelope.get("version") != MAGIC_PROJECT_VERSION_V3:
            raise ValueError("V3 codec only accepts version 3.0.0")
        if envelope.get("type") != "design":
            raise ValueError("V3 project type must be design")
        name = envelope.get("name")
        if not isinstance(name, str):
            raise ValueError("V3 project name must be a string")
        encoded_canvas = envelope.get("canvas")
        if not is_compressed_canvas(encoded_canvas):
            raise ValueError("V3 canvas must use MAGICPROJECTDESIGNDATA compression")
        canvas_data = decompress_canvas_data(encoded_canvas)
        canvas, validation_warnings = cls.decode_canvas(canvas_data)
        extra_data = {
            key: deepcopy(value)
            for key, value in envelope.items()
            if key not in {"version", "type", "name", "canvas"}
        }
        return MagicProjectConfigV3(
            version=MAGIC_PROJECT_VERSION_V3,
            type="design",
            name=name,
            canvas=canvas,
            extra_data=extra_data,
            validation_warnings=validation_warnings,
        )

    @classmethod
    def encode(cls, config: MagicProjectConfigV3, *, strict: bool = True) -> str:
        """校验并编码 V3 magic.project.js。"""
        if config.version != MAGIC_PROJECT_VERSION_V3:
            raise ValueError("V3 project version must remain 3.0.0")
        if config.type != "design":
            raise ValueError("V3 project type must remain design")
        canvas_data = cls.encode_canvas(config.canvas, strict=strict)
        envelope = {
            **deepcopy(config.extra_data),
            "version": MAGIC_PROJECT_VERSION_V3,
            "type": "design",
            "name": config.name,
            "canvas": compress_canvas_data(canvas_data),
        }
        return CanvasEnvelopeCodec.encode(envelope)

    @classmethod
    def decode_canvas(cls, data: Dict[str, Any]) -> tuple[CanvasDocumentV3, List[str]]:
        """把解压后的 Canvas 字典解析为领域对象并返回可修复告警。"""
        if not isinstance(data, dict):
            raise ValueError("V3 canvas must be an object")
        raw_elements = data.get("elements", [])
        raw_connections = data.get("connections", [])
        if not isinstance(raw_elements, list):
            raise ValueError("V3 canvas.elements must be an array")
        if not isinstance(raw_connections, list):
            raise ValueError("V3 canvas.connections must be an array")

        elements = [cls._decode_element(item, f"elements[{index}]") for index, item in enumerate(raw_elements)]
        connections = [
            cls._decode_connection(item, f"connections[{index}]")
            for index, item in enumerate(raw_connections)
        ]
        canvas = CanvasDocumentV3(
            elements=elements,
            connections=connections,
            extra_data={
                key: deepcopy(value)
                for key, value in data.items()
                if key not in {"elements", "connections"}
            },
        )
        validation_warnings = cls.validate_document(canvas)
        canvas.validation_warnings = validation_warnings
        return canvas, validation_warnings

    @classmethod
    def encode_canvas(cls, canvas: CanvasDocumentV3, *, strict: bool = True) -> Dict[str, Any]:
        """校验并转换为可压缩的 Canvas 字典。"""
        cls.validate_document(canvas, strict=strict)
        return canvas.to_dict()

    @classmethod
    def validate_document(cls, canvas: CanvasDocumentV3, *, strict: bool = False) -> List[str]:
        """校验文档结构，并将可由 Agent 修复的业务问题转换为告警。"""
        warnings: List[str] = []
        all_elements = canvas.iter_elements()
        element_ids = [element.id for element in all_elements]
        if len(set(element_ids)) != len(element_ids):
            raise ValueError("V3 element IDs must be unique")

        for element in all_elements:
            warnings.extend(cls._validate_element(element, strict=strict))

        connection_ids: Set[str] = set()
        connection_pairs: Set[frozenset[str]] = set()
        existing_ids = set(element_ids)
        for connection in canvas.connections:
            if not connection.id or connection.id in connection_ids:
                raise ValueError("V3 connection IDs must be non-empty and unique")
            if connection.source_element_id not in existing_ids:
                raise ValueError(f"Connection source does not exist: {connection.source_element_id}")
            if connection.target_element_id not in existing_ids:
                raise ValueError(f"Connection target does not exist: {connection.target_element_id}")
            if connection.source_element_id == connection.target_element_id:
                raise ValueError("V3 connection must not connect an element to itself")
            pair = frozenset({connection.source_element_id, connection.target_element_id})
            if pair in connection_pairs:
                raise ValueError("V3 duplicate or reverse duplicate connection is not allowed")
            connection_ids.add(connection.id)
            connection_pairs.add(pair)
        return warnings

    @classmethod
    def _decode_element(cls, data: Any, path: str) -> CanvasElementV3:
        """解析单个 V3 Element。"""
        if not isinstance(data, dict):
            raise ValueError(f"{path} must be an object")
        element_id = data.get("id")
        element_type = data.get("type")
        if not isinstance(element_id, str) or not element_id:
            raise ValueError(f"{path}.id must be a non-empty string")
        if element_type not in SUPPORTED_ELEMENT_TYPES:
            raise ValueError(f"{path}.type is unsupported: {element_type}")

        allowed_element_fields = set(BASE_ELEMENT_FIELDS)
        if element_type in {"frame", "group"}:
            allowed_element_fields.add("children")
        unexpected_fields = set(data) - allowed_element_fields
        if unexpected_fields:
            raise ValueError(f"{path} contains unsupported fields: {sorted(unexpected_fields)}")

        raw_contents = data.get("contents")
        if not isinstance(raw_contents, list):
            raise ValueError(f"{path}.contents must be an array")
        contents = [ElementContent.from_dict(item) for item in raw_contents]
        content_ids = [content.content_id for content in contents]
        if len(set(content_ids)) != len(content_ids):
            raise ValueError(f"{path}.contents contains duplicate contentId")

        active_content_id = data.get("activeContentId")
        main_content_id = data.get("mainContentId")
        if contents:
            if active_content_id not in content_ids:
                raise ValueError(f"{path}.activeContentId must reference an existing Content")
            if main_content_id not in content_ids:
                raise ValueError(f"{path}.mainContentId must reference an existing Content")
        elif active_content_id is not None or main_content_id is not None:
            raise ValueError(f"{path} empty contents requires null active/main pointers")

        children: Optional[List[CanvasElementV3]] = None
        if element_type in {"frame", "group"}:
            raw_children = data.get("children")
            if raw_children is not None:
                if not isinstance(raw_children, list):
                    raise ValueError(f"{path}.children must be an array")
                children = [
                    cls._decode_element(child, f"{path}.children[{index}]")
                    for index, child in enumerate(raw_children)
                ]

        properties = {
            key: deepcopy(value)
            for key, value in data.items()
            if key not in {"id", "type", "contents", "activeContentId", "mainContentId", "children"}
        }
        element = CanvasElementV3(
            id=element_id,
            type=element_type,
            contents=contents,
            active_content_id=active_content_id,
            main_content_id=main_content_id,
            properties=properties,
            children=children,
        )
        cls._validate_element(element, strict=False)
        return element

    @classmethod
    def _decode_connection(cls, data: Any, path: str) -> CanvasConnection:
        """解析单个 V3 Connection。"""
        if not isinstance(data, dict):
            raise ValueError(f"{path} must be an object")
        unexpected_fields = set(data) - {"id", "sourceElementId", "targetElementId", "locked"}
        if unexpected_fields:
            raise ValueError(f"{path} contains unsupported fields: {sorted(unexpected_fields)}")
        for field_name in ("id", "sourceElementId", "targetElementId"):
            if not isinstance(data.get(field_name), str) or not data[field_name]:
                raise ValueError(f"{path}.{field_name} must be a non-empty string")
        locked = data.get("locked", False)
        if not isinstance(locked, bool):
            raise ValueError(f"{path}.locked must be a boolean")
        return CanvasConnection(
            id=data["id"],
            source_element_id=data["sourceElementId"],
            target_element_id=data["targetElementId"],
            locked=locked,
        )

    @classmethod
    def _validate_element(cls, element: CanvasElementV3, *, strict: bool = True) -> List[str]:
        """校验单个 V3 Element 与 Content 字段，并返回业务告警。"""
        warnings: List[str] = []
        if not element.id:
            raise ValueError("V3 element id must be non-empty")
        if element.type not in SUPPORTED_ELEMENT_TYPES:
            raise ValueError(f"Unsupported V3 element type: {element.type}")
        cls._validate_properties(element)

        content_ids = [content.content_id for content in element.contents]
        if len(set(content_ids)) != len(content_ids):
            raise ValueError(f"Element {element.id} contains duplicate contentId")
        if content_ids:
            if element.active_content_id not in content_ids:
                raise ValueError(f"Element {element.id} has invalid activeContentId")
            if element.main_content_id not in content_ids:
                raise ValueError(f"Element {element.id} has invalid mainContentId")
        elif element.active_content_id is not None or element.main_content_id is not None:
            raise ValueError(f"Element {element.id} empty contents requires null pointers")

        allowed_content_fields = COMMON_CONTENT_FIELDS | CONTENT_FIELDS_BY_TYPE[element.type]
        for content in element.contents:
            unexpected_fields = set(content.fields) - allowed_content_fields
            if unexpected_fields:
                raise ValueError(
                    f"Element {element.id} Content {content.content_id} contains unsupported fields: "
                    f"{sorted(unexpected_fields)}"
                )
            warnings.extend(cls._validate_content(element.type, content, strict=strict))

        if element.type not in {"frame", "group"} and element.children is not None:
            raise ValueError(f"Element {element.id} type {element.type} must not contain children")
        return warnings

    @staticmethod
    def _validate_properties(element: CanvasElementV3) -> None:
        """校验 Element 外壳字段类型。"""
        numeric_fields = {"opacity", "x", "y", "width", "height", "scaleX", "scaleY", "zIndex"}
        for field_name in numeric_fields:
            value = element.properties.get(field_name)
            if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool)):
                raise ValueError(f"Element {element.id}.{field_name} must be numeric")
        for field_name in {"visible", "locked"}:
            value = element.properties.get(field_name)
            if value is not None and not isinstance(value, bool):
                raise ValueError(f"Element {element.id}.{field_name} must be boolean")
        name = element.properties.get("name")
        if name is not None and not isinstance(name, str):
            raise ValueError(f"Element {element.id}.name must be a string")
        interaction_config = element.properties.get("interactionConfig")
        if interaction_config is not None and not isinstance(interaction_config, dict):
            raise ValueError(f"Element {element.id}.interactionConfig must be an object")

    @classmethod
    def _validate_content(cls, element_type: str, content: ElementContent, *, strict: bool = True) -> List[str]:
        """校验类型相关的 Content 字段，并返回可修复业务告警。"""
        warnings: List[str] = []
        fields = content.fields
        for field_name in ("src", "status", "errorMessage", "fill", "stroke"):
            value = fields.get(field_name)
            if value is not None and not isinstance(value, str):
                raise ValueError(f"Content {content.content_id}.{field_name} must be a string")

        for field_name in ("strokeWidth", "cornerRadius", "sides", "innerRadiusRatio"):
            value = fields.get(field_name)
            if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool)):
                raise ValueError(f"Content {content.content_id}.{field_name} must be numeric")

        crop = fields.get("crop")
        if crop is not None:
            if not isinstance(crop, dict):
                raise ValueError(f"Content {content.content_id}.crop must be an object")
            for field_name in ("width", "height", "x", "y"):
                value = crop.get(field_name)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    raise ValueError(f"Content {content.content_id}.crop.{field_name} must be numeric")

        if element_type == "text":
            if fields.get("content") is not None and not isinstance(fields["content"], list):
                raise ValueError(f"Content {content.content_id}.content must be an array")
            if fields.get("defaultStyle") is not None and not isinstance(fields["defaultStyle"], dict):
                raise ValueError(f"Content {content.content_id}.defaultStyle must be an object")
        elif element_type == "storyboard":
            warnings.extend(cls._validate_storyboard_content(content, strict=strict))
        elif element_type == "video-edit":
            cls._validate_video_edit_content(content)
        return warnings

    @staticmethod
    def _validate_storyboard_content(content: ElementContent, *, strict: bool = True) -> List[str]:
        """校验 Storyboard Content，并报告非法镜头时长。"""
        warnings: List[str] = []
        fields = content.fields
        generation_config = fields.get("generationConfig")
        if generation_config is not None and not isinstance(generation_config, dict):
            raise ValueError(f"Content {content.content_id}.generationConfig must be an object")
        shots = fields.get("shots")
        if shots is None:
            return warnings
        if not isinstance(shots, list):
            raise ValueError(f"Content {content.content_id}.shots must be an array")
        shot_ids: Set[str] = set()
        output_ids: Set[str] = set()
        for shot in shots:
            if not isinstance(shot, dict):
                raise ValueError(f"Content {content.content_id} shot must be an object")
            shot_id = shot.get("id")
            duration = shot.get("durationSeconds")
            description = shot.get("description")
            output_id = shot.get("outputImageElementId")
            if not isinstance(shot_id, str) or not shot_id or shot_id in shot_ids:
                raise ValueError(f"Content {content.content_id} shot id must be unique")
            if not isinstance(duration, (int, float)) or isinstance(duration, bool) or duration <= 0:
                message = (
                    f"Content {content.content_id} shot {shot_id or '<unknown>'} "
                    "durationSeconds must be positive; update this Storyboard Content before generation."
                )
                if strict:
                    raise ValueError(message)
                warnings.append(message)
            if not isinstance(description, str):
                raise ValueError(f"Content {content.content_id} shot description must be a string")
            if output_id is not None:
                if not isinstance(output_id, str) or not output_id or output_id in output_ids:
                    raise ValueError(f"Content {content.content_id} shot outputImageElementId must be unique")
                output_ids.add(output_id)
            shot_ids.add(shot_id)
        return warnings

    @staticmethod
    def _validate_video_edit_content(content: ElementContent) -> None:
        """校验 Video Edit Content。"""
        fields = content.fields
        for field_name in ("videoSequence", "audioSequence"):
            sequence = fields.get(field_name)
            if not isinstance(sequence, list):
                raise ValueError(f"Content {content.content_id}.{field_name} must be an array")
            if any(not isinstance(item, str) or not item for item in sequence):
                raise ValueError(f"Content {content.content_id}.{field_name} must contain non-empty IDs")
            if len(set(sequence)) != len(sequence):
                raise ValueError(f"Content {content.content_id}.{field_name} must not contain duplicates")
        output = fields.get("output")
        if output is not None:
            if not isinstance(output, dict):
                raise ValueError(f"Content {content.content_id}.output must be an object")
            for field_name in ("aspectRatio", "resolution", "format"):
                value = output.get(field_name)
                if value is not None and not isinstance(value, str):
                    raise ValueError(f"Content {content.content_id}.output.{field_name} must be a string")
