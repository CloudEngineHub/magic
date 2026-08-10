"""
Security utility module for handling sensitive data sanitization.

This module provides utilities for masking sensitive information like API keys
in logs and other output to prevent credential leakage.
"""

from typing import Optional

_SENSITIVE_KEYWORDS = (
    "authorization",
    "api-key",
    "api_key",
    "token",
    "secret",
    "password",
    "cookie",
)
_DATA_URL_MARKER = ";base64,"


def mask_sensitive_value(value: str, prefix_length: int = 8, suffix_length: int = 0) -> str:
    """
    Mask sensitive value for logging.

    Args:
        value: The sensitive value to mask
        prefix_length: Number of characters to show at the beginning
        suffix_length: Number of characters to show at the end (0 means no suffix)

    Returns:
        Masked value string
    """
    if not value or not isinstance(value, str):
        return "****"

    if len(value) <= prefix_length + suffix_length:
        return "****"

    if suffix_length > 0:
        return f"{value[:prefix_length]}****{value[-suffix_length:]}"
    else:
        return f"{value[:prefix_length]}****"


def sanitize_api_key(api_key: Optional[str]) -> str:
    """
    Sanitize API key for logging.

    Args:
        api_key: The API key to sanitize

    Returns:
        Masked API key string
    """
    if not api_key:
        return "N/A"
    return mask_sensitive_value(api_key, prefix_length=8, suffix_length=4)


def sanitize_log_value(value: object) -> object:
    """递归清理仅用于日志展示的数据，不修改真实请求或消息载荷。"""
    if isinstance(value, dict):
        result: dict[object, object] = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if any(keyword in key_text for keyword in _SENSITIVE_KEYWORDS):
                result[key] = "<redacted>"
            else:
                result[key] = sanitize_log_value(item)
        return result
    if isinstance(value, list):
        return [sanitize_log_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(sanitize_log_value(item) for item in value)
    if isinstance(value, str):
        marker_index = value.find(_DATA_URL_MARKER)
        if value.startswith("data:") and marker_index >= 0:
            prefix_end = marker_index + len(_DATA_URL_MARKER)
            return f"{value[:prefix_end]}<omitted {len(value) - prefix_end} chars>"
    return value
