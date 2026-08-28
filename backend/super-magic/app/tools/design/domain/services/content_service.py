"""Element Content 领域服务。"""

from typing import Any, Dict, Optional

from app.tools.design.domain.canvas_document import CanvasElementV3
from app.tools.design.domain.content import ElementContent


class ContentService:
    """集中维护 Content 列表和 active/main 指针不变量。"""

    @staticmethod
    def append_content(
        element: CanvasElementV3,
        content: ElementContent,
        *,
        activate: bool = True,
        set_main_when_empty: bool = True,
    ) -> ElementContent:
        """追加 Content，并按参数更新 active/main 指针。"""
        if element.get_content(content.content_id) is not None:
            raise ValueError(f"Duplicate contentId: {content.content_id}")
        was_empty = not element.contents
        element.contents.append(content)
        if activate or element.active_content_id is None:
            element.active_content_id = content.content_id
        if set_main_when_empty and (was_empty or element.main_content_id is None):
            element.main_content_id = content.content_id
        return content

    @staticmethod
    def update_content(
        element: CanvasElementV3,
        content_id: str,
        patch: Dict[str, Any],
    ) -> ElementContent:
        """更新指定 Content，禁止修改 contentId。"""
        if "contentId" in patch:
            raise ValueError("contentId cannot be updated")
        content = element.get_content(content_id)
        if content is None:
            raise ValueError(f"Content does not exist: {content_id}")
        content.fields.update(patch)
        return content

    @staticmethod
    def switch_active_content(element: CanvasElementV3, content_id: str) -> ElementContent:
        """切换当前展示和编辑的 Content。"""
        content = element.get_content(content_id)
        if content is None:
            raise ValueError(f"Content does not exist: {content_id}")
        element.active_content_id = content_id
        return content

    @staticmethod
    def set_main_content(element: CanvasElementV3, content_id: str) -> ElementContent:
        """设置提供给 Connection 和下游消费的稳定 Content。"""
        content = element.get_content(content_id)
        if content is None:
            raise ValueError(f"Content does not exist: {content_id}")
        if element.type in {"image", "video"}:
            if content.fields.get("status") != "completed" or not content.fields.get("src"):
                raise ValueError("Image/video main Content must be completed and contain src")
        element.main_content_id = content_id
        return content

    @staticmethod
    def delete_active_content(element: CanvasElementV3) -> ElementContent:
        """删除 active Content，并修复 active/main 指针。"""
        if len(element.contents) <= 1:
            raise ValueError("At least one Content must be preserved")
        active_id = element.active_content_id
        active_index = next(
            (index for index, content in enumerate(element.contents) if content.content_id == active_id),
            None,
        )
        if active_index is None:
            raise ValueError("activeContentId does not reference an existing Content")
        deleted = element.contents.pop(active_index)
        replacement = element.contents[max(0, active_index - 1)]
        element.active_content_id = replacement.content_id
        if element.main_content_id == deleted.content_id:
            element.main_content_id = ContentService._find_main_replacement(element) or replacement.content_id
        return deleted

    @staticmethod
    def _find_main_replacement(element: CanvasElementV3) -> Optional[str]:
        """寻找删除后可作为 main 的 Content。"""
        if element.type not in {"image", "video"}:
            return element.contents[0].content_id if element.contents else None
        for content in element.contents:
            if content.fields.get("status") == "completed" and content.fields.get("src"):
                return content.content_id
        return None

