from __future__ import annotations

import asyncio
import inspect
from datetime import timezone
from uuid import uuid4

from magic_use.errors import BrowserConnectionError
from magic_use.extension.config import ChromeExtensionConfig
from magic_use.extension.pairing import PairingDetails, PairingRegistry
from magic_use.extension.peer import ExtensionPeer, WebSocketConnection
from magic_use.extension.tunnel import TunnelLease, TunnelProvider
from magic_use.remote_protocol.codec import MessageCodec
from magic_use.remote_protocol.messages import BrowserRemoteMessage, ExtensionHello, HelloAck, MessageType
from magic_use.remote_protocol.version import negotiate_version


class ExtensionRelayServer:
    def __init__(self, *, config: ChromeExtensionConfig, tunnel_provider: TunnelProvider) -> None:
        self.config = config
        self._tunnel_provider = tunnel_provider
        self._codec = MessageCodec(
            max_message_bytes=config.max_message_bytes,
            max_binary_chunk_bytes=config.max_binary_chunk_bytes,
        )
        self._pairing = PairingRegistry()
        self._server: object | None = None
        self._tunnel_lease: TunnelLease | None = None
        self._session_id: str | None = None
        self._peer: ExtensionPeer | None = None
        self._peer_ready = asyncio.Event()
        self._closed = False

    @property
    def peer(self) -> ExtensionPeer | None:
        return self._peer

    async def start(self, session_id: str) -> PairingDetails:
        if self._server is not None:
            raise RuntimeError("Extension relay is already running")
        self._session_id = session_id
        try:
            from websockets.asyncio.server import serve

            server = await serve(
                self._handle_connection,
                self.config.relay_host,
                self.config.relay_port,
                max_size=self.config.max_message_bytes,
                ping_interval=None,
                compression=None,
            )
            self._server = server
            sockets = getattr(server, "sockets", None)
            if not sockets:
                raise BrowserConnectionError("Extension relay did not expose a listening socket")
            local_port = int(sockets[0].getsockname()[1])
            self._tunnel_lease = await self._tunnel_provider.open(
                local_host=self.config.relay_host,
                local_port=local_port,
            )
            token, expires_at = self._pairing.create(
                session_id=session_id,
                ttl_seconds=self.config.pairing_ttl_seconds,
            )
            return PairingDetails(
                session_id=session_id,
                endpoint=self._tunnel_lease.endpoint,
                token=token,
                expires_at=expires_at,
            )
        except BaseException:
            await self.close()
            raise

    async def wait_for_peer(self, timeout_seconds: float | None = None) -> ExtensionPeer:
        if timeout_seconds is None:
            await self._peer_ready.wait()
        else:
            await asyncio.wait_for(self._peer_ready.wait(), timeout=timeout_seconds)
        peer = self._peer
        if peer is None:
            raise BrowserConnectionError("Chrome extension did not complete pairing")
        return peer

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        session_id = self._session_id
        if session_id is not None:
            self._pairing.clear(session_id)
        peer = self._peer
        self._peer = None
        tunnel_lease = self._tunnel_lease
        self._tunnel_lease = None
        server = self._server
        self._server = None
        try:
            if peer is not None:
                await peer.close()
        finally:
            try:
                if tunnel_lease is not None:
                    await self._tunnel_provider.close(tunnel_lease.id)
            finally:
                if server is not None:
                    close = getattr(server, "close", None)
                    wait_closed = getattr(server, "wait_closed", None)
                    if callable(close):
                        close()
                    if callable(wait_closed):
                        result = wait_closed()
                        if inspect.isawaitable(result):
                            await result

    async def _handle_connection(self, connection: WebSocketConnection) -> None:
        try:
            raw = await asyncio.wait_for(connection.recv(decode=None), timeout=self.config.pairing_ttl_seconds)
            if not isinstance(raw, str):
                await connection.close(code=1003, reason="hello must be JSON")
                return
            message = self._codec.decode_message(raw)
            if message.type is not MessageType.HELLO:
                await connection.close(code=1008, reason="hello required")
                return
            if message.session_id != self._session_id:
                await connection.close(code=1008, reason="session mismatch")
                return
            hello = ExtensionHello.from_payload(message.payload)
            protocol_version = negotiate_version(hello.supported_versions)
            peer = await self._authenticate_peer(hello, protocol_version)
            resume_token = peer.rotate_resume_token()
            ack = HelloAck(
                protocol_version=protocol_version,
                resume_token=resume_token,
                lease_expires_at=peer.lease_expires_at.astimezone(timezone.utc).isoformat(),
                heartbeat_interval_seconds=self.config.heartbeat_interval_seconds,
                max_message_bytes=self.config.max_message_bytes,
                max_binary_chunk_bytes=self.config.max_binary_chunk_bytes,
                max_binary_transfer_bytes=self.config.max_binary_transfer_bytes,
                acknowledged_event_sequence=peer.last_event_sequence,
            )
            await connection.send(
                self._codec.encode_message(
                    BrowserRemoteMessage(
                        protocol_version=protocol_version,
                        session_id=peer.session_id,
                        message_id=uuid4().hex,
                        type=MessageType.HELLO_ACK,
                        payload=ack.to_payload(),
                    )
                )
            )
            generation = await peer.attach(connection)
            self._peer = peer
            self._peer_ready.set()
            await peer.serve(connection, generation)
        except asyncio.CancelledError:
            raise
        except Exception:
            await connection.close(code=1008, reason="pairing failed")

    async def _authenticate_peer(self, hello: ExtensionHello, protocol_version: str) -> ExtensionPeer:
        session_id = self._session_id
        if session_id is None:
            raise BrowserConnectionError("Extension relay session is not initialized")
        if hello.pairing_token is not None:
            if not self._pairing.consume(session_id=session_id, token=hello.pairing_token):
                raise BrowserConnectionError("Chrome extension pairing credential is invalid or expired")
            return ExtensionPeer(
                session_id=session_id,
                protocol_version=protocol_version,
                identity=hello.identity,
                capabilities=hello.capabilities,
                codec=self._codec,
                config=self.config,
            )
        peer = self._peer
        if peer is None or hello.resume_token is None or not peer.can_resume(hello.resume_token):
            raise BrowserConnectionError("Chrome extension resume credential is invalid or expired")
        return peer
