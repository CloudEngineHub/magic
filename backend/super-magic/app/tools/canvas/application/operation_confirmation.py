"""Canvas 兼容入口；准备、绑定及真人回答统一由共享服务维护。"""

from dataclasses import dataclass

from app.service.prepared_operation_confirmation import PreparedOperation, PreparedOperationConfirmation
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.types import JsonObject

PreparedCanvasOperation = PreparedOperation


@dataclass(frozen=True)
class CanvasOperationPreparation:
    payload: JsonObject
    fingerprint: str


class CanvasOperationConfirmation(PreparedOperationConfirmation):
    error_type = CanvasDomainError
