import { ActionDispatcher } from "./action-dispatcher.js";

const CDP_VERSION = "1.3";
const MAX_ACTION_SIGNAL_ENTRIES = 256;
const MAX_DIAGNOSTIC_ENTRIES = 1000;

export class DebuggerController {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.pages = new Map();
    this.logicalSessions = new Map();
    this.pageTokenByTabId = new Map();
    this.authorizationByTabId = new Map();
    this.documentScripts = new Map();
    this.documentStartScriptIds = new Map();
    this.consoleEntries = new Map();
    this.networkEntries = new Map();
    this.dialogEntries = new Map();
    this.downloadEntries = new Map();
    this.downloadPageByGuid = new Map();
    this.actionSignalSequence = 0;
    this.activeNetworkRequests = new Map();
    this.actionDispatcher = new ActionDispatcher(this);
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    chrome.debugger.onEvent.addListener((source, method, params) => {
      void this.handleDebuggerEvent(source, method, params).catch(reportControllerError);
    });
    chrome.debugger.onDetach.addListener((source, reason) => {
      void this.handleDetach(source, reason).catch(reportControllerError);
    });
    chrome.tabs.onRemoved.addListener((tabId) => this.removeTab(tabId));
    chrome.tabs.onCreated.addListener((tab) => {
      const openerPageToken = tab.openerTabId ? this.pageTokenByTabId.get(tab.openerTabId) : null;
      const opener = openerPageToken ? this.pages.get(openerPageToken) : null;
      if (tab.id && openerPageToken && opener) {
        void this.authorizeTab(tab.id, opener.ownerSessionId, openerPageToken).catch(() => {});
      }
    });
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      const pageToken = this.pageTokenByTabId.get(tabId);
      if (pageToken) this.onEvent("page.activated", { page_token: pageToken });
    });
  }

  registerSession(ownerSessionId, label) {
    this.logicalSessions.set(ownerSessionId, label || ownerSessionId);
  }

  requireSession(ownerSessionId) {
    if (!this.logicalSessions.has(ownerSessionId)) throw new Error("Browser logical session is not registered");
  }

  listSessions() {
    return [...this.logicalSessions].map(([id, label]) => ({ id, label }));
  }

  clearSessions() {
    this.logicalSessions.clear();
  }

  async releaseSession(ownerSessionId) {
    if (!this.logicalSessions.has(ownerSessionId)) return;
    for (const [pageToken, page] of [...this.pages]) {
      if (page.ownerSessionId !== ownerSessionId) continue;
      try {
        await this.detach(pageToken, ownerSessionId, "owner lease released");
      } catch {
        this.removePage(pageToken);
      }
    }
    this.logicalSessions.delete(ownerSessionId);
  }

  async authorizeTab(tabId, ownerSessionId, openerPageToken = null) {
    this.requireSession(ownerSessionId);
    const existingToken = this.pageTokenByTabId.get(tabId);
    if (existingToken) return this.describe(existingToken, ownerSessionId);
    const pending = this.authorizationByTabId.get(tabId);
    if (pending) {
      await pending;
      const pageToken = this.pageTokenByTabId.get(tabId);
      if (!pageToken) throw new Error("The tab authorization did not complete");
      return this.describe(pageToken, ownerSessionId);
    }
    const authorization = this.authorizeNewTab(tabId, ownerSessionId, openerPageToken);
    this.authorizationByTabId.set(tabId, authorization);
    try {
      return await authorization;
    } finally {
      this.authorizationByTabId.delete(tabId);
    }
  }

  async authorizeNewTab(tabId, ownerSessionId, openerPageToken) {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || tab.pendingUrl || "";
    if (!tab.id || !isInspectableUrl(url)) throw new Error("This tab cannot be controlled");
    await chrome.debugger.attach({ tabId }, CDP_VERSION);
    const pageToken = crypto.randomUUID();
    const page = { pageToken, tabId, ownerSessionId, documentGeneration: 0, openerPageToken, mainFrameId: null };
    this.pages.set(pageToken, page);
    this.pageTokenByTabId.set(tabId, pageToken);
    this.consoleEntries.set(pageToken, []);
    this.networkEntries.set(pageToken, []);
    this.dialogEntries.set(pageToken, []);
    this.downloadEntries.set(pageToken, []);
    this.activeNetworkRequests.set(pageToken, new Set());
    try {
      await Promise.all([
        this.send(pageToken, ownerSessionId, "Page.enable"),
        this.send(pageToken, ownerSessionId, "Runtime.enable"),
        this.send(pageToken, ownerSessionId, "Network.enable"),
        this.send(pageToken, ownerSessionId, "Accessibility.enable"),
      ]);
      for (const script of this.documentScripts.values()) {
        if (script.policy === "document_start") await this.registerStartScript(pageToken, script);
      }
      await this.injectDocumentScripts(pageToken);
      const descriptor = await this.describe(pageToken, ownerSessionId);
      this.onEvent("page.opened", { page_token: pageToken, page: descriptor });
      return descriptor;
    } catch (error) {
      this.removePage(pageToken);
      await chrome.debugger.detach({ tabId }).catch(() => {});
      throw error;
    }
  }

  async detach(pageToken, ownerSessionId = null, reason = "user disconnected") {
    const page = this.requirePage(pageToken, ownerSessionId);
    try {
      await chrome.debugger.detach({ tabId: page.tabId });
    } finally {
      if (this.pages.has(pageToken)) {
        this.removePage(pageToken);
        this.onEvent("page.closed", { page_token: pageToken, logical_session_id: page.ownerSessionId, reason });
      }
    }
  }

  async detachAll(reason = "session closed") {
    for (const pageToken of [...this.pages.keys()]) {
      try {
        await this.detach(pageToken, null, reason);
      } catch {
        this.removePage(pageToken);
      }
    }
  }

  async closePage(pageToken, ownerSessionId, signal) {
    signal?.throwIfAborted();
    const page = this.requirePage(pageToken, ownerSessionId);
    await chrome.tabs.remove(page.tabId);
    signal?.throwIfAborted();
  }

  async listPages(ownerSessionId) {
    this.requireSession(ownerSessionId);
    const result = [];
    for (const [pageToken, page] of [...this.pages]) {
      if (page.ownerSessionId !== ownerSessionId) continue;
      try {
        result.push(await this.describe(pageToken, ownerSessionId));
      } catch {
        this.removePage(pageToken);
      }
    }
    return result;
  }

  async waitForPendingPages(signal) {
    const pending = [...this.authorizationByTabId.values()];
    if (pending.length) await Promise.allSettled(pending);
    signal?.throwIfAborted();
  }

  async describe(pageToken, ownerSessionId) {
    const page = this.requirePage(pageToken, ownerSessionId);
    const tab = await chrome.tabs.get(page.tabId);
    return {
      page_token: pageToken,
      url: tab.url || "",
      title: tab.title || "",
      active: Boolean(tab.active),
      document_generation: page.documentGeneration,
      opener_page_token: page.openerPageToken,
    };
  }

  async openPage(url, ownerSessionId, navigationTimeoutMs, loadTimeoutMs, signal) {
    this.requireSession(ownerSessionId);
    signal?.throwIfAborted();
    if (!isInspectableUrl(url)) throw new Error("This URL cannot be controlled");
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab.id) throw new Error("Chrome did not create a tab");
    try {
      signal?.throwIfAborted();
      const page = await this.authorizeTab(tab.id, ownerSessionId);
      if (url !== "about:blank") {
        await this.waitFor(
          page.page_token,
          {
            condition: "load_state",
            state: "domcontentloaded",
            timeout_ms: navigationTimeoutMs,
            soft_timeout: true,
          },
          ownerSessionId,
          signal,
        );
        await this.waitFor(
          page.page_token,
          { condition: "load_state", state: "load", timeout_ms: loadTimeoutMs, soft_timeout: true },
          ownerSessionId,
          signal,
        );
      }
      return this.describe(page.page_token, ownerSessionId);
    } catch (error) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      throw error;
    }
  }

  async activate(pageToken, ownerSessionId, signal) {
    signal?.throwIfAborted();
    const page = this.requirePage(pageToken, ownerSessionId);
    await chrome.tabs.update(page.tabId, { active: true });
    signal?.throwIfAborted();
    return this.describe(pageToken, ownerSessionId);
  }

  async navigate(pageToken, ownerSessionId, url, waitUntil, timeoutMs, loadTimeoutMs, referer, signal) {
    const navigationParams = { url };
    if (referer) navigationParams.referrer = referer;
    const navigation = await this.send(pageToken, ownerSessionId, "Page.navigate", navigationParams, signal);
    if (navigation.errorText) throw new Error(navigation.errorText);
    if (waitUntil === "commit") return this.describe(pageToken, ownerSessionId);
    await this.waitFor(
      pageToken,
      { condition: "load_state", state: waitUntil, timeout_ms: timeoutMs, soft_timeout: true },
      ownerSessionId,
      signal,
    );
    if (waitUntil === "domcontentloaded") {
      await this.waitFor(
        pageToken,
        { condition: "load_state", state: "load", timeout_ms: loadTimeoutMs, soft_timeout: true },
        ownerSessionId,
        signal,
      );
    }
    return this.describe(pageToken, ownerSessionId);
  }

  async evaluate(pageToken, ownerSessionId, expression, argument, signal) {
    const serializedArgument = JSON.stringify(argument === undefined ? null : argument);
    const invocation = `(() => { const candidate = (${expression}); return typeof candidate === 'function' ? candidate(${serializedArgument}) : candidate; })()`;
    const response = await this.send(pageToken, ownerSessionId, "Runtime.evaluate", {
      expression: invocation,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, signal);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Page evaluation failed");
    }
    return response.result?.value ?? null;
  }

  async screenshot(pageToken, ownerSessionId, fullPage, signal) {
    const params = { format: "png", fromSurface: true, captureBeyondViewport: Boolean(fullPage) };
    if (fullPage) {
      const metrics = await this.send(pageToken, ownerSessionId, "Page.getLayoutMetrics", {}, signal);
      const size = metrics.cssContentSize || metrics.contentSize;
      if (size) {
        params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
      }
    }
    const result = await this.send(pageToken, ownerSessionId, "Page.captureScreenshot", params, signal);
    return result.data;
  }

  async waitFor(pageToken, { condition, value, state, timeout_ms: timeoutMs, soft_timeout: softTimeout = false }, ownerSessionId, signal) {
    const deadline = Date.now() + timeoutMs;
    let networkIdleSince = null;
    const downloadCursor = condition === "download" ? this.actionSignalSequence : null;
    while (true) {
      if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (condition === "url") {
        const page = await this.describe(pageToken, ownerSessionId);
        if (matchesUrl(page.url, value || "")) return true;
      } else if (condition === "load_state") {
        if (state === "networkidle") {
          const activeRequests = this.activeNetworkRequests.get(pageToken)?.size || 0;
          if (activeRequests === 0) {
            networkIdleSince ??= Date.now();
            if (Date.now() - networkIdleSince >= 500) return true;
          } else {
            networkIdleSince = null;
          }
        } else {
          let readyState = null;
          try {
            readyState = await this.evaluate(pageToken, ownerSessionId, "() => document.readyState", null);
          } catch (error) {
            if (!isTransientNavigationError(error)) throw error;
          }
          if (state === "commit") return true;
          if (state === "load" && readyState === "complete") return true;
          if (state === "domcontentloaded" && ["interactive", "complete"].includes(readyState)) return true;
          if (!["commit", "domcontentloaded", "load"].includes(state)) {
            throw new Error(`Unsupported load state: ${state}`);
          }
        }
      } else if (condition === "text") {
        const found = await this.evaluate(
          pageToken,
          ownerSessionId,
          "text => document.body?.innerText?.includes(text) === true",
          value || "",
        );
        if (found) return true;
      } else if (condition === "download") {
        if (
          this.downloadEntries.get(pageToken)?.some((entry) => entry.sequence > downloadCursor)
        ) return true;
      } else {
        throw new Error(`Unsupported wait condition: ${condition}`);
      }
      if (Date.now() >= deadline) {
        if (softTimeout) return false;
        throw new Error(`Timed out waiting for ${condition}`);
      }
      await abortableDelay(100, signal);
    }
  }

  async dispatchAction(pageToken, params, ownerSessionId, signal) {
    return this.actionDispatcher.dispatch(pageToken, params, ownerSessionId, signal);
  }

  async registerDocumentScript(config, signal) {
    signal?.throwIfAborted();
    const previous = this.documentScripts.get(config.name);
    if (
      previous
      && previous.source_hash === config.source_hash
      && previous.policy === config.policy
    ) return;
    this.documentScripts.set(config.name, config);
    if (config.policy === "document_start") {
      await Promise.all([...this.pages.keys()].map((pageToken) => this.registerStartScript(pageToken, config)));
    }
    await Promise.all([...this.pages.keys()].map((pageToken) => this.injectDocumentScripts(pageToken)));
    signal?.throwIfAborted();
  }

  readConsole(pageToken, ownerSessionId, clear, limit) {
    this.requirePage(pageToken, ownerSessionId);
    const buffered = this.consoleEntries.get(pageToken) || [];
    const entries = buffered.slice(-limit);
    if (clear) this.consoleEntries.set(pageToken, []);
    return { entries, total_count: buffered.length, pending_count: 0 };
  }

  readNetwork(pageToken, ownerSessionId, clear, limit) {
    this.requirePage(pageToken, ownerSessionId);
    const buffered = this.networkEntries.get(pageToken) || [];
    const entries = buffered.slice(-limit);
    if (clear) this.networkEntries.set(pageToken, []);
    return {
      entries,
      total_count: buffered.length,
      pending_count: this.activeNetworkRequests.get(pageToken)?.size || 0,
    };
  }

  actionSignalCursor() {
    return this.actionSignalSequence;
  }

  actionSignalsSince(pageToken, cursor) {
    return {
      dialogs: (this.dialogEntries.get(pageToken) || [])
        .filter((entry) => entry.sequence > cursor)
        .map((entry) => entry.value),
      downloads: (this.downloadEntries.get(pageToken) || [])
        .filter((entry) => entry.sequence > cursor)
        .map((entry) => entry.value),
    };
  }

  hasPage(pageToken) {
    return this.pages.has(pageToken);
  }

  async send(pageToken, ownerSessionId, method, params = {}, signal) {
    signal?.throwIfAborted();
    const page = this.requirePage(pageToken, ownerSessionId);
    const result = await chrome.debugger.sendCommand({ tabId: page.tabId }, method, params);
    signal?.throwIfAborted();
    return result;
  }

  async injectDocumentScripts(pageToken) {
    const page = this.requirePage(pageToken);
    const tab = await chrome.tabs.get(page.tabId);
    const hostname = safeHostname(tab.url || "");
    for (const script of this.documentScripts.values()) {
      if (!["document_end", "document_idle"].includes(script.policy) || !isScriptEnabled(script, hostname, tab.url || "")) continue;
      try {
        await this.evaluate(
          pageToken,
          page.ownerSessionId,
          "payload => { const loaded = globalThis.__magicUseScripts || {}; if (loaded[payload.name] === payload.hash) return true; (0, eval)(payload.source); globalThis.__magicUseScripts = globalThis.__magicUseScripts || {}; globalThis.__magicUseScripts[payload.name] = payload.hash; return true; }",
          { name: script.name, hash: script.source_hash, source: script.source },
        );
      } catch (error) {
        console.warn(`[magic_use] Document script '${script.name}' failed`, error);
      }
    }
  }

  async registerStartScript(pageToken, script) {
    const page = this.requirePage(pageToken);
    const pageScripts = this.documentStartScriptIds.get(pageToken) || new Map();
    const previousIdentifier = pageScripts.get(script.name);
    if (previousIdentifier) {
      await this.send(pageToken, page.ownerSessionId, "Page.removeScriptToEvaluateOnNewDocument", {
        identifier: previousIdentifier,
      }).catch(() => {});
    }
    const source = buildDocumentStartSource(script);
    const result = await this.send(pageToken, page.ownerSessionId, "Page.addScriptToEvaluateOnNewDocument", { source });
    if (typeof result.identifier === "string" && result.identifier) {
      pageScripts.set(script.name, result.identifier);
      this.documentStartScriptIds.set(pageToken, pageScripts);
    }
  }

  async handleDebuggerEvent(source, method, params) {
    const pageToken = source.tabId ? this.pageTokenByTabId.get(source.tabId) : null;
    if (!pageToken) return;
    const now = new Date().toISOString();
    if (method === "Runtime.consoleAPICalled") {
      const text = (params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
      const entry = { level: params.type || "log", text, occurred_at: now };
      this.consoleEntries.get(pageToken)?.push(entry);
      trimEntries(this.consoleEntries.get(pageToken), MAX_DIAGNOSTIC_ENTRIES);
      this.onEvent("console", { page_token: pageToken, ...entry });
    } else if (method === "Network.requestWillBeSent") {
      if (params.requestId) this.activeNetworkRequests.get(pageToken)?.add(params.requestId);
      const entry = { phase: "request", method: params.request?.method || "", url: params.request?.url || "", status: null, error: null, occurred_at: now };
      this.networkEntries.get(pageToken)?.push(entry);
      trimEntries(this.networkEntries.get(pageToken), MAX_DIAGNOSTIC_ENTRIES);
      this.onEvent("network.request", { page_token: pageToken, ...entry });
    } else if (method === "Network.responseReceived") {
      const entry = { phase: "response", method: "", url: params.response?.url || "", status: params.response?.status || null, error: null, occurred_at: now };
      this.networkEntries.get(pageToken)?.push(entry);
      trimEntries(this.networkEntries.get(pageToken), MAX_DIAGNOSTIC_ENTRIES);
      this.onEvent("network.response", { page_token: pageToken, ...entry });
    } else if (method === "Network.loadingFailed") {
      if (params.requestId) this.activeNetworkRequests.get(pageToken)?.delete(params.requestId);
      const entry = { phase: "failed", method: "", url: "", status: null, error: params.errorText || "Network request failed", occurred_at: now };
      this.networkEntries.get(pageToken)?.push(entry);
      trimEntries(this.networkEntries.get(pageToken), MAX_DIAGNOSTIC_ENTRIES);
      this.onEvent("network.failed", { page_token: pageToken, ...entry });
    } else if (method === "Network.loadingFinished") {
      if (params.requestId) this.activeNetworkRequests.get(pageToken)?.delete(params.requestId);
    } else if (method === "Page.frameAttached") {
      this.onEvent("frame.attached", { page_token: pageToken });
    } else if (method === "Page.frameDetached") {
      this.onEvent("frame.detached", { page_token: pageToken });
    } else if (method === "Page.frameStartedLoading") {
      const page = this.requirePage(pageToken);
      if (page.mainFrameId && params.frameId === page.mainFrameId) {
        this.onEvent("navigation.started", { page_token: pageToken });
      }
    } else if (method === "Page.frameNavigated") {
      const mainFrame = !params.frame?.parentId;
      this.onEvent("frame.navigated", {
        page_token: pageToken,
        url: params.frame?.url || "",
        main_frame: mainFrame,
      });
      if (mainFrame) {
        const page = this.requirePage(pageToken);
        page.mainFrameId = params.frame?.id || null;
        page.documentGeneration += 1;
        this.onEvent("navigation.committed", {
          page_token: pageToken,
          url: params.frame?.url || "",
        });
      }
    } else if (method === "Page.loadEventFired") {
      await this.injectDocumentScripts(pageToken);
      const page = await this.describe(pageToken, this.ownerForPageToken(pageToken));
      this.onEvent("navigation.completed", { page_token: pageToken, url: page.url });
    } else if (method === "Page.javascriptDialogOpening") {
      this.appendActionSignal(this.dialogEntries, pageToken, params.message || "");
      this.onEvent("dialog.opened", { page_token: pageToken, type: params.type || "alert", message: params.message || "" });
    } else if (method === "Page.downloadWillBegin") {
      if (params.guid) this.downloadPageByGuid.set(params.guid, pageToken);
      this.appendActionSignal(this.downloadEntries, pageToken, params.suggestedFilename || params.url || "");
      const entry = { phase: "download", method: "GET", url: params.url || "", status: null, error: null, occurred_at: now };
      this.networkEntries.get(pageToken)?.push(entry);
      trimEntries(this.networkEntries.get(pageToken), MAX_DIAGNOSTIC_ENTRIES);
      this.onEvent("download.started", { page_token: pageToken, url: params.url || "", filename: params.suggestedFilename || "" });
    } else if (method === "Page.downloadProgress") {
      const downloadPageToken = params.guid ? this.downloadPageByGuid.get(params.guid) : null;
      if (!downloadPageToken) return;
      if (params.state === "completed") {
        this.downloadPageByGuid.delete(params.guid);
        this.onEvent("download.completed", { page_token: downloadPageToken });
      } else if (params.state === "canceled") {
        this.downloadPageByGuid.delete(params.guid);
        this.onEvent("download.failed", { page_token: downloadPageToken, error: "Download was canceled" });
      }
    }
  }

  appendActionSignal(store, pageToken, value) {
    const entries = store.get(pageToken);
    if (!entries) return;
    this.actionSignalSequence += 1;
    entries.push({ sequence: this.actionSignalSequence, value });
    if (entries.length > MAX_ACTION_SIGNAL_ENTRIES) {
      entries.splice(0, entries.length - MAX_ACTION_SIGNAL_ENTRIES);
    }
  }

  async handleDetach(source, reason) {
    if (!source.tabId) return;
    const pageToken = this.pageTokenByTabId.get(source.tabId);
    if (!pageToken) return;
    const ownerSessionId = this.ownerForPageToken(pageToken);
    this.removePage(pageToken);
    this.onEvent("page.closed", { page_token: pageToken, logical_session_id: ownerSessionId, reason });
  }

  removeTab(tabId) {
    const pageToken = this.pageTokenByTabId.get(tabId);
    if (pageToken) {
      const ownerSessionId = this.ownerForPageToken(pageToken);
      this.removePage(pageToken);
      this.onEvent("page.closed", { page_token: pageToken, logical_session_id: ownerSessionId, reason: "tab closed" });
    }
  }

  removePage(pageToken) {
    const page = this.pages.get(pageToken);
    if (!page) return;
    this.pages.delete(pageToken);
    this.pageTokenByTabId.delete(page.tabId);
    this.consoleEntries.delete(pageToken);
    this.networkEntries.delete(pageToken);
    this.dialogEntries.delete(pageToken);
    this.downloadEntries.delete(pageToken);
    for (const [guid, downloadPageToken] of this.downloadPageByGuid) {
      if (downloadPageToken === pageToken) this.downloadPageByGuid.delete(guid);
    }
    this.activeNetworkRequests.delete(pageToken);
    this.documentStartScriptIds.delete(pageToken);
  }

  pageTokenForTab(tabId) {
    return this.pageTokenByTabId.get(tabId) || null;
  }

  ownerForPageToken(pageToken) {
    return this.pages.get(pageToken)?.ownerSessionId || null;
  }

  requirePage(pageToken, ownerSessionId = null) {
    const page = this.pages.get(pageToken);
    if (!page) throw new Error("The authorized page no longer exists");
    if (ownerSessionId !== null && page.ownerSessionId !== ownerSessionId) {
      throw new Error("The authorized page belongs to another Browser session");
    }
    return page;
  }
}

function isInspectableUrl(url) {
  return /^(https?|file):/i.test(url) || url === "about:blank";
}

function matchesUrl(url, pattern) {
  if (!pattern) return false;
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(url);
  }
  return url === pattern || url.includes(pattern);
}

function safeHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function isTransientNavigationError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("context") && (
    message.includes("destroyed")
    || message.includes("not found")
    || message.includes("navigat")
  );
}

function isScriptEnabled(script, hostname, url = "") {
  if (typeof script.session_override === "boolean") return script.session_override;
  if (!script.enabled) return false;
  if ((script.disabled_domains || []).some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return false;
  }
  if (Array.isArray(script.match_patterns) && !script.match_patterns.some((pattern) => matchesUserscriptUrl(url, pattern))) {
    return false;
  }
  return !(script.exclude_patterns || []).some((pattern) => matchesUserscriptUrl(url, pattern));
}

function buildDocumentStartSource(script) {
  const payload = JSON.stringify({
    name: script.name,
    source: script.source,
    hash: script.source_hash,
    enabled: script.enabled,
    match_patterns: script.match_patterns || [],
    exclude_patterns: script.exclude_patterns || [],
  });
  return `(() => {
    const script = ${payload};
    const wildcard = value => value.replace(/[.+?^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*");
    const matches = pattern => {
      if (pattern === "<all_urls>") return /^(?:https?|file|ftp):/.test(location.href);
      const parsed = /^(\\*|http|https|file|ftp):\\/\\/([^/]*)(\\/.*)$/.exec(pattern);
      if (!parsed) return false;
      const scheme = parsed[1] === "*" ? "https?" : wildcard(parsed[1]);
      const host = parsed[2] === "*" ? "[^/]+" : parsed[2].startsWith("*.")
        ? "(?:[^/]+\\\\.)?" + wildcard(parsed[2].slice(2))
        : wildcard(parsed[2]);
      return new RegExp("^" + scheme + "://" + host + wildcard(parsed[3]) + "$").test(location.href);
    };
    if (!script.enabled || !script.match_patterns.some(matches) || script.exclude_patterns.some(matches)) return;
    const loaded = globalThis.__magicUseUserscripts || {};
    if (loaded[script.name] === script.hash) return;
    try {
      (0, eval)(script.source);
      globalThis.__magicUseUserscripts = globalThis.__magicUseUserscripts || {};
      globalThis.__magicUseUserscripts[script.name] = script.hash;
    } catch (error) {
      console.warn("[magic_use] Userscript failed", script.name, error);
    }
  })();`;
}

function matchesUserscriptUrl(url, pattern) {
  if (pattern === "<all_urls>") return /^(?:https?|file|ftp):/i.test(url);
  const parsed = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parsed) return false;
  const wildcard = value => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  const scheme = parsed[1] === "*" ? "https?" : wildcard(parsed[1]);
  let host = parsed[2] === "*" ? "[^/:]+" : parsed[2].startsWith("*.")
    ? `(?:[^/:]+\\.)?${wildcard(parsed[2].slice(2))}`
    : wildcard(parsed[2]);
  if (parsed[1] !== "file") host += "(?::\\d+)?";
  return new RegExp(`^${scheme}://${host}${wildcard(parsed[3])}$`).test(url);
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Request cancelled", "AbortError"));
    }, { once: true });
  });
}

function trimEntries(entries, limit) {
  if (!entries || entries.length <= limit) return;
  entries.splice(0, entries.length - limit);
}

function reportControllerError(error) {
  console.error("Browser debugger controller failed", error);
}
