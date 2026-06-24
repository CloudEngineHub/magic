"""Code Mode 脚本使用的 OAuth2 SDK 辅助方法。"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Optional


class OAuth2Error(RuntimeError):
    """OAuth2 SDK 异常基类。"""


class OAuth2AuthorizationRequired(OAuth2Error):
    """OAuth2 app 需要用户授权时抛出。"""

    def __init__(self, message: str, *, auth_url: str = "", expires_at: str = "") -> None:
        """初始化需要授权异常。"""
        super().__init__(message)
        self.auth_url = auth_url
        self.expires_at = expires_at


class OAuth2TokenRefreshFailed(OAuth2Error):
    """refresh token 无法刷新 access token 时抛出。"""


class OAuth2AppNotFound(OAuth2Error):
    """请求的 OAuth2 app 未注册时抛出。"""


class OAuth2DependencyMissing(OAuth2Error):
    """服务端 OAuth2 依赖不可用时抛出。"""


def get_access_token(app_name: str, subject: Optional[str] = None) -> str:
    """返回 OAuth2 app 的有效 access token。"""
    agent_context_id = os.getenv("SUPER_MAGIC_AGENT_CONTEXT_ID", "")
    if not agent_context_id:
        raise OAuth2Error(
            "SUPER_MAGIC_AGENT_CONTEXT_ID is not set. "
            "sdk.oauth2 can only be used inside run_sdk_snippet or run_python_snippet."
        )

    api_port = os.getenv("SUPER_MAGIC_API_PORT", "8002")
    url = f"http://127.0.0.1:{api_port}/api/sdk/oauth2/access-token"
    request_data = {
        "app_name": app_name,
        "subject": subject,
        "agent_context_id": agent_context_id,
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(request_data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = f"OAuth2 SDK HTTP request failed: {exc.code} - {exc.reason}"
        print(f"[SDK Error] {message}", file=sys.stderr)
        raise OAuth2Error(message) from exc
    except urllib.error.URLError as exc:
        message = f"OAuth2 SDK HTTP request failed: {exc.reason}"
        print(f"[SDK Error] {message}", file=sys.stderr)
        raise OAuth2Error(message) from exc

    payload = response_data.get("data") or {}
    status = payload.get("status", "failed")
    if response_data.get("code") == 1000 and status == "authorized":
        token = payload.get("access_token") or ""
        if not token:
            raise OAuth2Error("OAuth2 access token response was empty.")
        return token

    content = payload.get("content") or response_data.get("message") or "OAuth2 access token request failed."
    if status == "authorization_required":
        raise OAuth2AuthorizationRequired(
            content,
            auth_url=payload.get("auth_url", ""),
            expires_at=payload.get("expires_at", ""),
        )
    if status == "app_not_found":
        raise OAuth2AppNotFound(content)
    if status == "token_refresh_failed":
        raise OAuth2TokenRefreshFailed(content)
    if status == "dependency_missing":
        raise OAuth2DependencyMissing(content)
    raise OAuth2Error(content)


__all__ = [
    "OAuth2AppNotFound",
    "OAuth2AuthorizationRequired",
    "OAuth2DependencyMissing",
    "OAuth2Error",
    "OAuth2TokenRefreshFailed",
    "get_access_token",
]
