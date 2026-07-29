from magic_use.remote_protocol.codec import BinaryChunk, MessageCodec
from magic_use.remote_protocol.messages import (
    BinaryChunkHeader,
    BrowserRemoteMessage,
    ExtensionCapabilities,
    ExtensionHello,
    ExtensionIdentity,
    HelloAck,
    MessageType,
    PageDescriptor,
    RemoteError,
    RemoteMethod,
)
from magic_use.remote_protocol.version import PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, negotiate_version

__all__ = [
    "PROTOCOL_VERSION",
    "SUPPORTED_PROTOCOL_VERSIONS",
    "BinaryChunk",
    "BinaryChunkHeader",
    "BrowserRemoteMessage",
    "ExtensionCapabilities",
    "ExtensionHello",
    "ExtensionIdentity",
    "HelloAck",
    "MessageCodec",
    "MessageType",
    "PageDescriptor",
    "RemoteError",
    "RemoteMethod",
    "negotiate_version",
]
