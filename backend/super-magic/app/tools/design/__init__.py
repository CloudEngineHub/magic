"""
Design mode tools for magic project canvas manipulation.
"""

from app.tools.design.manager import CanvasManager, CanvasStatistics, ElementQuery
from app.tools.design.tools import (
    BaseDesignTool,
    ComposeCanvasVideo,
    ConfigureVideoEdit,
    CreateCanvas,
    GenerateCanvasImages,
    GenerateCanvasVideos,
    GenerateVideoProductionImages,
    GenerateVideoProductionVideos,
    PromoteCanvasContent,
    QueryCanvasElements,
    RestoreCanvasMedia,
    SearchCanvasImages,
    SearchImagePrompts,
    UpsertCanvasAudio,
    UpsertStoryboard,
)

__all__ = [
    "BaseDesignTool",
    "CanvasManager",
    "CanvasStatistics",
    "ComposeCanvasVideo",
    "ConfigureVideoEdit",
    "CreateCanvas",
    "ElementQuery",
    "GenerateCanvasImages",
    "GenerateCanvasVideos",
    "GenerateVideoProductionImages",
    "GenerateVideoProductionVideos",
    "PromoteCanvasContent",
    "QueryCanvasElements",
    "RestoreCanvasMedia",
    "SearchCanvasImages",
    "SearchImagePrompts",
    "UpsertCanvasAudio",
    "UpsertStoryboard",
]
