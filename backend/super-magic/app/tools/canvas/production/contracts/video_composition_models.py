"""视频合成规则的强类型领域输入和准备结果。"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CompositionInputSpec:
    """描述 Video Edit 主 Content 解析出的有序媒体输入。"""

    video_edit_element_id: str
    video_element_ids: tuple[str, ...]
    video_sources: tuple[str, ...]
    audio_element_id: str | None
    audio_source: str | None
    output_width: int
    output_height: int
    audio_policy: str


@dataclass(frozen=True)
class CompositionPreparation:
    """描述已创建 processing Video Content 的一次合成尝试。"""

    result_element_id: str
    result_content_id: str
    relative_output_path: str
    input_spec: CompositionInputSpec
    previous_active_content_id: str | None
    previous_main_content_id: str | None
