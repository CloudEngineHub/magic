from __future__ import annotations

import asyncio
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Protocol
from uuid import uuid4

from magic_use.errors import BrowserConnectionError, BrowserErrorCode, BrowserSDKError
from magic_use.extension.config import ChromeExtensionConfig
from magic_use.extension.pairing import PairingRegistry
from magic_use.models.common import JsonValue
from magic_use.remote_protocol.codec import BinaryChunk, MessageCodec
from magic_use.remote_protocol.messages import (
    BrowserRemoteMessage,
    ExtensionCapabilities,
    ExtensionIdentity,
    MessageType,
    RemoteError,
    RemoteMethod,
)


class WebSocketConnection(Protocol):
    async def recv(self, decode: bool | None = None) -> str | bytes: ...

    async def send(self, message: str | bytes) -> None: ...

    async def close(self, code: int = 1000, reason: str = "") -> None: ...


class ExtensionPeer:
    def __init__(
        self,
        *,
        session_id: str,
        protocol_version: str,
        identity: ExtensionIdentity,
        capabilities: ExtensionCapabilities,
        codec: MessageCodec,
        config: ChromeExtensionConfig,
    ) -> None:
        self.session_id = session_id
        self.protocol_version = protocol_version
        self.identity = identity
        self.capabilities = capabilities
        self._codec = codec
        self._config = config
        self._connection: WebSocketConnection | None = None
        self._connection_generation = 0
        self._send_lock = asyncio.Lock()
        self._pending: dict[str, asyncio.Future[dict[str, JsonValue]]] = {}
        self._events: asyncio.Queue[BrowserRemoteMessage] = asyncio.Queue(
            maxsize=config.max_event_buffer_size
        )
        self._binary_chunks: dict[str, dict[int, bytes]] = {}
        self._binary_chunk_counts: dict[str, int] = {}
        self._binary_request_ids: dict[str, str] = {}
        self._binary_condition = asyncio.Condition()
        self._connected = asyncio.Event()
        self._closed = False
        self._last_event_sequence = 0
        self._last_message_at = datetime.now(timezone.utc)
        self._disconnected_at: datetime | None = None
        self._lease_expires_at = self._new_lease_expiry()
        self._resume_digest = b""

    @property
    def connected(self) -> bool:
        return self._connected.is_set() and not self._closed

    @property
    def connection_generation(self) -> int:
        return self._connection_generation

    @property
    def lease_expires_at(self) -> datetime:
        return self._lease_expires_at

    @property
    def last_event_sequence(self) -> int:
        return self._last_event_sequence

    def rotate_resume_token(self) -> str:
        token = secrets.token_urlsafe(32)
        self._resume_digest = PairingRegistry.digest(token)
        return token

    def can_resume(self, token: str) -> bool:
        if self._closed or not self._resume_digest:
            return False
        if self._lease_expires_at <= datetime.now(timezone.utc):
            return False
        if self._disconnected_at is None:
            return False
        if datetime.now(timezone.utc) - self._disconnected_at > timedelta(
            seconds=self._config.reconnect_grace_period_seconds
        ):
            return False
        return hmac.compare_digest(self._resume_digest, PairingRegistry.digest(token))

    async def attach(self, connection: WebSocketConnection) -> int:
        self._connection_generation += 1
        generation = self._connection_generation
        previous = self._connection
        self._connection = connection
        self._disconnected_at = None
        self._last_message_at = datetime.now(timezone.utc)
        self._extend_lease()
        self._connected.set()
        if previous is not None and previous is not connection:
            await previous.close(code=1012, reason="connection replaced")
        return generation

    async def serve(self, connection: WebSocketConnection, generation: int) -> None:
        heartbeat = asyncio.create_task(self._heartbeat_loop(generation))
        try:
            while not self._closed and generation == self._connection_generation:
                frame = await connection.recv(decode=None)
                self._last_message_at = datetime.now(timezone.utc)
                self._extend_lease()
                if isinstance(frame, bytes):
                    await self._store_binary_chunk(self._codec.decode_binary_chunk(frame))
                    continue
                await self._handle_message(self._codec.decode_message(frame))
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        finally:
            heartbeat.cancel()
            await asyncio.gather(heartbeat, return_exceptions=True)
            if generation == self._connection_generation:
                self._connection = None
                self._connected.clear()
                self._disconnected_at = datetime.now(timezone.utc)
                self._fail_pending(BrowserConnectionError("Chrome extension connection was interrupted"))
                async with self._binary_condition:
                    self._binary_condition.notify_all()

    async def request(
        self,
        method: RemoteMethod,
        payload: dict[str, JsonValue] | None = None,
        *,
        logical_session_id: str | None = None,
        timeout_seconds: float | None = None,
    ) -> dict[str, JsonValue]:
        if len(self._pending) >= self._config.max_pending_requests:
            raise BrowserConnectionError("Chrome extension request concurrency limit was reached")
        if not self.connected:
            raise BrowserConnectionError("Chrome extension is not connected")
        message_id = uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self._pending[message_id] = future
        request_payload: dict[str, JsonValue] = {"method": method.value, "params": payload or {}}
        if logical_session_id is not None:
            request_payload["logical_session_id"] = logical_session_id
        message = BrowserRemoteMessage(
            protocol_version=self.protocol_version,
            session_id=self.session_id,
            message_id=message_id,
            type=MessageType.REQUEST,
            payload=request_payload,
        )
        try:
            await self._send(message)
            response = await asyncio.wait_for(
                future,
                timeout=timeout_seconds or self._config.request_timeout_seconds,
            )
            json_transfer = response.get("json_transfer")
            if isinstance(json_transfer, dict):
                transfer_id = json_transfer.get("transfer_id")
                chunk_count = json_transfer.get("chunk_count")
                if not isinstance(transfer_id, str) or not isinstance(chunk_count, int):
                    raise BrowserConnectionError("Chrome extension returned invalid JSON transfer metadata")
                decoded = json.loads(
                    await self.receive_binary_transfer(
                        transfer_id=transfer_id,
                        chunk_count=chunk_count,
                        timeout_seconds=timeout_seconds or self._config.request_timeout_seconds,
                    )
                )
                if not isinstance(decoded, dict):
                    raise BrowserConnectionError("Chrome extension returned a non-object JSON transfer")
                return decoded
            return response
        except asyncio.CancelledError:
            await self._cancel_request(message_id)
            self._discard_binary_transfers(message_id)
            raise
        except TimeoutError as error:
            await self._cancel_request(message_id)
            self._discard_binary_transfers(message_id)
            raise BrowserConnectionError(f"Chrome extension request timed out: {method.value}") from error
        except BrowserSDKError:
            self._discard_binary_transfers(message_id)
            raise
        finally:
            self._pending.pop(message_id, None)

    async def receive_binary_transfer(
        self,
        *,
        transfer_id: str,
        chunk_count: int,
        timeout_seconds: float | None = None,
    ) -> bytes:
        async def wait_for_transfer() -> bytes:
            async with self._binary_condition:
                while len(self._binary_chunks.get(transfer_id, {})) < chunk_count:
                    if not self.connected:
                        raise BrowserConnectionError("Chrome extension binary transfer was interrupted")
                    await self._binary_condition.wait()
                chunks = self._binary_chunks.pop(transfer_id)
                self._binary_chunk_counts.pop(transfer_id, None)
                self._binary_request_ids.pop(transfer_id, None)
                return b"".join(chunks[index] for index in range(chunk_count))

        try:
            if timeout_seconds is None:
                return await wait_for_transfer()
            return await asyncio.wait_for(wait_for_transfer(), timeout=timeout_seconds)
        except BaseException:
            async with self._binary_condition:
                self._binary_chunks.pop(transfer_id, None)
                self._binary_chunk_counts.pop(transfer_id, None)
                self._binary_request_ids.pop(transfer_id, None)
            raise

    def drain_events(self, logical_session_id: str | None = None) -> tuple[BrowserRemoteMessage, ...]:
        result: list[BrowserRemoteMessage] = []
        retained: list[BrowserRemoteMessage] = []
        while True:
            try:
                message = self._events.get_nowait()
            except asyncio.QueueEmpty:
                for message in retained:
                    self._events.put_nowait(message)
                return tuple(result)
            event_session_id = message.payload.get("logical_session_id")
            if logical_session_id is None or event_session_id == logical_session_id:
                result.append(message)
            else:
                retained.append(message)

    async def close(self, reason: str = "session closed") -> None:
        if self._closed:
            return
        self._closed = True
        self._connected.clear()
        connection = self._connection
        self._connection = None
        self._resume_digest = b""
        self._fail_pending(BrowserConnectionError("Chrome extension session is closed"))
        async with self._binary_condition:
            self._binary_chunks.clear()
            self._binary_chunk_counts.clear()
            self._binary_request_ids.clear()
            self._binary_condition.notify_all()
        if connection is not None:
            try:
                await self._send(
                    BrowserRemoteMessage(
                        protocol_version=self.protocol_version,
                        session_id=self.session_id,
                        message_id=uuid4().hex,
                        type=MessageType.CLOSE,
                        payload={"reason": reason},
                    ),
                    connection=connection,
                )
            finally:
                await connection.close(code=1000, reason=reason)

    async def _handle_message(self, message: BrowserRemoteMessage) -> None:
        if message.session_id != self.session_id or message.protocol_version != self.protocol_version:
            raise BrowserConnectionError("Chrome extension sent a message for another session or protocol version")
        if message.type is MessageType.RESPONSE:
            self._resolve_response(message)
        elif message.type is MessageType.ERROR:
            self._resolve_error(message)
        elif message.type is MessageType.EVENT:
            if message.sequence is not None and message.sequence > self._last_event_sequence:
                self._last_event_sequence = message.sequence
                if self._events.full():
                    self._events.get_nowait()
                self._events.put_nowait(message)
            await self._send(
                BrowserRemoteMessage(
                    protocol_version=self.protocol_version,
                    session_id=self.session_id,
                    message_id=uuid4().hex,
                    type=MessageType.EVENT_ACK,
                    payload={"sequence": self._last_event_sequence},
                )
            )
        elif message.type is MessageType.PING:
            await self._send(
                BrowserRemoteMessage(
                    protocol_version=self.protocol_version,
                    session_id=self.session_id,
                    message_id=uuid4().hex,
                    type=MessageType.PONG,
                )
            )
        elif message.type is MessageType.CLOSE:
            await self.close("extension closed the session")

    async def _store_binary_chunk(self, chunk: BinaryChunk) -> None:
        transfer_id = chunk.header.transfer_id
        request_id = chunk.header.request_id
        if request_id is None or request_id not in self._pending:
            raise BrowserConnectionError("Chrome extension sent binary data for an unknown request")
        if chunk.header.chunk_count * self._config.max_binary_chunk_bytes > self._config.max_binary_transfer_bytes:
            raise BrowserConnectionError("Chrome extension binary transfer exceeds the configured size limit")
        async with self._binary_condition:
            if transfer_id not in self._binary_chunks and len(self._binary_chunks) >= self._config.max_pending_requests:
                raise BrowserConnectionError("Chrome extension opened too many binary transfers")
            expected = self._binary_chunk_counts.setdefault(transfer_id, chunk.header.chunk_count)
            if expected != chunk.header.chunk_count:
                raise BrowserConnectionError("Chrome extension changed a binary transfer chunk count")
            expected_request_id = self._binary_request_ids.setdefault(transfer_id, request_id)
            if expected_request_id != request_id:
                raise BrowserConnectionError("Chrome extension changed a binary transfer request ID")
            self._binary_chunks.setdefault(transfer_id, {})[chunk.header.chunk_index] = chunk.data
            self._binary_condition.notify_all()

    def _discard_binary_transfers(self, request_id: str) -> None:
        transfer_ids = [
            transfer_id
            for transfer_id, current_request_id in self._binary_request_ids.items()
            if current_request_id == request_id
        ]
        for transfer_id in transfer_ids:
            self._binary_chunks.pop(transfer_id, None)
            self._binary_chunk_counts.pop(transfer_id, None)
            self._binary_request_ids.pop(transfer_id, None)

    def _resolve_response(self, message: BrowserRemoteMessage) -> None:
        future = self._pending.get(message.request_id or "")
        if future is not None and not future.done():
            future.set_result(message.payload)

    def _resolve_error(self, message: BrowserRemoteMessage) -> None:
        future = self._pending.get(message.request_id or "")
        if future is None or future.done():
            return
        remote = RemoteError.from_payload(message.payload)
        try:
            code = BrowserErrorCode(remote.code)
        except ValueError:
            code = BrowserErrorCode.ACTION_FAILED
        future.set_exception(BrowserSDKError(code, remote.message))

    async def _cancel_request(self, request_id: str) -> None:
        if not self.connected:
            return
        try:
            await self._send(
                BrowserRemoteMessage(
                    protocol_version=self.protocol_version,
                    session_id=self.session_id,
                    message_id=uuid4().hex,
                    type=MessageType.CANCEL,
                    request_id=request_id,
                )
            )
        except Exception:
            return

    async def _heartbeat_loop(self, generation: int) -> None:
        try:
            while not self._closed and generation == self._connection_generation:
                await asyncio.sleep(self._config.heartbeat_interval_seconds)
                if self._lease_expires_at <= datetime.now(timezone.utc):
                    await self.close("session lease expired")
                    return
                stale_after = self._config.heartbeat_interval_seconds * 2.5
                if (datetime.now(timezone.utc) - self._last_message_at).total_seconds() > stale_after:
                    connection = self._connection
                    if connection is not None:
                        await connection.close(code=1011, reason="heartbeat timeout")
                    return
                await self._send(
                    BrowserRemoteMessage(
                        protocol_version=self.protocol_version,
                        session_id=self.session_id,
                        message_id=uuid4().hex,
                        type=MessageType.PING,
                    )
                )
        except asyncio.CancelledError:
            raise

    async def _send(
        self,
        message: BrowserRemoteMessage,
        *,
        connection: WebSocketConnection | None = None,
    ) -> None:
        target = connection or self._connection
        if target is None:
            raise BrowserConnectionError("Chrome extension is not connected")
        encoded = self._codec.encode_message(message)
        async with self._send_lock:
            await target.send(encoded)

    def _extend_lease(self) -> None:
        self._lease_expires_at = self._new_lease_expiry()

    def _new_lease_expiry(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(seconds=self._config.session_lease_ttl_seconds)

    def _fail_pending(self, error: Exception) -> None:
        for future in self._pending.values():
            if not future.done():
                future.set_exception(error)
