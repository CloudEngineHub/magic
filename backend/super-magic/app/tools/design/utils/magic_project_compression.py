"""Magic Project canvas 压缩协议

只负责 magic.project.js 中 canvas 子对象的 MAGICPROJECTDESIGNDATA:// 编解码。

协议格式：
    MAGICPROJECTDESIGNDATA://[base64(gzip(json(canvas_obj)))]

被编码的对象是 canvas 子对象（含 elements / viewport / 前端扩展字段），
不是整份 magic project config。信封字段（version / type / name）保持明文。
"""

import base64
import gzip
import json
from typing import Any, Dict

from agentlang.logger import get_logger

logger = get_logger(__name__)

# canvas 压缩协议前缀
MAGIC_PROJECT_DESIGN_DATA_PREFIX = "MAGICPROJECTDESIGNDATA://"


def compress_canvas_data(canvas: Dict[str, Any]) -> str:
    """将 canvas 对象压缩为协议字符串。

    Args:
        canvas: canvas 子对象字典

    Returns:
        MAGICPROJECTDESIGNDATA:// 开头的协议字符串
    """
    json_str = json.dumps(canvas, ensure_ascii=False, separators=(",", ":"))
    compressed = gzip.compress(json_str.encode("utf-8"))
    encoded = base64.b64encode(compressed).decode("ascii")
    return f"{MAGIC_PROJECT_DESIGN_DATA_PREFIX}{encoded}"


def decompress_canvas_data(encoded: str) -> Dict[str, Any]:
    """将协议字符串解压为 canvas 对象。

    Args:
        encoded: MAGICPROJECTDESIGNDATA:// 开头的协议字符串

    Returns:
        解压后的 canvas 子对象字典

    Raises:
        ValueError: 字符串不是合法的压缩协议格式或解压失败
    """
    if not is_compressed_canvas(encoded):
        raise ValueError(
            f"Not a compressed canvas string, expected prefix {MAGIC_PROJECT_DESIGN_DATA_PREFIX}"
        )

    payload = encoded[len(MAGIC_PROJECT_DESIGN_DATA_PREFIX):]
    try:
        compressed = base64.b64decode(payload)
        json_bytes = gzip.decompress(compressed)
        canvas = json.loads(json_bytes.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"Failed to decompress canvas data: {e}") from e

    if not isinstance(canvas, dict):
        raise ValueError(
            f"Decompressed canvas must be an object, got {type(canvas).__name__}"
        )
    return canvas


def is_compressed_canvas(value: Any) -> bool:
    """判断一个 canvas 值是否为 MAGICPROJECTDESIGNDATA:// 压缩字符串。"""
    return isinstance(value, str) and value.startswith(MAGIC_PROJECT_DESIGN_DATA_PREFIX)
