const elements = {
  endpoint: document.querySelector("#endpoint"),
  sessionId: document.querySelector("#sessionId"),
  pairingToken: document.querySelector("#pairingToken"),
  connect: document.querySelector("#connect"),
  disconnect: document.querySelector("#disconnect"),
  refresh: document.querySelector("#refresh"),
  status: document.querySelector("#status"),
  ownerSession: document.querySelector("#ownerSession"),
  tabList: document.querySelector("#tabList"),
  error: document.querySelector("#error"),
};

elements.connect.addEventListener("click", () => void connect());
elements.disconnect.addEventListener("click", () => {
  void request({ type: "disconnect" }).then(refresh).catch(showError);
});
elements.refresh.addEventListener("click", () => void refresh());
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "stateChanged") void refresh();
});
void refresh();

async function connect() {
  clearError();
  try {
    await request({
      type: "pair",
      endpoint: elements.endpoint.value.trim(),
      sessionId: elements.sessionId.value.trim(),
      pairingToken: elements.pairingToken.value.trim(),
    });
    elements.pairingToken.value = "";
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function refresh() {
  clearError();
  try {
    const [{ session, logicalSessions }, tabs] = await Promise.all([request({ type: "getState" }), request({ type: "listTabs" })]);
    elements.status.textContent = session.status;
    elements.disconnect.hidden = !session.endpoint;
    const selectedOwner = elements.ownerSession.value;
    elements.ownerSession.replaceChildren(...logicalSessions.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      return option;
    }));
    if (logicalSessions.some((item) => item.id === selectedOwner)) elements.ownerSession.value = selectedOwner;
    elements.ownerSession.disabled = logicalSessions.length === 0;
    elements.tabList.replaceChildren(...tabs.map((tab) => renderTab(tab, logicalSessions)));
  } catch (error) {
    showError(error);
  }
}

function renderTab(tab, logicalSessions) {
  const row = document.createElement("div");
  row.className = "tab";
  const copy = document.createElement("div");
  copy.className = "tab-copy";
  const title = document.createElement("div");
  title.className = "tab-title";
  title.textContent = tab.title;
  const url = document.createElement("div");
  url.className = "tab-url";
  url.textContent = tab.url;
  copy.append(title, url);
  const button = document.createElement("button");
  button.className = tab.pageToken ? "danger" : "secondary";
  const owner = logicalSessions.find((item) => item.id === tab.ownerSessionId);
  button.textContent = tab.pageToken ? `Detach ${owner?.label || "session"}` : "Authorize";
  button.disabled = !tab.pageToken && !elements.ownerSession.value;
  button.addEventListener("click", () => void request(
    tab.pageToken
      ? { type: "detachPage", pageToken: tab.pageToken, ownerSessionId: tab.ownerSessionId }
      : { type: "authorizeTab", tabId: tab.tabId, ownerSessionId: elements.ownerSession.value },
  ).then(refresh).catch(showError));
  row.append(copy, button);
  return row;
}

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Extension request failed");
  return response.result;
}

function showError(error) {
  elements.error.hidden = false;
  elements.error.textContent = error instanceof Error ? error.message : String(error);
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}
