"""magic.project.js 顶层信封编解码器。"""

import json
import re
from typing import Any, Dict


class UnsupportedCanvasVersionError(ValueError):
    """表示 Canvas 文件版本没有对应后端实现。"""


class CanvasEnvelopeCodec:
    """只负责解析和编码 magic.project.js 顶层信封。"""

    _PATTERN = re.compile(
        r"(?:window\.)?magicProjectConfig\s*=\s*({[\s\S]*})\s*;?\s*$"
    )

    @classmethod
    def decode(cls, content: str) -> Dict[str, Any]:
        """把 JSONP 文本解析为顶层信封字典。"""
        match = cls._PATTERN.search(content.strip())
        if not match:
            raise ValueError("Invalid magic.project.js JSONP envelope")
        try:
            envelope = json.loads(match.group(1))
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid magic.project.js JSON: {error}") from error
        if not isinstance(envelope, dict):
            raise ValueError("magic.project.js envelope must be an object")
        return envelope

    @classmethod
    def get_version(cls, content: str) -> str:
        """读取顶层 version，不解压 Canvas。"""
        version = cls.decode(content).get("version")
        if not isinstance(version, str) or not version:
            raise UnsupportedCanvasVersionError("Canvas version is missing")
        return version

    @staticmethod
    def encode(envelope: Dict[str, Any]) -> str:
        """把顶层信封编码为 JSONP 文本。"""
        json_text = json.dumps(envelope, ensure_ascii=False, indent=2)
        return f"window.magicProjectConfig = {json_text};\n"

