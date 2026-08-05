"""按资源 ID 查询分享的参数。"""

from __future__ import annotations

from typing import Any

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class GetShareParameter(MagicServiceAbstractParameter):
    """读取当前用户创建的单条有效分享。"""

    def __init__(self, resource_id: str) -> None:
        super().__init__()
        self.resource_id = resource_id

    def get_resource_id(self) -> str:
        return self.resource_id

    def to_body(self) -> dict[str, Any]:
        return {}

    def to_query_params(self) -> dict[str, Any]:
        return {}

    def validate(self) -> None:
        super().validate()
        if not self.resource_id.isdigit() or len(self.resource_id) > 64:
            raise ValueError("resource_id must be a numeric string up to 64 characters")


__all__ = ["GetShareParameter"]
