"""旧 Design Canvas 领域模型，仅保留兼容读取和旧工具使用。

本模块计划在下一版本随 ``app.tools.design`` 一并删除。
"""

from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.query import (
    CanvasConnectionView,
    CanvasContentView,
    CanvasElementView,
    CanvasQueryResult,
)

__all__ = [
    "CanvasConnection",
    "CanvasConnectionView",
    "CanvasContentView",
    "CanvasDocumentV3",
    "CanvasElementV3",
    "CanvasElementView",
    "CanvasQueryResult",
    "ElementContent",
    "MagicProjectConfigV3",
]
