"""视频合成命令契约。"""

from dataclasses import dataclass


@dataclass(frozen=True)
class VideoCompositionCommand:
    """描述一次 Video Edit 到结果 Video Element 的合成请求。"""

    video_edit_element_id: str
    result_name: str
    result_element_id: str | None = None
