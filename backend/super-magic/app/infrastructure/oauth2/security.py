"""OAuth2 存储和日志使用的安全辅助函数。"""

from __future__ import annotations

import base64
import hashlib
import os
import re

from agentlang.logger import get_logger
from app.path_manager import PathManager

APP_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
ENV_PLACEHOLDER_PATTERN = re.compile(r"^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$")
logger = get_logger(__name__)


def validate_app_name(app_name: str) -> str:
    """校验并标准化 OAuth2 app 名称。"""
    normalized = (app_name or "").strip()
    if not APP_NAME_PATTERN.fullmatch(normalized):
        raise ValueError("app_name must use lowercase letters, numbers, underscores, or hyphens.")
    return normalized


def hash_text(value: str) -> str:
    """生成稳定的 sha256 十六进制摘要，用于文件名和日志。"""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def make_state() -> str:
    """生成高熵 OAuth2 state。"""
    return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("=")


def make_pkce_verifier() -> str:
    """生成高熵 PKCE verifier。"""
    return base64.urlsafe_b64encode(os.urandom(48)).decode("ascii").rstrip("=")


def make_pkce_challenge(verifier: str) -> str:
    """根据 verifier 生成 S256 PKCE challenge。"""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def resolve_secret(value: str | None) -> str:
    """解析明文 secret 或有效运行环境中的 ${ENV_NAME} 占位符。"""
    if not value:
        return ""
    match = ENV_PLACEHOLDER_PATTERN.fullmatch(value.strip())
    if not match:
        return value
    env_name = match.group(1)
    return _load_effective_env().get(env_name, "")


def get_env_placeholder_name(value: str | None) -> str:
    """返回 ${ENV_NAME} 占位符中的环境变量名，非占位符返回空字符串。"""
    if not value:
        return ""
    match = ENV_PLACEHOLDER_PATTERN.fullmatch(value.strip())
    return match.group(1) if match else ""


def _load_effective_env() -> dict[str, str]:
    """加载与 run_sdk_snippet 子进程一致的有效环境变量。"""
    values = dict(os.environ)
    try:
        from app.service.env_manager import EnvFileStore, EnvIdentityResolver

        store = EnvFileStore()
        identity_resolver = EnvIdentityResolver()
        personal_env_path = PathManager.get_personal_env_file()

        for env_path in PathManager.get_process_env_paths():
            if not env_path.exists():
                continue

            identity = (
                identity_resolver.resolve_personal()
                if env_path == personal_env_path
                else identity_resolver.resolve_workspace()
            )
            try:
                values.update(store.read_values_sync(env_path, identity))
            except Exception as exc:
                logger.warning(f"加载 OAuth2 环境变量文件失败: {env_path}: {exc}")
    except Exception as exc:
        logger.warning(f"加载 OAuth2 有效环境变量失败: {exc}")
    return values


def redact(value: str | None) -> str:
    """为敏感值生成不可逆的脱敏标记。"""
    if not value:
        return ""
    return f"sha256:{hash_text(value)[:12]}"
