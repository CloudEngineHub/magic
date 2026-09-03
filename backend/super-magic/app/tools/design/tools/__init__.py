"""旧 Design 工具实现，仅用于当前版本兼容。

新的 Canvas Agent 工具统一位于 ``app.tools.canvas``；本模块计划在下一版本删除。
"""

from app.tools.design.tools.base_design_tool import BaseDesignTool
from app.tools.design.tools.compose_canvas_video import ComposeCanvasVideo
from app.tools.design.tools.configure_video_edit import ConfigureVideoEdit
from app.tools.design.tools.create_canvas import CreateCanvas
from app.tools.design.tools.generate_canvas_images import GenerateCanvasImages
from app.tools.design.tools.generate_canvas_videos import GenerateCanvasVideos
from app.tools.design.tools.generate_video_production_images import GenerateVideoProductionImages
from app.tools.design.tools.generate_video_production_videos import GenerateVideoProductionVideos
from app.tools.design.tools.import_canvas_assets import ImportCanvasAssets
from app.tools.design.tools.promote_canvas_content import PromoteCanvasContent
from app.tools.design.tools.query_canvas_elements import QueryCanvasElements
from app.tools.design.tools.get_canvas_overview import GetCanvasOverview
from app.tools.design.tools.repair_video_production_connections import (
    RepairVideoProductionConnections,
)
from app.tools.design.tools.restore_canvas_media import RestoreCanvasMedia
from app.tools.design.tools.search_canvas_images import SearchCanvasImages
from app.tools.design.tools.search_image_prompts import SearchImagePrompts
from app.tools.design.tools.upsert_storyboard import UpsertStoryboard

__all__ = [
    "BaseDesignTool",
    "ComposeCanvasVideo",
    "ConfigureVideoEdit",
    "CreateCanvas",
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
