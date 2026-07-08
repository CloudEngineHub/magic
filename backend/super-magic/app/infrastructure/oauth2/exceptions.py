"""OAuth2 领域异常定义。"""


class OAuth2Error(RuntimeError):
    """OAuth2 应用接入异常基类。"""


class OAuth2AppNotFoundError(OAuth2Error):
    """未找到 OAuth2 app 注册信息时抛出。"""


class OAuth2ConfigurationError(OAuth2Error):
    """OAuth2 app 配置不完整或不可用时抛出。"""


class OAuth2AuthorizationRequiredError(OAuth2Error):
    """OAuth2 app 没有可用凭证且需要授权时抛出。"""


class OAuth2AuthorizationPendingError(OAuth2Error):
    """OAuth2 授权已发起但 callback 尚未到达时抛出。"""


class OAuth2TokenExchangeError(OAuth2Error):
    """authorization code 换 token 失败时抛出。"""


class OAuth2TokenRefreshError(OAuth2Error):
    """刷新 access token 失败时抛出。"""


class OAuth2DependencyError(OAuth2Error):
    """OAuth2 运行时依赖不可用时抛出。"""
