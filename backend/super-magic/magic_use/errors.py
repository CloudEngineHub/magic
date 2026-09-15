from __future__ import annotations

from enum import Enum


class BrowserErrorCode(str, Enum):
    INVALID_CONFIG = "invalid_config"
    BACKEND_UNAVAILABLE = "backend_unavailable"
    CONNECTION_FAILED = "connection_failed"
    VERSION_MISMATCH = "version_mismatch"
    SESSION_CLOSED = "session_closed"
    PAGE_NOT_FOUND = "page_not_found"
    PAGE_CLOSED = "page_closed"
    PAGE_EXPIRED = "page_expired"
    RESOURCE_LIMIT = "resource_limit"
    NAVIGATION_FAILED = "navigation_failed"
    CAPABILITY_UNAVAILABLE = "capability_unavailable"
    SCRIPT_NOT_FOUND = "script_not_found"
    SCRIPT_INJECTION_FAILED = "script_injection_failed"
    SNAPSHOT_FAILED = "snapshot_failed"
    REF_NOT_FOUND = "ref_not_found"
    STALE_REF = "stale_ref"
    AMBIGUOUS_REF = "ambiguous_ref"
    ACTION_FAILED = "action_failed"
    SCREENSHOT_FAILED = "screenshot_failed"


class BrowserSDKError(Exception):
    def __init__(self, code: BrowserErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class BrowserConfigError(BrowserSDKError):
    def __init__(self, message: str) -> None:
        super().__init__(BrowserErrorCode.INVALID_CONFIG, message)


class BrowserConnectionError(BrowserSDKError):
    def __init__(self, message: str, *, version_mismatch: bool = False) -> None:
        code = BrowserErrorCode.VERSION_MISMATCH if version_mismatch else BrowserErrorCode.CONNECTION_FAILED
        super().__init__(code, message)


class BrowserPageError(BrowserSDKError):
    def __init__(self, message: str, *, closed: bool = False, expired: bool = False) -> None:
        code = (
            BrowserErrorCode.PAGE_EXPIRED
            if expired
            else BrowserErrorCode.PAGE_CLOSED
            if closed
            else BrowserErrorCode.PAGE_NOT_FOUND
        )
        super().__init__(code, message)


class ScriptInjectionError(BrowserSDKError):
    def __init__(self, message: str) -> None:
        super().__init__(BrowserErrorCode.SCRIPT_INJECTION_FAILED, message)


class ElementScanError(BrowserSDKError):
    def __init__(self, message: str) -> None:
        super().__init__(BrowserErrorCode.SNAPSHOT_FAILED, message)


class RefResolutionError(BrowserSDKError):
    pass


class RefNotFoundError(RefResolutionError):
    def __init__(self, ref: str) -> None:
        super().__init__(BrowserErrorCode.REF_NOT_FOUND, f"Element ref does not exist: {ref}")


class StaleRefError(RefResolutionError):
    def __init__(self, ref: str) -> None:
        super().__init__(BrowserErrorCode.STALE_REF, f"Element ref is stale; take a new snapshot: {ref}")


class AmbiguousRefError(RefResolutionError):
    def __init__(self, ref: str) -> None:
        super().__init__(BrowserErrorCode.AMBIGUOUS_REF, f"Element ref no longer resolves uniquely: {ref}")
