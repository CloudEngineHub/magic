import { RelayConnection } from "./connection.js";
import { DebuggerController } from "./debugger-controller.js";
import { RequestRouter } from "./router.js";
import { SessionState } from "./session-state.js";

const state = new SessionState();
let connection;
const controller = new DebuggerController((method, params) => {
  const ownerSessionId = params?.logical_session_id || controller.ownerForPageToken(params?.page_token);
  connection?.sendEvent(method, ownerSessionId ? { ...params, logical_session_id: ownerSessionId } : params);
});
const router = new RequestRouter(controller);
connection = new RelayConnection({ state, router, controller, notifyState });

controller.start();
void connection.restore().then(notifyState, async (error) => {
  try {
    await state.setStatus("error", error instanceof Error ? error.message : String(error));
  } catch {
    // Keep the in-memory error visible when extension storage is unavailable.
  } finally {
    notifyState();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

async function handleMessage(message) {
  if (message.type === "getState") {
    return { session: state.publicState(), logicalSessions: controller.listSessions() };
  }
  if (message.type === "pair") {
    await connection.pair({
      endpoint: requireString(message, "endpoint"),
      sessionId: requireString(message, "sessionId"),
      pairingToken: requireString(message, "pairingToken"),
    });
    return state.publicState();
  }
  if (message.type === "disconnect") {
    await connection.disconnect();
    return state.publicState();
  }
  if (message.type === "listTabs") {
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter((tab) => tab.id && (isInspectableUrl(tab.url || tab.pendingUrl || "")))
      .map((tab) => ({
        tabId: tab.id,
        title: tab.title || "Untitled",
        url: tab.url || "",
        pageToken: controller.pageTokenForTab(tab.id),
        ownerSessionId: controller.ownerForPageToken(controller.pageTokenForTab(tab.id)),
      }));
  }
  if (message.type === "authorizeTab") {
    if (state.status !== "connected") throw new Error("Connect the Browser session before authorizing a tab");
    const page = await controller.authorizeTab(
      Number(message.tabId),
      requireString(message, "ownerSessionId"),
    );
    return page;
  }
  if (message.type === "detachPage") {
    await controller.detach(
      requireString(message, "pageToken"),
      requireString(message, "ownerSessionId"),
    );
    return {};
  }
  throw new Error("Unknown extension message");
}

function notifyState() {
  void chrome.runtime.sendMessage({ type: "stateChanged", state: state.publicState() }).catch(() => {});
}

function requireString(value, key) {
  const item = value[key];
  if (typeof item !== "string" || !item) throw new Error(`${key} is required`);
  return item;
}

function isInspectableUrl(url) {
  return /^(https?|file):/i.test(url) || url === "about:blank";
}
