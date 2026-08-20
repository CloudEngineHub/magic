"""Canvas 主文件写入前的协议字段净化。"""

from __future__ import annotations

from app.tools.canvas.domain.content_fields import ImageContentFields, VideoContentFields
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService


class CanvasMainFileSanitizer:
    """从前端主文件中移除只属于后端 sidecar 的生成请求字段。"""

    def sanitize(self, project: CanvasProject) -> CanvasProject:
        """返回不包含后端托管生成请求的项目副本。"""
        sanitized = project.clone()
        for element in sanitized.canvas.iter_elements():
            for content in element.contents:
                fields = content.fields
                if isinstance(fields, ImageContentFields):
                    fields.generate_image_request = None
                elif isinstance(fields, VideoContentFields):
                    fields.generate_video_request = None
        return sanitized

    def synchronize_sidecar(self, project: CanvasProject, sidecar: dict) -> dict:
        """把仍存在于领域对象中的后端托管字段补入 sidecar。"""
        updated = dict(sidecar)
        for element in project.canvas.iter_elements():
            for content in element.contents:
                managed = self._managed_fields(content.fields)
                if not managed:
                    continue
                detail = ContentMetadataService.get(updated, element.element_id, content.content_id)
                detail.update(managed)
                ContentMetadataService.set(updated, element.element_id, content.content_id, detail)
        return updated

    @staticmethod
    def _managed_fields(fields) -> dict[str, object]:
        """提取不应进入主文件的生成请求字段。"""
        if isinstance(fields, ImageContentFields) and fields.generate_image_request is not None:
            return {"generateImageRequest": fields.generate_image_request}
        if isinstance(fields, VideoContentFields) and fields.generate_video_request is not None:
            return {"generateVideoRequest": fields.generate_video_request}
        return {}
