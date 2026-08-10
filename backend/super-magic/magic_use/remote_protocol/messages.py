from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from magic_use.models.common import JsonValue


class MessageType(str, Enum):
    HELLO = "hello"
    HELLO_ACK = "hello_ack"
    REQUEST = "request"
    RESPONSE = "response"
    ERROR = "error"
    EVENT = "event"
    EVENT_ACK = "event_ack"
    CANCEL = "cancel"
    PING = "ping"
    PONG = "pong"
    CLOSE = "close"


class RemoteMethod(str, Enum):
    SESSION_REGISTER = "session.register"
    SESSION_RELEASE = "session.release"
    SESSION_DESCRIBE = "session.describe"
    PAGE_LIST = "page.list"
    PAGE_OPEN = "page.open"
    PAGE_CLOSE = "page.close"
    PAGE_ACTIVATE = "page.activate"
    PAGE_NAVIGATE = "page.navigate"
    PAGE_WAIT = "page.wait"
    PAGE_EVALUATE = "page.evaluate"
    PAGE_SCREENSHOT = "page.screenshot"
    SCRIPT_REGISTER = "script.register"
    OBSERVATION_ACCESSIBILITY = "observation.accessibility"
    OBSERVATION_DOM_SNAPSHOT = "observation.dom_snapshot"
    ACTION_DISPATCH = "action.dispatch"
    DIAGNOSTICS_CONSOLE = "diagnostics.console"
    DIAGNOSTICS_NETWORK = "diagnostics.network"


@dataclass(frozen=True, slots=True)
class ExtensionIdentity:
    extension_version: str
    browser_version: str
    device_name: str
    platform: str

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "ExtensionIdentity":
        value = _object(payload, "identity")
        return cls(
            extension_version=_string(value, "extension_version"),
            browser_version=_string(value, "browser_version"),
            device_name=_string(value, "device_name"),
            platform=_string(value, "platform"),
        )

    def to_payload(self) -> dict[str, JsonValue]:
        return {
            "extension_version": self.extension_version,
            "browser_version": self.browser_version,
            "device_name": self.device_name,
            "platform": self.platform,
        }


@dataclass(frozen=True, slots=True)
class ExtensionCapabilities:
    accessibility_tree: bool
    dom_snapshot: bool
    page_script: bool
    screenshots: bool
    labeled_screenshots: bool
    console: bool
    network: bool
    file_upload: bool
    downloads: bool

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "ExtensionCapabilities":
        value = _object(payload, "capabilities")
        return cls(
            accessibility_tree=_boolean(value, "accessibility_tree"),
            dom_snapshot=_boolean(value, "dom_snapshot"),
            page_script=_boolean(value, "page_script"),
            screenshots=_boolean(value, "screenshots"),
            labeled_screenshots=_boolean(value, "labeled_screenshots"),
            console=_boolean(value, "console"),
            network=_boolean(value, "network"),
            file_upload=_boolean(value, "file_upload"),
            downloads=_boolean(value, "downloads"),
        )

    def to_payload(self) -> dict[str, JsonValue]:
        return {
            "accessibility_tree": self.accessibility_tree,
            "dom_snapshot": self.dom_snapshot,
            "page_script": self.page_script,
            "screenshots": self.screenshots,
            "labeled_screenshots": self.labeled_screenshots,
            "console": self.console,
            "network": self.network,
            "file_upload": self.file_upload,
            "downloads": self.downloads,
        }


@dataclass(frozen=True, slots=True)
class ExtensionHello:
    supported_versions: tuple[str, ...]
    identity: ExtensionIdentity
    capabilities: ExtensionCapabilities
    pairing_token: str | None = None
    resume_token: str | None = None
    last_event_sequence: int = 0

    def __post_init__(self) -> None:
        if (self.pairing_token is None) == (self.resume_token is None):
            raise ValueError("hello must contain exactly one of pairing_token or resume_token")

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "ExtensionHello":
        value = _object(payload, "hello")
        raw_versions = value.get("supported_versions", [])
        versions = tuple(item for item in raw_versions if isinstance(item, str)) if isinstance(raw_versions, list) else ()
        pairing_token = value.get("pairing_token")
        resume_token = value.get("resume_token")
        sequence = value.get("last_event_sequence", 0)
        return cls(
            supported_versions=versions,
            identity=ExtensionIdentity.from_payload(value.get("identity")),
            capabilities=ExtensionCapabilities.from_payload(value.get("capabilities")),
            pairing_token=pairing_token if isinstance(pairing_token, str) and pairing_token else None,
            resume_token=resume_token if isinstance(resume_token, str) and resume_token else None,
            last_event_sequence=sequence if isinstance(sequence, int) and sequence >= 0 else 0,
        )


@dataclass(frozen=True, slots=True)
class HelloAck:
    protocol_version: str
    resume_token: str
    lease_expires_at: str
    heartbeat_interval_seconds: float
    max_message_bytes: int
    max_binary_chunk_bytes: int
    max_binary_transfer_bytes: int
    acknowledged_event_sequence: int

    def to_payload(self) -> dict[str, JsonValue]:
        return {
            "protocol_version": self.protocol_version,
            "resume_token": self.resume_token,
            "lease_expires_at": self.lease_expires_at,
            "heartbeat_interval_seconds": self.heartbeat_interval_seconds,
            "max_message_bytes": self.max_message_bytes,
            "max_binary_chunk_bytes": self.max_binary_chunk_bytes,
            "max_binary_transfer_bytes": self.max_binary_transfer_bytes,
            "acknowledged_event_sequence": self.acknowledged_event_sequence,
        }


@dataclass(frozen=True, slots=True)
class PageDescriptor:
    page_token: str
    url: str
    title: str
    active: bool
    document_generation: int
    opener_page_token: str | None = None

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "PageDescriptor":
        value = _object(payload, "page")
        generation = value.get("document_generation", 0)
        opener = value.get("opener_page_token")
        return cls(
            page_token=_string(value, "page_token"),
            url=_text(value, "url"),
            title=_text(value, "title"),
            active=_boolean(value, "active"),
            document_generation=generation if isinstance(generation, int) and generation >= 0 else 0,
            opener_page_token=opener if isinstance(opener, str) and opener else None,
        )


@dataclass(frozen=True, slots=True)
class RemoteError:
    code: str
    message: str
    retryable: bool = False

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "RemoteError":
        value = _object(payload, "error")
        return cls(
            code=_string(value, "code"),
            message=_string(value, "message"),
            retryable=_boolean(value, "retryable"),
        )

    def to_payload(self) -> dict[str, JsonValue]:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


@dataclass(frozen=True, slots=True)
class BinaryChunkHeader:
    transfer_id: str
    chunk_index: int
    chunk_count: int
    request_id: str | None = None
    media_type: str = "application/octet-stream"

    def __post_init__(self) -> None:
        if self.chunk_index < 0 or self.chunk_count < 1 or self.chunk_index >= self.chunk_count:
            raise ValueError("invalid binary chunk position")

    def to_payload(self) -> dict[str, JsonValue]:
        payload: dict[str, JsonValue] = {
            "transfer_id": self.transfer_id,
            "chunk_index": self.chunk_index,
            "chunk_count": self.chunk_count,
            "media_type": self.media_type,
        }
        if self.request_id is not None:
            payload["request_id"] = self.request_id
        return payload

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "BinaryChunkHeader":
        value = _object(payload, "binary chunk header")
        index = value.get("chunk_index")
        count = value.get("chunk_count")
        request_id = value.get("request_id")
        return cls(
            transfer_id=_string(value, "transfer_id"),
            chunk_index=index if isinstance(index, int) else -1,
            chunk_count=count if isinstance(count, int) else 0,
            request_id=request_id if isinstance(request_id, str) and request_id else None,
            media_type=_string(value, "media_type") or "application/octet-stream",
        )


@dataclass(frozen=True, slots=True)
class BrowserRemoteMessage:
    protocol_version: str
    session_id: str
    message_id: str
    type: MessageType
    payload: dict[str, JsonValue] = field(default_factory=dict)
    request_id: str | None = None
    sequence: int | None = None

    def __post_init__(self) -> None:
        if self.type in {MessageType.RESPONSE, MessageType.ERROR, MessageType.CANCEL} and self.request_id is None:
            raise ValueError(f"{self.type.value} requires request_id")
        if self.type is MessageType.EVENT and self.sequence is None:
            raise ValueError("event requires sequence")

    def to_payload(self) -> dict[str, JsonValue]:
        value: dict[str, JsonValue] = {
            "protocol_version": self.protocol_version,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "type": self.type.value,
            "payload": self.payload,
        }
        if self.request_id is not None:
            value["request_id"] = self.request_id
        if self.sequence is not None:
            value["sequence"] = self.sequence
        return value

    @classmethod
    def from_payload(cls, payload: JsonValue) -> "BrowserRemoteMessage":
        value = _object(payload, "remote message")
        raw_type = _string(value, "type")
        raw_payload = value.get("payload", {})
        request_id = value.get("request_id")
        sequence = value.get("sequence")
        return cls(
            protocol_version=_string(value, "protocol_version"),
            session_id=_string(value, "session_id"),
            message_id=_string(value, "message_id"),
            type=MessageType(raw_type),
            payload=_object(raw_payload, "payload"),
            request_id=request_id if isinstance(request_id, str) and request_id else None,
            sequence=sequence if isinstance(sequence, int) and sequence >= 0 else None,
        )


def _object(value: JsonValue, name: str) -> dict[str, JsonValue]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def _string(value: dict[str, JsonValue], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item:
        raise ValueError(f"{key} must be a non-empty string")
    return item


def _text(value: dict[str, JsonValue], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str):
        raise ValueError(f"{key} must be a string")
    return item


def _boolean(value: dict[str, JsonValue], key: str) -> bool:
    item = value.get(key)
    return item if isinstance(item, bool) else False
