"""动态 OAuth2 app 注册模型。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.infrastructure.oauth2.security import validate_app_name


@dataclass(slots=True)
class OAuth2AppDefinition:
    """super-magic 持久化的用户提供 OAuth2 app 定义。"""

    app_name: str
    label_name: str
    authorization_url: str
    token_url: str
    client_id: str
    client_secret_ref: str = ""
    scope: str = ""
    redirect_uri: str = ""
    refresh_url: str = ""
    token_auth_method: str = "client_secret_post"
    token_content_type: str = "application/x-www-form-urlencoded"
    client_id_field: str = "client_id"
    client_secret_field: str = "client_secret"
    authorization_code_field: str = "code"
    refresh_token_field: str = "refresh_token"
    access_token_field: str = "access_token"
    expires_in_field: str = "expires_in"
    token_type_field: str = "token_type"
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self) -> None:
        """标准化字段并校验 app 标识。"""
        self.app_name = validate_app_name(self.app_name)
        self.label_name = self.label_name or self.app_name
        self.refresh_url = self.refresh_url or self.token_url

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "OAuth2AppDefinition":
        """从 JSON 兼容字典创建 app 定义。"""
        data = dict(payload)
        if "client_secret" in data and "client_secret_ref" not in data:
            data["client_secret_ref"] = data.pop("client_secret")
        return cls(**{key: value for key, value in data.items() if key in cls.__dataclass_fields__})

    def to_dict(self) -> dict[str, Any]:
        """序列化 app 定义用于本地持久化。"""
        return {
            "app_name": self.app_name,
            "label_name": self.label_name,
            "authorization_url": self.authorization_url,
            "token_url": self.token_url,
            "refresh_url": self.refresh_url,
            "client_id": self.client_id,
            "client_secret_ref": self.client_secret_ref,
            "scope": self.scope,
            "redirect_uri": self.redirect_uri,
            "token_auth_method": self.token_auth_method,
            "token_content_type": self.token_content_type,
            "client_id_field": self.client_id_field,
            "client_secret_field": self.client_secret_field,
            "authorization_code_field": self.authorization_code_field,
            "refresh_token_field": self.refresh_token_field,
            "access_token_field": self.access_token_field,
            "expires_in_field": self.expires_in_field,
            "token_type_field": self.token_type_field,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def to_public_dict(self) -> dict[str, Any]:
        """序列化脱敏 app 定义，用于工具和 SDK 响应。"""
        data = self.to_dict()
        data["has_client_secret"] = bool(self.client_secret_ref)
        data.pop("client_secret_ref", None)
        return data
