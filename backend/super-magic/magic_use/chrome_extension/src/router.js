import { RemoteMethod } from "./protocol.js";

export class RequestRouter {
  constructor(controller) {
    this.controller = controller;
    this.handlers = new Map([
      [RemoteMethod.SESSION_REGISTER, (params, _signal, owner) => this.registerSession(params, owner)],
      [RemoteMethod.SESSION_RELEASE, (_params, _signal, owner) => this.releaseSession(owner)],
      [RemoteMethod.SESSION_DESCRIBE, (_params, _signal, owner) => this.describeSession(owner)],
      [RemoteMethod.PAGE_LIST, (_params, _signal, owner) => this.listPages(owner)],
      [RemoteMethod.PAGE_OPEN, (params, signal, owner) => this.openPage(params, signal, owner)],
      [RemoteMethod.PAGE_CLOSE, (params, signal, owner) => this.closePage(params, signal, owner)],
      [RemoteMethod.PAGE_ACTIVATE, (params, signal, owner) => this.activatePage(params, signal, owner)],
      [RemoteMethod.PAGE_NAVIGATE, (params, signal, owner) => this.navigate(params, signal, owner)],
      [RemoteMethod.PAGE_WAIT, (params, signal, owner) => this.wait(params, signal, owner)],
      [RemoteMethod.PAGE_EVALUATE, (params, signal, owner) => this.evaluate(params, signal, owner)],
      [RemoteMethod.PAGE_ADD_INIT_SCRIPT, (params, signal, owner) => this.addInitScript(params, signal, owner)],
      [RemoteMethod.PAGE_SCREENSHOT, (params, signal, owner) => this.screenshot(params, signal, owner)],
      [RemoteMethod.SCRIPT_REGISTER, (params, signal, owner) => this.registerScript(params, signal, owner)],
      [RemoteMethod.OBSERVATION_ACCESSIBILITY, (params, signal, owner) => this.accessibility(params, signal, owner)],
      [RemoteMethod.OBSERVATION_DOM_SNAPSHOT, (params, signal, owner) => this.domSnapshot(params, signal, owner)],
      [RemoteMethod.OBSERVATION_OUTLINE, (params, signal, owner) => this.outline(params, signal, owner)],
      [RemoteMethod.ACTION_DISPATCH, (params, signal, owner) => this.dispatchAction(params, signal, owner)],
      [RemoteMethod.DIAGNOSTICS_CONSOLE, (params, _signal, owner) => this.readConsole(params, owner)],
      [RemoteMethod.DIAGNOSTICS_NETWORK, (params, _signal, owner) => this.readNetwork(params, owner)],
    ]);
  }

  async handle(method, params, signal, logicalSessionId) {
    const handler = this.handlers.get(method);
    if (!handler) throw new ProtocolError("capability_unavailable", `Unsupported browser method: ${method}`);
    const owner = requireLogicalSession(logicalSessionId);
    return handler(params || {}, signal, owner);
  }

  registerSession(params, owner) {
    this.controller.registerSession(owner, typeof params.label === "string" ? params.label : owner);
    return {};
  }

  async releaseSession(owner) {
    await this.controller.releaseSession(owner);
    return {};
  }

  async describeSession(owner) {
    return { pages: await this.controller.listPages(owner) };
  }

  async listPages(owner) {
    return { pages: await this.controller.listPages(owner) };
  }

  async openPage(params, signal, owner) {
    return {
      page: await this.controller.openPage(
        params.url || "about:blank",
        owner,
        Number.isFinite(params.navigation_timeout_ms) ? params.navigation_timeout_ms : 30000,
        Number.isFinite(params.load_timeout_ms) ? params.load_timeout_ms : 3000,
        signal,
      ),
    };
  }

  async closePage(params, signal, owner) {
    await this.controller.closePage(requireString(params, "page_token"), owner, signal);
    return {};
  }

  async activatePage(params, signal, owner) {
    return { page: await this.controller.activate(requireString(params, "page_token"), owner, signal) };
  }

  async navigate(params, signal, owner) {
    return {
      page: await this.controller.navigate(
        requireString(params, "page_token"),
        owner,
        requireString(params, "url"),
        typeof params.wait_until === "string" ? params.wait_until : "domcontentloaded",
        Number.isFinite(params.timeout_ms) ? params.timeout_ms : 30000,
        Number.isFinite(params.load_timeout_ms) ? params.load_timeout_ms : 3000,
        typeof params.referer === "string" ? params.referer : null,
        signal,
      ),
    };
  }

  async wait(params, signal, owner) {
    await this.controller.waitFor(requireString(params, "page_token"), params, owner, signal);
    return {};
  }

  async evaluate(params, signal, owner) {
    return {
      result: await this.controller.evaluate(
        requireString(params, "page_token"),
        owner,
        requireString(params, "expression"),
        params.argument,
        signal,
      ),
    };
  }

  async addInitScript(params, signal, owner) {
    await this.controller.send(
      requireString(params, "page_token"),
      owner,
      "Page.addScriptToEvaluateOnNewDocument",
      { source: requireString(params, "source") },
      signal,
    );
    return {};
  }

  async screenshot(params, signal, owner) {
    return {
      binary_payload_base64: await this.controller.screenshot(
        requireString(params, "page_token"),
        owner,
        Boolean(params.full_page),
        signal,
      ),
      binary_media_type: "image/png",
    };
  }

  async registerScript(params, signal, owner) {
    signal?.throwIfAborted();
    this.controller.requireSession(owner);
    for (const key of ["name", "source", "source_hash", "policy"]) requireString(params, key);
    await this.controller.registerDocumentScript(params, signal);
    return {};
  }

  async accessibility(params, signal, owner) {
    return this.controller.send(requireString(params, "page_token"), owner, "Accessibility.getFullAXTree", {}, signal);
  }

  async domSnapshot(params, signal, owner) {
    return this.controller.send(
      requireString(params, "page_token"),
      owner,
      "DOMSnapshot.captureSnapshot",
      params.params || { computedStyles: [], includePaintOrder: true, includeDOMRects: true },
      signal,
    );
  }

  async outline(params, signal, owner) {
    const pageToken = requireString(params, "page_token");
    const resolved = await this.controller.send(
      pageToken,
      owner,
      "DOM.resolveNode",
      { backendNodeId: Number(params.backend_node_id) },
      signal,
    );
    const objectId = resolved?.object?.objectId;
    if (typeof objectId !== "string" || !objectId) throw new Error("The element ref cannot be resolved");
    const called = await this.controller.send(
      pageToken,
      owner,
      "Runtime.callFunctionOn",
      {
        objectId,
        functionDeclaration: "function(options) { return globalThis.MagicOutline.read(this, options); }",
        arguments: [{ value: params.options || {} }],
        returnByValue: true,
      },
      signal,
    );
    return { result: called?.result?.value };
  }

  async dispatchAction(params, signal, owner) {
    signal?.throwIfAborted();
    const pageToken = requireString(params, "page_token");
    const pageBefore = await this.controller.describe(pageToken, owner);
    const before = new Set((await this.controller.listPages(owner)).map((page) => page.page_token));
    const signalCursor = this.controller.actionSignalCursor();
    const actionResult = await this.controller.dispatchAction(pageToken, params, owner, signal);
    const settleMs = Number.isFinite(params.settle_ms) && params.settle_ms >= 0 ? params.settle_ms : 150;
    await abortableDelay(settleMs, signal);
    let pageAfter = this.controller.hasPage(pageToken)
      ? await this.controller.describe(pageToken, owner)
      : null;
    if (pageAfter && pageAfter.document_generation > pageBefore.document_generation) {
      await this.controller.waitFor(
        pageToken,
        {
          condition: "load_state",
          state: "load",
          timeout_ms: Number.isFinite(params.load_timeout_ms) ? params.load_timeout_ms : 3000,
          soft_timeout: true,
        },
        owner,
        signal,
      );
      pageAfter = await this.controller.describe(pageToken, owner);
    }
    await this.controller.waitForPendingPages(signal);
    signal?.throwIfAborted();
    const after = await this.controller.listPages(owner);
    const signals = this.controller.actionSignalsSince(pageToken, signalCursor);
    return {
      page: pageAfter || actionResult.page || pageBefore,
      state: actionResult.state,
      opened_pages: after.filter((candidate) => !before.has(candidate.page_token)),
      downloads: signals.downloads,
      dialogs: signals.dialogs,
    };
  }

  readConsole(params, owner) {
    return this.controller.readConsole(
      requireString(params, "page_token"),
      owner,
      params.clear !== false,
      diagnosticLimit(params.limit),
    );
  }

  readNetwork(params, owner) {
    return this.controller.readNetwork(
      requireString(params, "page_token"),
      owner,
      params.clear !== false,
      diagnosticLimit(params.limit),
    );
  }
}

export class ProtocolError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function requireString(value, key) {
  const item = value[key];
  if (typeof item !== "string" || !item) throw new ProtocolError("invalid_config", `${key} is required`);
  return item;
}

function requireLogicalSession(value) {
  if (typeof value !== "string" || !value) {
    throw new ProtocolError("invalid_config", "logical_session_id is required");
  }
  return value;
}

function diagnosticLimit(value) {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new ProtocolError("invalid_config", "limit must be an integer from 1 to 500");
  }
  return value;
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
