"""Canvas 文档标识生成器。"""

import re
from collections.abc import Iterable

from agentlang.utils.snowflake import Snowflake


class CanvasIdGenerator:
    """集中生成 Canvas Element、Content 和 Connection ID。"""

    _snowflake = Snowflake.create_default()

    @classmethod
    def generate_element_id(cls) -> str:
        """使用统一雪花算法生成 Element ID。"""
        return f"element-{cls._generate_snowflake_id()}"

    @classmethod
    def generate_connection_id(cls) -> str:
        """使用统一雪花算法生成 Connection ID。"""
        return f"connection-{cls._generate_snowflake_id()}"

    @staticmethod
    def generate_initial_content_id(element_id: str) -> str:
        """基于 Element ID 生成首个 Content ID。"""
        normalized_element_id = element_id.strip()
        if not normalized_element_id:
            raise ValueError("Element ID must not be empty")
        return f"{normalized_element_id}-content-1"

    @staticmethod
    def generate_content_id(
        element_id: str,
        existing_content_ids: Iterable[str],
    ) -> str:
        """基于 Element ID 和已有序号生成下一个 Content ID。"""
        normalized_element_id = element_id.strip()
        if not normalized_element_id:
            raise ValueError("Element ID must not be empty")
        pattern = re.compile(rf"^{re.escape(normalized_element_id)}-content-(\d+)$")
        used_indices = {
            int(match.group(1))
            for content_id in existing_content_ids
            if (match := pattern.fullmatch(str(content_id))) is not None
        }
        next_index = max(used_indices, default=0) + 1
        return f"{normalized_element_id}-content-{next_index}"

    @classmethod
    def _generate_snowflake_id(cls) -> str:
        """复用 super-magic 的统一雪花算法并转换为字符串。"""
        return str(cls._snowflake.get_id())
