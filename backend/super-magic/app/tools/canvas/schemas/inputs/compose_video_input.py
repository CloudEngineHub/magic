"""Canvas 视频合成输入。"""

from pydantic import ConfigDict, Field

from app.tools.core import BaseToolParams


class ComposeVideoInput(BaseToolParams):
    """描述 Video Edit 到最终 Video Element 的合成目标。"""

    model_config = ConfigDict(extra="forbid")
    video_edit_element_id: str = Field(..., min_length=1)
    result_name: str = Field(..., min_length=1, max_length=200)
    result_element_id: str | None = None
