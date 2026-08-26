"""客户端消息中的个人偏好配置。"""

from typing import Any

from pydantic import BaseModel, Field, validator


class PersonalPreferences(BaseModel):
    """用户个人偏好配置。"""

    long_term_memory_enabled: bool = Field(
        default=True,
        description="是否启用通用长期记忆自动功能",
    )

    @validator("long_term_memory_enabled", pre=True, always=True)
    def validate_long_term_memory_enabled(cls, value: Any) -> bool:
        """缺失或非法值按开启处理，兼容旧消息和脏数据。"""
        return value if isinstance(value, bool) else True
