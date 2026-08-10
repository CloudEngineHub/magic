import {
  assertEnvelope,
  createMessage,
  encodeBinaryChunk,
  MessageType,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  utf8Size,
} from "./protocol.js";
import { ProtocolError } from "./router.js";

export class RelayConnection {
  constructor({ state, router, controller, notifyState }) {
    this.state = state;
    this.router = router;
    this.controller = controller;
    this.notifyState = notifyState;
    this.socket = null;
    this.manualClose = false;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.pendingRequests = new Map();
  }

  async restore() {
    await this.state.restore();
    if (this.state.endpoint && this.state.resumeToken) await this.connect();
  }

  async pair(details) {
    if (this.socket || this.state.endpoint) await this.disconnect();
    this.manualClose = false;
    await this.state.beginPairing(details);
    await this.connect();
  }

  async connect() {
    if (!this.state.endpoint || !this.state.sessionId) throw new Error("Connection details are missing");
    if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) return;
    await this.state.setStatus("connecting");
    this.notifyState();
    const socket = new WebSocket(this.state.endpoint);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("open", () => {
      try {
        this.sendHello();
      } catch (error) {
        void this.handleProtocolFailure(error);
      }
    });
    socket.addEventListener("message", (event) => {
      void this.handleFrame(event.data).catch((error) => {
        void this.handleProtocolFailure(error);
      });
    });
    socket.addEventListener("close", () => {
      void this.handleClose().catch((error) => this.handleConnectionFailure(error));
    });
    socket.addEventListener("error", () => {
      void this.handleConnectionFailure(new Error("WebSocket connection failed"));
    });
  }

  async disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const controller of this.pendingRequests.values()) controller.abort();
    this.pendingRequests.clear();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send(createMessage({ sessionId: this.state.sessionId, type: MessageType.CLOSE, payload: { reason: "user disconnected" } }));
    }
    this.socket?.close(1000, "user disconnected");
    this.socket = null;
    await this.controller.detachAll("user disconnected");
    this.controller.clearSessions();
    await this.state.clear();
    this.notifyState();
  }

  sendEvent(method, params) {
    if (!this.state.sessionId || (!this.state.pairingToken && !this.state.resumeToken)) return;
    const logicalSessionId = typeof params?.logical_session_id === "string"
      ? params.logical_session_id
      : undefined;
    const message = createMessage({
      protocolVersion: this.state.protocolVersion,
      sessionId: this.state.sessionId,
      type: MessageType.EVENT,
      payload: { method, params, ...(logicalSessionId ? { logical_session_id: logicalSessionId } : {}) },
      sequence: this.state.nextEventSequence(),
    });
    this.state.queueEvent(message);
    if (this.socket?.readyState === WebSocket.OPEN && this.state.status === "connected") {
      this.send(message);
    }
  }

  sendHello() {
    const identity = {
      extension_version: chrome.runtime.getManifest().version,
      browser_version: browserVersion(),
      device_name: navigator.userAgentData?.platform || navigator.platform || "Chrome",
      platform: navigator.userAgentData?.platform || navigator.platform || "unknown",
    };
    const capabilities = {
      accessibility_tree: true,
      dom_snapshot: true,
      page_script: true,
      screenshots: true,
      labeled_screenshots: true,
      console: true,
      network: true,
      file_upload: false,
      downloads: true,
    };
    const payload = {
      supported_versions: SUPPORTED_PROTOCOL_VERSIONS,
      identity,
      capabilities,
      last_event_sequence: this.state.confirmedEventSequence,
    };
    if (this.state.pairingToken) payload.pairing_token = this.state.pairingToken;
    else payload.resume_token = this.state.resumeToken;
    this.send(createMessage({
      sessionId: this.state.sessionId,
      type: MessageType.HELLO,
      payload,
    }));
  }

  async handleFrame(frame) {
    if (typeof frame !== "string") return;
    if (utf8Size(frame) > this.state.maxMessageBytes) {
      this.socket?.close(1009, "message too large");
      return;
    }
    const message = assertEnvelope(JSON.parse(frame));
    if (message.session_id !== this.state.sessionId) return;
    if (message.type === MessageType.HELLO_ACK) {
      if (message.protocol_version !== message.payload.protocol_version) {
        throw new Error("Browser handshake response contains conflicting protocol versions");
      }
      await this.state.acceptHelloAck(message.payload);
      this.reconnectAttempt = 0;
      for (const pendingEvent of this.state.pendingEvents) this.send(pendingEvent);
      this.notifyState();
    } else if (message.type === MessageType.REQUEST) {
      void this.handleRequest(message);
    } else if (message.type === MessageType.CANCEL) {
      this.pendingRequests.get(message.request_id)?.abort();
    } else if (message.type === MessageType.EVENT_ACK) {
      this.state.ackEvents(message.payload?.sequence || 0);
    } else if (message.type === MessageType.PING) {
      this.send(createMessage({ protocolVersion: this.state.protocolVersion, sessionId: this.state.sessionId, type: MessageType.PONG }));
    } else if (message.type === MessageType.CLOSE) {
      await this.disconnect();
    }
  }

  async handleRequest(message) {
    const method = message.payload?.method;
    const params = message.payload?.params || {};
    const logicalSessionId = message.payload?.logical_session_id;
    const controller = new AbortController();
    this.pendingRequests.set(message.message_id, controller);
    try {
      controller.signal.throwIfAborted();
      const result = await this.router.handle(method, params, controller.signal, logicalSessionId);
      controller.signal.throwIfAborted();
      const responsePayload = result || {};
      const binaryBase64 = responsePayload.binary_payload_base64;
      if (typeof binaryBase64 === "string") {
        delete responsePayload.binary_payload_base64;
        const mediaType = typeof responsePayload.binary_media_type === "string"
          ? responsePayload.binary_media_type
          : "application/octet-stream";
        delete responsePayload.binary_media_type;
        responsePayload.binary_transfer = await this.sendBytesTransfer(
          base64Bytes(binaryBase64),
          message.message_id,
          mediaType,
          controller.signal,
        );
      } else {
        const serialized = JSON.stringify(responsePayload);
        if (utf8Size(serialized) > Math.floor(this.state.maxMessageBytes * 0.75)) {
          const transfer = await this.sendBytesTransfer(
            new TextEncoder().encode(serialized),
            message.message_id,
            "application/json",
            controller.signal,
          );
          for (const key of Object.keys(responsePayload)) delete responsePayload[key];
          responsePayload.json_transfer = transfer;
        }
      }
      this.send(createMessage({
        protocolVersion: this.state.protocolVersion,
        sessionId: this.state.sessionId,
        type: MessageType.RESPONSE,
        requestId: message.message_id,
        payload: responsePayload,
      }));
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : error?.name === "AbortError" ? "action_failed" : "action_failed";
      this.trySend(createMessage({
        protocolVersion: this.state.protocolVersion,
        sessionId: this.state.sessionId,
        type: MessageType.ERROR,
        requestId: message.message_id,
        payload: { code, message: safeErrorMessage(error), retryable: error instanceof ProtocolError && error.retryable },
      }));
    } finally {
      this.pendingRequests.delete(message.message_id);
    }
  }

  async handleProtocolFailure(error) {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const controller of this.pendingRequests.values()) controller.abort();
    this.pendingRequests.clear();
    try {
      await this.state.setStatus("error", safeErrorMessage(error));
    } catch {
      // Storage failures must not leave a malformed protocol connection active.
    } finally {
      this.notifyState();
      this.socket?.close(1002, "protocol error");
    }
  }

  async handleConnectionFailure(error) {
    try {
      await this.state.setStatus("error", safeErrorMessage(error));
    } catch {
      // Connection state remains available in memory when extension storage fails.
    }
    this.notifyState();
  }

  async handleClose() {
    this.socket = null;
    for (const controller of this.pendingRequests.values()) controller.abort();
    this.pendingRequests.clear();
    if (this.manualClose || !this.state.resumeToken) return;
    await this.state.setStatus("reconnecting");
    this.notifyState();
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 1.6 ** (this.reconnectAttempt - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch((error) => this.handleConnectionFailure(error));
    }, delay);
  }

  send(message) {
    const encoded = JSON.stringify(message);
    if (utf8Size(encoded) > this.state.maxMessageBytes) throw new Error("Message exceeds the negotiated size limit");
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Relay is not connected");
    this.socket.send(encoded);
  }

  trySend(message) {
    try {
      this.send(message);
      return true;
    } catch {
      return false;
    }
  }

  async sendBytesTransfer(bytes, requestId, mediaType, signal) {
    if (bytes.byteLength > this.state.maxBinaryTransferBytes) {
      throw new Error("Binary transfer exceeds the negotiated size limit");
    }
    const chunkSize = this.state.maxBinaryChunkBytes;
    const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / chunkSize));
    const transferId = crypto.randomUUID();
    for (let index = 0; index < chunkCount; index += 1) {
      signal?.throwIfAborted();
      if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Relay is not connected");
      const data = bytes.slice(index * chunkSize, Math.min(bytes.byteLength, (index + 1) * chunkSize));
      this.socket.send(encodeBinaryChunk({
        transfer_id: transferId,
        chunk_index: index,
        chunk_count: chunkCount,
        request_id: requestId,
        media_type: mediaType,
      }, data));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return { transfer_id: transferId, chunk_count: chunkCount, media_type: mediaType };
  }
}

function base64Bytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function browserVersion() {
  const match = navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/);
  return match?.[1] || "";
}

function safeErrorMessage(error) {
  if (error?.name === "AbortError") return "The browser request was cancelled";
  return error instanceof Error ? error.message : "Browser request failed";
}
