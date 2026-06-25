"""OAuth2 callback relay 结果。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.infrastructure.sdk.base import AbstractResult


class OAuth2CallbackRelayResult(AbstractResult):
    """magic-service OAuth2 callback relay 的标准结果。"""

    def _parse_data(self) -> None:
        """从原始 data 中解析状态、payload 和提示消息。"""
        self.status: str = str(self.get("status") or "")
        self.payload: Optional[Dict[str, Any]] = self.get("payload")
        self.message: str = str(self.get("message") or "")

    @classmethod
    def pending(cls, message: str = "Callback has not arrived.") -> "OAuth2CallbackRelayResult":
        """创建 pending 状态结果。"""
        return cls({"status": "pending", "payload": None, "message": message})

    @classmethod
    def expired(cls, message: str = "Callback payload has expired.") -> "OAuth2CallbackRelayResult":
        """创建 expired 状态结果。"""
        return cls({"status": "expired", "payload": None, "message": message})

    def get_status(self) -> str:
        """获取 callback relay 状态。"""
        return self.status

    def get_payload(self) -> Optional[Dict[str, Any]]:
        """获取 callback payload。"""
        return self.payload

    def get_message(self) -> str:
        """获取 callback relay 消息。"""
        return self.message

    def to_dict(self) -> Dict[str, Any]:
        """转换为 callback relay 标准字典。"""
        return {
            "status": self.status,
            "payload": self.payload,
            "message": self.message,
        }
