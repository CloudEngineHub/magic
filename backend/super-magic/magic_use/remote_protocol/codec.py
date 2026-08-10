from __future__ import annotations

import json
import struct
from dataclasses import dataclass

from magic_use.models.common import JsonValue
from magic_use.remote_protocol.messages import (
    BinaryChunkHeader,
    BrowserRemoteMessage,
)

_HEADER_LENGTH = struct.Struct("!I")


@dataclass(frozen=True, slots=True)
class BinaryChunk:
    header: BinaryChunkHeader
    data: bytes


class MessageCodec:
    def __init__(self, *, max_message_bytes: int, max_binary_chunk_bytes: int) -> None:
        if max_message_bytes < 1 or max_binary_chunk_bytes < 1:
            raise ValueError("message size limits must be positive")
        self.max_message_bytes = max_message_bytes
        self.max_binary_chunk_bytes = max_binary_chunk_bytes

    def encode_message(self, message: BrowserRemoteMessage) -> str:
        encoded = json.dumps(message.to_payload(), ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > self.max_message_bytes:
            raise ValueError("remote protocol message exceeds the configured size limit")
        return encoded

    def decode_message(self, value: str | bytes) -> BrowserRemoteMessage:
        raw = value.encode("utf-8") if isinstance(value, str) else value
        if len(raw) > self.max_message_bytes:
            raise ValueError("remote protocol message exceeds the configured size limit")
        payload: JsonValue = json.loads(raw)
        return BrowserRemoteMessage.from_payload(payload)

    def encode_binary_chunk(self, chunk: BinaryChunk) -> bytes:
        if len(chunk.data) > self.max_binary_chunk_bytes:
            raise ValueError("binary chunk exceeds the configured size limit")
        header = json.dumps(chunk.header.to_payload(), separators=(",", ":")).encode("utf-8")
        if len(header) > self.max_message_bytes:
            raise ValueError("binary chunk header exceeds the configured size limit")
        return _HEADER_LENGTH.pack(len(header)) + header + chunk.data

    def decode_binary_chunk(self, value: bytes) -> BinaryChunk:
        if len(value) < _HEADER_LENGTH.size:
            raise ValueError("binary chunk is missing its header length")
        header_size = _HEADER_LENGTH.unpack(value[: _HEADER_LENGTH.size])[0]
        if header_size > self.max_message_bytes:
            raise ValueError("binary chunk header exceeds the configured size limit")
        offset = _HEADER_LENGTH.size + header_size
        if offset > len(value):
            raise ValueError("binary chunk header is truncated")
        data = value[offset:]
        if len(data) > self.max_binary_chunk_bytes:
            raise ValueError("binary chunk exceeds the configured size limit")
        payload: JsonValue = json.loads(value[_HEADER_LENGTH.size : offset])
        return BinaryChunk(header=BinaryChunkHeader.from_payload(payload), data=data)
