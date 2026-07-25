"""
SDK 鉴权工具：读取当前沙箱绑定的 User-Authorization token。

in-pod super-magic agent 的 ``UserAuthorizationMiddleware`` 要求所有非探针
请求携带 ``User-Authorization`` header，其值必须与本地 ``metadata.json``
中的 ``authorization`` 字段一致。SDK 代码片段（``run_sdk_snippet`` 子进程）
通过 localhost 调用 ``/api/sdk/tool/call`` 等 in-pod 接口时，同样需要带上
这个 header，否则会被 401 拒绝。

本模块是 SDK 侧读取该 token 的统一入口，与
``app/api/middleware/user_authorization_middleware.py`` 读取预期值的逻辑保持
一致：
- 路径解析顺序：``USER_AUTH_METADATA_PATH`` 环境变量覆盖 ->
  ``<project_root>/.credentials/metadata.json``
- 每次调用都重新读取文件，保证 warm-pool 重绑 / token 外部刷新立即生效

为避免在 SDK 子进程中引入 ``app.`` 依赖，项目根目录通过
``sdk.workspace.get_project_root()``（``SUPER_MAGIC_PROJECT_ROOT``）解析，
而非 ``app.path_manager.PathManager``。
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Final, Optional

from .workspace import get_project_root

USER_AUTHORIZATION_HEADER: Final[str] = "User-Authorization"

_METADATA_PATH_ENV: Final[str] = "USER_AUTH_METADATA_PATH"
_METADATA_FILENAME: Final[str] = "metadata.json"
_AUTHORIZATION_FIELD: Final[str] = "authorization"


def _resolve_metadata_path() -> Optional[Path]:
    """解析 metadata.json 的路径。

    优先使用 ``USER_AUTH_METADATA_PATH`` 环境变量（便于测试/运维覆盖），
    否则回退到 ``<project_root>/.credentials/metadata.json``。无法定位项目
    根目录时返回 None。
    """
    override = os.environ.get(_METADATA_PATH_ENV, "").strip()
    if override:
        return Path(override)

    try:
        project_root = get_project_root()
    except RuntimeError:
        return None
    return project_root / ".credentials" / _METADATA_FILENAME


def read_user_authorization_token() -> Optional[str]:
    """读取 ``metadata.json`` 中的 ``authorization`` 字段。

    Returns:
        - token 字符串：文件存在且字段有效时
        - ``None``：文件缺失 / 不可解析 / 项目根目录无法定位 / 字段缺失或为空。
          调用方应据此跳过设置 ``User-Authorization`` header（此时请求会被
          in-pod 中间件 401 拒绝，便于排障）。
    """
    metadata_path = _resolve_metadata_path()
    if metadata_path is None:
        return None

    try:
        raw = metadata_path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError):
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    token = data.get(_AUTHORIZATION_FIELD)
    if not isinstance(token, str) or not token:
        return None
    return token
