"""仅允许 Code Mode 调用的 OAuth2 工具。"""

from app.tools.oauth2.check_authorization import OAuth2CheckAuthorization
from app.tools.oauth2.get_api_doc import OAuth2GetApiDoc
from app.tools.oauth2.get_redirect_uri import OAuth2GetRedirectUri
from app.tools.oauth2.list_api_docs import OAuth2ListApiDocs
from app.tools.oauth2.list_apps import OAuth2ListApps
from app.tools.oauth2.remove_api_doc import OAuth2RemoveApiDoc
from app.tools.oauth2.remove_app import OAuth2RemoveApp
from app.tools.oauth2.request import OAuth2Request
from app.tools.oauth2.start_authorization import OAuth2StartAuthorization
from app.tools.oauth2.upsert_api_doc import OAuth2UpsertApiDoc
from app.tools.oauth2.upsert_app import OAuth2UpsertApp

__all__ = [
    "OAuth2CheckAuthorization",
    "OAuth2GetApiDoc",
    "OAuth2GetRedirectUri",
    "OAuth2ListApiDocs",
    "OAuth2ListApps",
    "OAuth2RemoveApiDoc",
    "OAuth2RemoveApp",
    "OAuth2Request",
    "OAuth2StartAuthorization",
    "OAuth2UpsertApiDoc",
    "OAuth2UpsertApp",
]
