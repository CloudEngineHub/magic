"""OAuth2 本地开发 callback 路由。"""

from __future__ import annotations

import os

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from agentlang.logger import get_logger
from app.infrastructure.oauth2.callback_relay.drivers.local import LocalOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.factory import ENV_CALLBACK_RELAY_DRIVER
from app.infrastructure.oauth2.callback_relay.models import OAuth2CallbackPayload

router = APIRouter(prefix="/dev/oauth2", tags=["OAuth2 本地调试"])
logger = get_logger(__name__)


@router.get("/callback", response_class=HTMLResponse)
async def oauth2_local_callback(
    state: str = Query("", description="OAuth2 state"),
    code: str = Query("", description="OAuth2 authorization code"),
    error: str = Query("", description="OAuth2 error"),
    error_description: str = Query("", description="OAuth2 error description"),
) -> HTMLResponse:
    """接收本地 OAuth2 callback，并写入本地 relay 临时存储。"""
    if (os.getenv(ENV_CALLBACK_RELAY_DRIVER) or "local").strip().lower() != "local":
        return HTMLResponse(
            "<html><body><h1>OAuth2 local callback is disabled.</h1></body></html>",
            status_code=404,
        )
    if not state:
        return HTMLResponse(
            "<html><body><h1>OAuth2 callback is missing state.</h1></body></html>",
            status_code=400,
        )
    if not code and not error:
        return HTMLResponse(
            "<html><body><h1>OAuth2 callback is missing code or error.</h1></body></html>",
            status_code=400,
        )

    payload = OAuth2CallbackPayload(
        state=state,
        code=code,
        error=error,
        error_description=error_description,
        source="local",
    )
    await LocalOAuth2CallbackRelay().save_callback(payload)
    logger.info("Stored local OAuth2 callback payload.")
    return HTMLResponse(
        "<html><body><h1>OAuth2 回调已接收。</h1>"
        "<p>可以返回 super-magic，系统会自动检查授权状态。</p></body></html>"
    )
