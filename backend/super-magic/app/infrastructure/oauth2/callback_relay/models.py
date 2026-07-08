"""OAuth2 callback relay driver 使用的模型。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class OAuth2CallbackStatus(StrEnum):
    """callback relay 已知结果状态。"""

    PENDING = "pending"
    RECEIVED = "received"
    EXPIRED = "expired"
    DENIED = "denied"
    FAILED = "failed"


@dataclass(slots=True)
class OAuth2CallbackPayload:
    """从 OAuth2 provider 接收到的原始 callback 数据。"""

    state: str
    code: str = ""
    error: str = ""
    error_description: str = ""
    received_at: str = ""
    source: str = ""

    def to_dict(self) -> dict[str, Any]:
        """序列化 callback payload 用于本地持久化。"""
        return {
            "state": self.state,
            "code": self.code,
            "error": self.error,
            "error_description": self.error_description,
            "received_at": self.received_at,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "OAuth2CallbackPayload":
        """从 JSON 兼容字典创建 callback payload。"""
        return cls(
            state=str(payload.get("state") or ""),
            code=str(payload.get("code") or ""),
            error=str(payload.get("error") or ""),
            error_description=str(payload.get("error_description") or ""),
            received_at=str(payload.get("received_at") or ""),
            source=str(payload.get("source") or ""),
        )


@dataclass(slots=True)
class OAuth2CallbackResult:
    """供 token service 消费的标准化 callback relay 结果。"""

    status: OAuth2CallbackStatus
    payload: OAuth2CallbackPayload | None = None
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        """序列化 callback 结果用于诊断，同时避免暴露敏感信息。"""
        return {
            "status": self.status.value,
            "payload": self.payload.to_dict() if self.payload else None,
            "message": self.message,
        }
