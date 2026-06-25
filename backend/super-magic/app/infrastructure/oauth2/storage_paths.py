"""OAuth2 文件存储路径解析。"""

from __future__ import annotations

import os
from pathlib import Path

from app.path_manager import PathManager
from app.infrastructure.oauth2.security import validate_app_name

ENV_CREDENTIALS_DIR = "SUPER_MAGIC_OAUTH2_CREDENTIALS_DIR"
DEFAULT_CREDENTIALS_DIR = ".user/oauth2/{app}"


class OAuth2StoragePaths:
    """解析 OAuth2 app、credential 和 session 文件路径。"""

    def __init__(self, template: str | None = None) -> None:
        """使用可选目录模板初始化路径解析器。"""
        self._template = template or os.getenv(ENV_CREDENTIALS_DIR) or DEFAULT_CREDENTIALS_DIR

    def app_dir(self, app_name: str) -> Path:
        """返回单个 OAuth2 app 的根目录。"""
        app = validate_app_name(app_name)
        template = self._template
        if "{app}" in template:
            return self._resolve_base_path(template.replace("{app}", app))
        return self._resolve_base_path(template) / app

    def list_root(self) -> Path:
        """返回可枚举 app 目录的根目录。"""
        template = self._template
        if "{app}" in template:
            prefix = template.split("{app}", 1)[0].rstrip("/\\")
            return self._resolve_base_path(prefix or ".")
        return self._resolve_base_path(template)

    def app_file(self, app_name: str) -> Path:
        """返回单个 app 的 app.json 文件路径。"""
        return self.app_dir(app_name) / "app.json"

    def credential_file(self, app_name: str, subject_hash: str) -> Path:
        """返回单个 app 和 subject hash 对应的 credential 文件路径。"""
        return self.app_dir(app_name) / "credentials" / f"{subject_hash}.json"

    def session_file(self, app_name: str, state_hash: str) -> Path:
        """返回单个 state hash 对应的授权 session 文件路径。"""
        return self.app_dir(app_name) / "sessions" / f"{state_hash}.json"

    def api_docs_dir(self, app_name: str) -> Path:
        """返回单个 app 的接口文档存储目录。"""
        return self.app_dir(app_name) / "api_docs"

    def openapi_file(self, app_name: str) -> Path:
        """返回单个 app 的 OpenAPI 接口文档文件路径。"""
        return self.api_docs_dir(app_name) / "openapi.json"

    @staticmethod
    def _resolve_base_path(value: str) -> Path:
        """将相对 OAuth2 存储路径解析到 project root 下。"""
        path = Path(value).expanduser()
        if path.is_absolute():
            return path
        return PathManager.get_project_root() / path
