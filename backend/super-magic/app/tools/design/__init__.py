"""旧 Design Canvas 工具包。

本包已被 ``app.tools.canvas`` 和 ``canvas-manager`` Skill 替代，仅保留当前版本
的兼容导出。下一版本删除前，不应新增对本包的生产依赖。
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
    ImportCanvasAssets,
    PromoteCanvasContent,
    QueryCanvasElements,
    GetCanvasOverview,
    RepairVideoProductionConnections,
    RestoreCanvasMedia,
    SearchCanvasImages,
    SearchImagePrompts,
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
    "ImportCanvasAssets",
    "PromoteCanvasContent",
    "QueryCanvasElements",
    "GetCanvasOverview",
    "RepairVideoProductionConnections",
    "RestoreCanvasMedia",
    "SearchCanvasImages",
    "SearchImagePrompts",
    "UpsertStoryboard",
]
