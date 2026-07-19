"""
通信配置模块

定义与外部服务通信相关的配置类
"""
from enum import Enum
from typing import Any, Dict

from pydantic import BaseModel, Field


class MessageSubscriptionAuthScheme(str, Enum):
    """Message subscription authentication scheme."""

    HEADER_TOKEN = "header_token"


class MessageSubscriptionConfig(BaseModel):
    """
    消息订阅配置

    用于配置消息的订阅方式和回调接口
    """
    method: str  # HTTP 方法，例如 "POST"
    url: str  # API 端点
    auth_scheme: MessageSubscriptionAuthScheme = MessageSubscriptionAuthScheme.HEADER_TOKEN
    headers: Dict[str, str] = Field(default_factory=dict)  # HTTP 请求头
    auth_config: Dict[str, Any] = Field(default_factory=dict)  # 认证扩展配置，按 auth_scheme 解释
    enable_obfuscation: bool = True  # 是否启用消息混淆，默认开启

    class Config:
        use_enum_values = True


class STSTokenRefreshConfig(BaseModel):
    """
    STS Token刷新配置

    用于配置刷新STS Token的方式和接口
    """
    method: str  # HTTP方法，例如"POST"
    url: str  # API端点
    headers: Dict[str, str]  # HTTP请求头
