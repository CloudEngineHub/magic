"""
User-Authorization 校验中间件

校验每个进入 super-magic HTTP API 的请求必须携带合法的 User-Authorization
header，header 的值必须与本地 metadata.json 中的 `authorization` 字段一致。

设计目标：
- 与 agfs-server (Go) 的 AuthMiddleware 行为对齐：401 / 503 语义、bypass
  路径集合、配置项（Enabled / MetadataPath）都保持一致。
- metadata 文件在每个请求上重新读取，让 warm-pool 重绑、token 外部刷新
  立即生效，不需要重启进程。
- bypass 仅放行 kubelet 探针，其他所有 API 路径必须带
  User-Authorization。
- 关闭鉴权（USER_AUTH_REQUIRED=false）后所有请求放行，初始化时通过 warn
  级日志留痕，用于本地开发。

失败语义：
- metadata 文件缺失 / 不可解析 / 字段为空 + 开启鉴权 -> 503
  (sandbox 还没绑定 metadata.json)
- 缺少 User-Authorization header -> 401
- header 值与 metadata.authorization 不一致 -> 401
- 路径在 bypass 集合中 -> 直接放行
- 鉴权关闭 -> 直接放行（warn 日志）
"""

import json
import os
from pathlib import Path
from typing import Any, Set

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from agentlang.logger import get_logger

from app.path_manager import PathManager

logger = get_logger(__name__)


# 与 agfs-server (handlers/auth_middleware.go) 的 UserAuthorizationHeader
# 常量保持同名同义，避免上下游再做 header 名翻译。
USER_AUTHORIZATION_HEADER = "User-Authorization"


# 不走鉴权的路径集合。这些路径在 sandbox 还没绑定 metadata.json 时也必须
# 可达--主要是 kubelet 探针。**任何**会接触用户工作区、
# magicfs、agfs 文件的路径都必须带 User-Authorization，**不要**加到这里。
_AUTH_BYPASS_PATHS: Set[str] = {
    "/health",
    "/api/health",
}


def _is_bypass_path(path: str) -> bool:
    """判断 path 是否在 bypass 集合内。完全相等匹配（不含前缀通配），
    因为路由前缀都集中在 routes/api.py 里的几个固定字符串。"""
    return path in _AUTH_BYPASS_PATHS


class UserAuthorizationMiddleware(BaseHTTPMiddleware):
    """校验每个 HTTP 请求必须带合法的 User-Authorization header。

    配置（环境变量）：
    - USER_AUTH_REQUIRED：是否启用鉴权，默认 true。设为 false 后所有请求
      放行，warn 日志留痕，用于本地开发。
    """

    def __init__(self, app, *, enabled: bool | None = None) -> None:
        super().__init__(app)
        if enabled is None:
            env_value = os.environ.get("USER_AUTH_REQUIRED", "true").strip().lower()
            self._enabled = env_value not in ("false", "0", "no", "off")
        else:
            self._enabled = enabled

        if not self._enabled:
            logger.warning(
                "[user-auth] auth disabled (USER_AUTH_REQUIRED=false), all requests will be allowed"
            )

    async def dispatch(self, request: Request, call_next):
        if not self._enabled:
            return await call_next(request)

        if _is_bypass_path(request.url.path):
            return await call_next(request)

        expected = read_expected_authorization()
        if expected is None:
            # metadata.json 不可用 -> sandbox 还没绑定。返回 503 让上游知道
            # 应该等待绑定完成再重试。
            return JSONResponse(
                status_code=503,
                content={
                    "code": 503,
                    "message": "sandbox not bound yet: metadata.json missing or invalid",
                },
            )
        if expected == "":
            return JSONResponse(
                status_code=503,
                content={
                    "code": 503,
                    "message": "sandbox not bound yet: metadata.json has no authorization",
                },
            )

        got = request.headers.get(USER_AUTHORIZATION_HEADER, "")
        if got == "":
            logger.warning(
                "[user-auth] missing %s on %s %s",
                USER_AUTHORIZATION_HEADER,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=401,
                content={
                    "code": 401,
                    "message": f"missing {USER_AUTHORIZATION_HEADER} header",
                },
            )
        if got != expected:
            logger.warning(
                "[user-auth] %s mismatch on %s %s",
                USER_AUTHORIZATION_HEADER,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=401,
                content={
                    "code": 401,
                    "message": f"invalid {USER_AUTHORIZATION_HEADER} token",
                },
            )

        return await call_next(request)


def read_expected_authorization() -> str | None:
    """读取 metadata.json 中的 authorization 字段。

    公开入口：HTTP 鉴权中间件与 WebSocket 鉴权中间件共用同一份
    token 来源，保证两侧的校验口径完全一致。

    - 文件缺失 / 不可解析 -> 返回 None（表示 metadata 不可用）
    - 字段缺失或为空字符串 -> 返回空字符串（特殊语义：上层区分处理）
    - 其他情况 -> 返回 token 字符串

    每次请求都重新读取，与 agfs-server 的 magicfs.MetadataClient
    行为保持一致——warm-pool 重绑 / 外部 token 刷新可以立即生效。

    路径解析顺序：
    1. USER_AUTH_METADATA_PATH 环境变量（覆盖默认，便于测试和运维切换）
    2. PathManager.get_client_message_metadata_file() —— 默认是
       project_root/.credentials/metadata.json
    """
    override = os.environ.get("USER_AUTH_METADATA_PATH", "").strip()
    if override:
        return _read_authorization_from_file(Path(override))

    try:
        metadata_path = PathManager.get_client_message_metadata_file()
    except Exception as e:
        logger.warning("[user-auth] cannot resolve metadata.json path: %s", e)
        return None

    return _read_authorization_from_file(metadata_path)


def _read_authorization_from_file(path: Path) -> str | None:
    """从指定路径读取 authorization 字段。封装出来方便测试和后续
    通过 USER_AUTH_METADATA_PATH 环境变量覆盖路径。"""
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("[user-auth] metadata.json not found at %s", path)
        return None
    except PermissionError as e:
        logger.warning("[user-auth] cannot read metadata.json at %s: %s", path, e)
        return None
    except OSError as e:
        logger.warning("[user-auth] I/O error reading metadata.json at %s: %s", path, e)
        return None

    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("[user-auth] metadata.json at %s is not valid JSON: %s", path, e)
        return None

    if not isinstance(data, dict):
        logger.warning(
            "[user-auth] metadata.json at %s is not a JSON object (got %s)",
            path,
            type(data).__name__,
        )
        return None

    token = data.get("authorization")
    if token is None:
        return ""
    if not isinstance(token, str):
        logger.warning(
            "[user-auth] metadata.authorization is not a string (got %s)",
            type(token).__name__,
        )
        return ""
    return token
