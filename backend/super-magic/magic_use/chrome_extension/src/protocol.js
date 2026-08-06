export const PROTOCOL_VERSION = "1.0";
export const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION];

export const MessageType = Object.freeze({
  HELLO: "hello",
  HELLO_ACK: "hello_ack",
  REQUEST: "request",
  RESPONSE: "response",
  ERROR: "error",
  EVENT: "event",
  EVENT_ACK: "event_ack",
  CANCEL: "cancel",
  PING: "ping",
  PONG: "pong",
  CLOSE: "close",
});

export const RemoteMethod = Object.freeze({
  SESSION_REGISTER: "session.register",
  SESSION_RELEASE: "session.release",
  SESSION_DESCRIBE: "session.describe",
  PAGE_LIST: "page.list",
  PAGE_OPEN: "page.open",
  PAGE_CLOSE: "page.close",
  PAGE_ACTIVATE: "page.activate",
  PAGE_NAVIGATE: "page.navigate",
  PAGE_WAIT: "page.wait",
  PAGE_EVALUATE: "page.evaluate",
  PAGE_SCREENSHOT: "page.screenshot",
  SCRIPT_REGISTER: "script.register",
  OBSERVATION_ACCESSIBILITY: "observation.accessibility",
  OBSERVATION_DOM_SNAPSHOT: "observation.dom_snapshot",
  ACTION_DISPATCH: "action.dispatch",
  DIAGNOSTICS_CONSOLE: "diagnostics.console",
  DIAGNOSTICS_NETWORK: "diagnostics.network",
});

export function createMessage({
  protocolVersion = PROTOCOL_VERSION,
  sessionId,
  type,
  payload = {},
  requestId,
  sequence,
}) {
  const message = {
    protocol_version: protocolVersion,
    session_id: sessionId,
    message_id: crypto.randomUUID(),
    type,
    payload,
  };
  if (requestId) message.request_id = requestId;
  if (Number.isInteger(sequence)) message.sequence = sequence;
  return message;
}

export function assertEnvelope(message) {
  if (!message || typeof message !== "object") throw new Error("Message must be an object");
  for (const key of ["protocol_version", "session_id", "message_id", "type", "payload"]) {
    if (!(key in message)) throw new Error(`Message is missing ${key}`);
  }
  for (const key of ["protocol_version", "session_id", "message_id", "type"]) {
    if (typeof message[key] !== "string" || !message[key]) throw new Error(`Message contains invalid ${key}`);
  }
  if (!message.payload || typeof message.payload !== "object" || Array.isArray(message.payload)) {
    throw new Error("Message payload must be an object");
  }
  if (!Object.values(MessageType).includes(message.type)) throw new Error("Unknown message type");
  if ([MessageType.RESPONSE, MessageType.ERROR, MessageType.CANCEL].includes(message.type)) {
    if (typeof message.request_id !== "string" || !message.request_id) {
      throw new Error(`${message.type} requires request_id`);
    }
  }
  if (message.type === MessageType.EVENT && (!Number.isInteger(message.sequence) || message.sequence < 0)) {
    throw new Error("event requires a non-negative sequence");
  }
  return message;
}

export function utf8Size(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function encodeBinaryChunk(header, data) {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(4 + headerBytes.byteLength + data.byteLength);
  new DataView(frame.buffer).setUint32(0, headerBytes.byteLength, false);
  frame.set(headerBytes, 4);
  frame.set(data, 4 + headerBytes.byteLength);
  return frame.buffer;
}
