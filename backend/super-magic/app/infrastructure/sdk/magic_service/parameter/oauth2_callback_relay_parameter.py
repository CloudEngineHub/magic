"""OAuth2 callback relay 参数。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class OAuth2CallbackRelayParameter(MagicServiceAbstractParameter):
    """用于按 state 读取或删除 OAuth2 callback relay payload 的参数。"""

    def __init__(self, state: str, timeout: Optional[float] = None) -> None:
        """初始化 OAuth2 callback relay 请求参数。"""
        super().__init__()
        self.state = state
        self.timeout = timeout

    def to_body(self) -> Dict[str, Any]:
        """DELETE 也使用 query 参数，body 保持为空。"""
        return {}

    def to_query_params(self) -> Dict[str, Any]:
        """转换为 magic-service relay endpoint 的 query 参数。"""
        return {
            "state": self.state,
        }

    def to_options(self, method: str) -> Dict[str, Any]:
        """构造请求选项，确保 GET 和 DELETE 都通过 query 传递 state。"""
        options = super().to_options(method)
        if method.upper() == "DELETE":
            options["params"] = self.to_query_params()
            options.pop("json", None)
        if self.timeout is not None:
            options["timeout"] = self.timeout
        return options

    def validate(self) -> None:
        """校验 state 与 magic-service 鉴权参数。"""
        super().validate()
        if not isinstance(self.state, str) or not self.state.strip():
            raise ValueError("state is required")
