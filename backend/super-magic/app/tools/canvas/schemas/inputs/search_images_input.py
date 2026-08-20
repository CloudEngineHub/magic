"""Canvas 图片搜索输入。"""

from pydantic import ConfigDict, Field

from app.tools.core import BaseToolParams


class SearchImageTaskInput(BaseToolParams):
    """单个图片搜索任务。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    requirement_explanation: str | None = None
    expected_aspect_ratio: str | None = None
    count: int = Field(3, ge=1, le=20)


class SearchImagesInput(BaseToolParams):
    """批量图片搜索任务。"""

    model_config = ConfigDict(extra="forbid")
    topic_id: str = Field(..., min_length=1)
    tasks: list[SearchImageTaskInput] = Field(..., min_length=1)
