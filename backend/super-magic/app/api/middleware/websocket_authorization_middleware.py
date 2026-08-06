"""
WebSocket User-Authorization 校验中间件

为 WebSocket 端点提供与 HTTP UserAuthorizationMiddleware 等价的鉴权。
BaseHTTPMiddleware 只处理 HTTP scope，WebSocket 握手不会经过它，
因此需要这个独立的纯 ASGI 中间件来保护 WebSocket 路由。

设计目标：
- 只处理 scope["type"] == "websocket" 且 path 在 protected_paths 中的
  连接，其余流量原样透传，不影响 HTTP 中间件链和未注册的 WS 端点。
  protected_paths 由注册方（ws_server.create_app）显式传入，新增受保护
  WS 端点必须在注册处补充路径。
- token 来源与 HTTP 侧完全一致：metadata.json 的 authorization 字段，
  每次连接重新读取，warm-pool 重绑 / token 外部刷新立即生效。
- 凭证提取顺序：User-Authorization header -> ?token= query param。
  query param 是给浏览器客户端的兜底（浏览器 WebSocket API 无法设置
  自定义 header）。
- 关闭鉴权（USER_AUTH_REQUIRED=false）后所有连接放行，warn 日志留痕。

失败语义（与 HTTP 侧的 401 / 503 对齐，用自定义 close code 表达）：
- metadata 文件缺失 / 不可解析 / 字段为空 + 开启鉴权 -> 4503
  (sandbox 还没绑定 metadata.json)
- 缺少凭证 -> 4401
- 凭证与 metadata.authorization 不一致 -> 4401
- 路径不在 protected_paths 中 -> 直接放行
- 鉴权关闭 -> 直接放行（warn 日志）

拒绝时先 accept 再 close：握手阶段直接拒绝会让所有客户端只收到
无差别的 403，accept-then-close 能让非浏览器客户端读到具体的
close code 和 reason，便于区分「未绑定」与「未授权」并重试。
"""

import os
from typing import Set

from starlette.datastructures import Headers, QueryParams
from starlette.types import ASGIApp, Receive, Scope, Send

from agentlang.logger import get_logger
from app.api.middleware.user_authorization_middleware import (
    USER_AUTHORIZATION_HEADER,
    read_expected_authorization,
)

logger = get_logger(__name__)

# 应用自定义 close code 段为 4000-4999，这里取与 HTTP 状态码对齐的值，
# 方便客户端和排查日志直接对应 401 / 503 语义。
WS_CLOSE_UNAUTHORIZED = 4401
WS_CLOSE_SANDBOX_NOT_BOUND = 4503


class WebSocketAuthorizationMiddleware:
    """校验显式注册的 WebSocket 路径必须带合法的 User-Authorization 凭证。

    配置（环境变量）：
    - USER_AUTH_REQUIRED：是否启用鉴权，默认 true。设为 false 后所有连接
      放行，warn 日志留痕，用于本地开发。
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        protected_paths: Set[str],
        enabled: bool | None = None,
    ) -> None:
        self.app = app
        # 显式注册受保护的 WS 路径集合，完全相等匹配，不做前缀通配
        self._protected_paths = set(protected_paths)
        if enabled is None:
            env_value = os.environ.get("USER_AUTH_REQUIRED", "true").strip().lower()
            self._enabled = env_value not in ("false", "0", "no", "off")
        else:
            self._enabled = enabled

        if not self._enabled:
            logger.warning(
                "[ws-auth] auth disabled (USER_AUTH_REQUIRED=false), all websocket connections will be allowed"
            )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "websocket" or scope["path"] not in self._protected_paths:
            await self.app(scope, receive, send)
            return

        if not self._enabled:
            await self.app(scope, receive, send)
            return

        expected = read_expected_authorization()
        if expected is None:
            await self._reject(
                send,
                WS_CLOSE_SANDBOX_NOT_BOUND,
                "sandbox not bound yet: metadata.json missing or invalid",
            )
            return
        if expected == "":
            await self._reject(
                send,
                WS_CLOSE_SANDBOX_NOT_BOUND,
                "sandbox not bound yet: metadata.json has no authorization",
            )
            return

        got = self._extract_credential(scope)
        if got == "":
            logger.warning(
                "[ws-auth] missing %s credential on websocket %s",
                USER_AUTHORIZATION_HEADER,
                scope["path"],
            )
            await self._reject(
                send,
                WS_CLOSE_UNAUTHORIZED,
                f"missing {USER_AUTHORIZATION_HEADER} credential",
            )
            return
        if got != expected:
            logger.warning(
                "[ws-auth] %s mismatch on websocket %s",
                USER_AUTHORIZATION_HEADER,
                scope["path"],
            )
            await self._reject(
                send,
                WS_CLOSE_UNAUTHORIZED,
                f"invalid {USER_AUTHORIZATION_HEADER} token",
            )
            return

        await self.app(scope, receive, send)

    @staticmethod
    def _extract_credential(scope: Scope) -> str:
        """提取客户端凭证：User-Authorization header 优先，?token= 兜底。

        浏览器 WebSocket API 无法设置自定义 header，浏览器客户端只能
        通过 query param 携带 token。
        """
        headers = Headers(scope=scope)
        credential = headers.get(USER_AUTHORIZATION_HEADER, "")
        if credential:
            return credential
        return QueryParams(scope["query_string"]).get("token", "")

    @staticmethod
    async def _reject(send: Send, code: int, reason: str) -> None:
        """先 accept 再 close，让客户端能读到具体的 close code 和 reason。"""
        await send({"type": "websocket.accept"})
        await send({"type": "websocket.close", "code": code, "reason": reason})
