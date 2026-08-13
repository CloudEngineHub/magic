from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True, slots=True)
class PairingDetails:
    session_id: str
    endpoint: str
    token: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class _PairingCredential:
    digest: bytes
    expires_at: datetime


class PairingRegistry:
    """只在内存中保存一次性配对凭据的摘要。"""

    def __init__(self) -> None:
        self._credentials: dict[str, _PairingCredential] = {}

    def create(self, *, session_id: str, ttl_seconds: float) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        self._credentials[session_id] = _PairingCredential(
            digest=self.digest(token),
            expires_at=expires_at,
        )
        return token, expires_at

    def consume(self, *, session_id: str, token: str) -> bool:
        credential = self._credentials.get(session_id)
        if credential is None:
            return False
        if credential.expires_at <= datetime.now(timezone.utc):
            self._credentials.pop(session_id, None)
            return False
        if not hmac.compare_digest(credential.digest, self.digest(token)):
            return False
        self._credentials.pop(session_id, None)
        return True

    def clear(self, session_id: str) -> None:
        self._credentials.pop(session_id, None)

    @staticmethod
    def digest(token: str) -> bytes:
        return hashlib.sha256(token.encode("utf-8")).digest()
