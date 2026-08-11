"""设计画布领域模型。"""

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
