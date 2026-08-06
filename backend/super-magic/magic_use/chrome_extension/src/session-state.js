import { SUPPORTED_PROTOCOL_VERSIONS } from "./protocol.js";

const STORAGE_KEY = "magicUseBrowserSession";

export class SessionState {
  constructor() {
    this.endpoint = null;
    this.sessionId = null;
    this.pairingToken = null;
    this.resumeToken = null;
    this.protocolVersion = "1.0";
    this.eventSequence = 0;
    this.confirmedEventSequence = 0;
    this.pendingEvents = [];
    this.maxMessageBytes = 4 * 1024 * 1024;
    this.maxBinaryChunkBytes = 1024 * 1024;
    this.maxBinaryTransferBytes = 64 * 1024 * 1024;
    this.status = "disconnected";
    this.lastError = null;
    this.storageQueue = Promise.resolve();
  }

  async restore() {
    const stored = (await chrome.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
    if (!stored || typeof stored !== "object") return;
    Object.assign(this, stored, { pairingToken: null, status: "disconnected" });
  }

  async beginPairing({ endpoint, sessionId, pairingToken }) {
    this.endpoint = endpoint;
    this.sessionId = sessionId;
    this.pairingToken = pairingToken;
    this.resumeToken = null;
    this.eventSequence = 0;
    this.confirmedEventSequence = 0;
    this.pendingEvents = [];
    this.status = "connecting";
    this.lastError = null;
    await this.save();
  }

  async acceptHelloAck(payload) {
    if (!payload || typeof payload !== "object") throw new Error("Invalid Browser handshake response");
    if (typeof payload.protocol_version !== "string" || typeof payload.resume_token !== "string") {
      throw new Error("Browser handshake response is missing session credentials");
    }
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(payload.protocol_version)) {
      throw new Error("Browser handshake response selected an unsupported protocol version");
    }
    for (const key of ["max_message_bytes", "max_binary_chunk_bytes", "max_binary_transfer_bytes"]) {
      if (!Number.isInteger(payload[key]) || payload[key] < 1) {
        throw new Error(`Browser handshake response contains invalid ${key}`);
      }
    }
    if (payload.max_binary_transfer_bytes < payload.max_binary_chunk_bytes) {
      throw new Error("Browser handshake response contains inconsistent binary limits");
    }
    this.protocolVersion = payload.protocol_version;
    this.resumeToken = payload.resume_token;
    this.pairingToken = null;
    this.maxMessageBytes = payload.max_message_bytes;
    this.maxBinaryChunkBytes = payload.max_binary_chunk_bytes;
    this.maxBinaryTransferBytes = payload.max_binary_transfer_bytes;
    this.ackEvents(payload.acknowledged_event_sequence || 0);
    this.status = "connected";
    this.lastError = null;
    await this.save();
  }

  nextEventSequence() {
    this.eventSequence += 1;
    return this.eventSequence;
  }

  queueEvent(message) {
    this.pendingEvents.push(message);
    if (this.pendingEvents.length > 256) this.pendingEvents.splice(0, this.pendingEvents.length - 256);
    void this.save();
  }

  ackEvents(sequence) {
    if (!Number.isInteger(sequence) || sequence < this.confirmedEventSequence) return;
    this.confirmedEventSequence = sequence;
    this.pendingEvents = this.pendingEvents.filter((message) => message.sequence > sequence);
    void this.save();
  }

  async setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    await this.save();
  }

  async clear() {
    this.endpoint = null;
    this.sessionId = null;
    this.pairingToken = null;
    this.resumeToken = null;
    this.eventSequence = 0;
    this.confirmedEventSequence = 0;
    this.pendingEvents = [];
    this.status = "disconnected";
    this.lastError = null;
    await this.enqueueStorage(() => chrome.storage.session.remove(STORAGE_KEY));
  }

  async save() {
    const snapshot = {
      endpoint: this.endpoint,
      sessionId: this.sessionId,
      resumeToken: this.resumeToken,
      protocolVersion: this.protocolVersion,
      eventSequence: this.eventSequence,
      confirmedEventSequence: this.confirmedEventSequence,
      pendingEvents: [...this.pendingEvents],
      maxMessageBytes: this.maxMessageBytes,
      maxBinaryChunkBytes: this.maxBinaryChunkBytes,
      maxBinaryTransferBytes: this.maxBinaryTransferBytes,
      status: this.status,
      lastError: this.lastError,
    };
    await this.enqueueStorage(() => chrome.storage.session.set({
      [STORAGE_KEY]: {
        ...snapshot,
      },
    }));
  }

  enqueueStorage(operation) {
    this.storageQueue = this.storageQueue.catch(() => {}).then(operation);
    return this.storageQueue;
  }

  publicState() {
    return {
      endpoint: this.endpoint,
      sessionId: this.sessionId,
      status: this.status,
      lastError: this.lastError,
    };
  }
}
