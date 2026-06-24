"""动态 OAuth2 应用授权基础设施。"""

from app.infrastructure.oauth2.app_definition import OAuth2AppDefinition
from app.infrastructure.oauth2.credential_store import OAuth2CredentialStore
from app.infrastructure.oauth2.session_store import OAuth2SessionStore
from app.infrastructure.oauth2.token_service import OAuth2TokenService

__all__ = [
    "OAuth2AppDefinition",
    "OAuth2CredentialStore",
    "OAuth2SessionStore",
    "OAuth2TokenService",
]
