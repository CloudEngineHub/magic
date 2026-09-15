"""
Get Upload Temporary Credential Parameter

Parameter class for the /api/v1/file/temporary-credential API endpoint.
"""

from typing import Any, Dict, Optional

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class GetUploadTemporaryCredentialParameter(MagicServiceAbstractParameter):
    """Parameter for POST /api/v1/file/temporary-credential."""

    def __init__(
        self,
        storage: str = "public",
        content_type: Optional[str] = None,
        sts: bool = True,
        authorization: Optional[str] = None,
        organization_code: Optional[str] = None,
    ):
        """
        Initialize get-upload-temporary-credential parameter.

        Args:
            storage: Storage bucket type ('public' or 'private'). Defaults to 'public'.
            content_type: MIME content type of the file to be uploaded.
            sts: Whether to return STS temporary credentials instead of PostPolicy. Defaults to True.
            authorization: User authorization token. Auto-loaded if omitted.
            organization_code: Organization code for the request header. Auto-loaded if omitted.
        """
        super().__init__()
        self.storage = storage
        self.content_type = content_type
        self.sts = sts

        if authorization is not None:
            self.user_authorization = authorization

        if organization_code is not None:
            self.organization_code = organization_code
        else:
            self._load_organization_code()

    def _load_organization_code(self) -> None:
        """Auto-load organization_code from InitClientMessage metadata."""
        try:
            from app.utils.init_client_message_util import InitClientMessageUtil
            metadata = InitClientMessageUtil.get_metadata()
            self.organization_code: Optional[str] = metadata.get("organization_code")
        except Exception:
            self.organization_code = None

    def to_body(self) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "storage": self.storage,
            "sts": self.sts,
        }
        if self.content_type:
            body["content_type"] = self.content_type
        return body

    def to_query_params(self) -> Dict[str, Any]:
        return {}

    def to_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {
            "Accept": "*/*",
            "Connection": "keep-alive",
        }
        if self.user_authorization:
            headers["Authorization"] = self.user_authorization
        if self.organization_code:
            headers["organization-code"] = self.organization_code
        return headers

    def validate(self) -> None:
        if self.storage not in ("public", "private"):
            raise ValueError("storage must be either 'public' or 'private'")
