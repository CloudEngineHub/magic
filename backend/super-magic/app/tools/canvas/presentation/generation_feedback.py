"""Canvas 生成类工具的用户反馈构建。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from agentlang.tools.tool_result import ToolResult
from app.i18n import i18n


@dataclass
class GenerationMediaCounts:
    """记录一种媒体类型在本次批量操作中的状态数量。"""

    media_type: str
    total: int = 0
    completed: int = 0
    processing: int = 0
    failed: int = 0


@dataclass
class GenerationFeedbackSummary:
    """记录生成反馈需要的图片、视频分类统计。"""

    by_type: dict[str, GenerationMediaCounts]

    @property
    def media_types(self) -> tuple[str, ...]:
        """返回按稳定顺序排列的媒体类型。"""
        return tuple(media_type for media_type in ("image", "video") if media_type in self.by_type)

    @property
    def total(self) -> int:
        """返回生成任务总数。"""
        return sum(item.total for item in self.by_type.values())

    @property
    def is_supported(self) -> bool:
        """判断本次操作是否是纯图片/视频生成批次。"""
        return bool(self.by_type) and all(media_type in {"image", "video"} for media_type in self.by_type)

    @property
    def is_mixed(self) -> bool:
        """判断本次批次是否同时包含图片和视频。"""
        return len(self.media_types) > 1

    def media_label(self) -> str:
        """返回详情中使用的媒体类型名称。"""
        if self.media_types == ("image",):
            return i18n.translate("canvas.media.image", category="tool.messages")
        if self.media_types == ("video",):
            return i18n.translate("canvas.media.video", category="tool.messages")
        return i18n.translate("canvas.media.image_video", category="tool.messages")


class CanvasGenerationFeedback:
    """根据生成参数和结果统一构建 Canvas 的 action、remark 与 detail 数据。"""

    _GENERATED_SOURCES = {"generated"}
    _MEDIA_TYPES = {"image", "video"}
    _COMPLETED_STATUSES = {"added", "completed"}
    _PROCESSING_STATUSES = {"pending", "processing"}
    _FAILED_STATUSES = {"failed", "error", "not_found"}

    @classmethod
    def from_arguments(cls, arguments: Mapping[str, Any] | None) -> GenerationFeedbackSummary:
        """从工具调用参数统计生成媒体类型和任务总数。"""
        return cls._summarize(arguments=arguments, result_items=None)

    @classmethod
    def is_pure_generated_batch(cls, arguments: Mapping[str, Any] | None) -> bool:
        """判断批次是否全部由图片或视频生成 Content 组成。"""
        items = cls._argument_items(arguments)
        if not items:
            return False
        return all(
            isinstance(item.get("content"), Mapping)
            and item["content"].get("source") in cls._GENERATED_SOURCES
            and item["content"].get("content_type") in cls._MEDIA_TYPES
            for item in items
        )

    @classmethod
    def from_result(
        cls,
        result: ToolResult,
        arguments: Mapping[str, Any] | None,
    ) -> GenerationFeedbackSummary:
        """结合工具结果和原始参数统计成功、处理中、失败数量。"""
        data = result.data or {}
        result_items = data.get("items") if isinstance(data, dict) else None
        return cls._summarize(arguments=arguments, result_items=result_items)

    @classmethod
    def action_key(cls, summary: GenerationFeedbackSummary, *, pending: bool = False) -> str:
        """返回当前生成阶段对应的国际化 action 键。"""
        if summary.media_types == ("image",):
            return "canvas.generate_image_ing" if pending else "canvas.generate_image"
        if summary.media_types == ("video",):
            return "canvas.generate_video_ing" if pending else "canvas.generate_video"
        return "canvas.generate_media_ing" if pending else "canvas.generate_media"

    @classmethod
    def remark(
        cls,
        summary: GenerationFeedbackSummary,
        *,
        pending: bool = False,
    ) -> str:
        """将统计结果转换成用户可读的生成反馈。"""
        if pending:
            return cls._pending_remark(summary)
        segments = []
        for media_type in summary.media_types:
            counts = summary.by_type[media_type]
            label = cls._media_label(media_type)
            for key, count in (
                ("completed", counts.completed),
                ("processing", counts.processing),
                ("failed", counts.failed),
            ):
                if count:
                    segments.append(
                        i18n.translate(
                            f"canvas.generate_status.{key}",
                            category="tool.messages",
                            count=count,
                            media=label,
                        )
                    )
        if not segments:
            return i18n.translate("canvas.operation_failed", category="tool.messages")
        return "；".join(segments)

    @classmethod
    def failure_remark(cls, summary: GenerationFeedbackSummary) -> str:
        """构建整批生成调用失败时的具体媒体反馈。"""
        segments = []
        for media_type in summary.media_types:
            counts = summary.by_type[media_type]
            segments.append(
                i18n.translate(
                    "canvas.generate_status.failed",
                    category="tool.messages",
                    count=counts.total,
                    media=cls._media_label(media_type),
                )
            )
        return "；".join(segments) or i18n.translate("canvas.operation_failed", category="tool.messages")

    @classmethod
    def detail_title_key(cls, summary: GenerationFeedbackSummary) -> str:
        """返回生成详情标题对应的国际化键。"""
        if summary.media_types == ("image",):
            return "generated_images"
        if summary.media_types == ("video",):
            return "generated_videos"
        return "generated_media"

    @classmethod
    def media_type_for_item(
        cls,
        item: Mapping[str, Any],
        arguments: Mapping[str, Any] | None,
    ) -> str | None:
        """根据结果项的 item_ref 找回原始生成媒体类型。"""
        direct_type = item.get("content_type") or item.get("type") or item.get("media_type")
        if direct_type in cls._MEDIA_TYPES:
            return str(direct_type)
        item_ref = item.get("item_ref")
        for argument_item in cls._argument_items(arguments):
            if argument_item.get("item_ref") != item_ref:
                continue
            content = argument_item.get("content")
            if isinstance(content, Mapping) and content.get("source") in cls._GENERATED_SOURCES:
                media_type = content.get("content_type")
                return str(media_type) if media_type in cls._MEDIA_TYPES else None
        return None

    @classmethod
    def _summarize(
        cls,
        *,
        arguments: Mapping[str, Any] | None,
        result_items: Any,
    ) -> GenerationFeedbackSummary:
        """按参数建立类型索引，并按结果状态累计数量。"""
        type_by_ref = cls._type_by_item_ref(arguments)
        counts: dict[str, GenerationMediaCounts] = {}

        if result_items is None:
            for media_type in type_by_ref.values():
                counts.setdefault(media_type, GenerationMediaCounts(media_type)).total += 1
            return GenerationFeedbackSummary(counts)

        for item in result_items if isinstance(result_items, list) else []:
            if not isinstance(item, Mapping):
                continue
            media_type = cls.media_type_for_item(item, arguments)
            if media_type not in cls._MEDIA_TYPES:
                continue
            current = counts.setdefault(media_type, GenerationMediaCounts(media_type))
            current.total += 1
            status = str(item.get("status") or "").lower()
            if status in cls._COMPLETED_STATUSES:
                current.completed += 1
            elif status in cls._PROCESSING_STATUSES:
                current.processing += 1
            else:
                current.failed += 1
        return GenerationFeedbackSummary(counts)

    @classmethod
    def _type_by_item_ref(cls, arguments: Mapping[str, Any] | None) -> dict[str, str]:
        """收集纯 generated 图片/视频参数，排除导入和用户内容。"""
        result: dict[str, str] = {}
        for item in cls._argument_items(arguments):
            content = item.get("content")
            if not isinstance(content, Mapping) or content.get("source") not in cls._GENERATED_SOURCES:
                continue
            media_type = content.get("content_type")
            item_ref = item.get("item_ref")
            if media_type in cls._MEDIA_TYPES and item_ref:
                result[str(item_ref)] = str(media_type)
        return result

    @staticmethod
    def _argument_items(arguments: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
        """读取批量工具的 items 参数。"""
        items = arguments.get("items") if isinstance(arguments, Mapping) else None
        return [item for item in items if isinstance(item, Mapping)] if isinstance(items, list) else []

    @staticmethod
    def _media_label(media_type: str) -> str:
        """翻译图片或视频的用户展示名称。"""
        return i18n.translate(f"canvas.media.{media_type}", category="tool.messages")

    @classmethod
    def media_label_for_type(cls, media_type: str) -> str:
        """返回单个媒体类型的用户展示名称。"""
        return cls._media_label(media_type)

    @classmethod
    def _pending_remark(cls, summary: GenerationFeedbackSummary) -> str:
        """构建生成提交阶段的待处理提示。"""
        segments = []
        for media_type in summary.media_types:
            counts = summary.by_type[media_type]
            segments.append(
                i18n.translate(
                    "canvas.generate_pending",
                    category="tool.messages",
                    total=counts.total,
                    media=cls._media_label(media_type),
                )
            )
        return "；".join(segments)
