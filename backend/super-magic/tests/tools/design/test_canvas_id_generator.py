"""Canvas ID 生成规则测试。"""

import re

from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator


def test_canvas_id_generator_uses_shared_snowflake(monkeypatch):
    """验证 Element 和 Connection ID 复用统一雪花生成器。"""

    class FakeSnowflake:
        """测试用雪花生成器，避免依赖真实时间和机器号。"""

        def __init__(self):
            self._values = iter((123456789012345678, 123456789012345679))

        def get_id(self):
            """返回预置的测试 ID。"""
            return next(self._values)

    monkeypatch.setattr(CanvasIdGenerator, "_snowflake", FakeSnowflake())

    element_id = CanvasIdGenerator.generate_element_id()
    connection_id = CanvasIdGenerator.generate_connection_id()
    initial_content_id = CanvasIdGenerator.generate_initial_content_id(element_id)
    appended_content_id = CanvasIdGenerator.generate_content_id(
        element_id,
        [initial_content_id, "content-legacy-uuid"],
    )

    assert re.fullmatch(r"element-\d+", element_id)
    assert re.fullmatch(r"connection-\d+", connection_id)
    assert initial_content_id == f"{element_id}-content-1"
    assert appended_content_id == f"{element_id}-content-2"
    assert element_id != connection_id
