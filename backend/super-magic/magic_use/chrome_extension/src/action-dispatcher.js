export class ActionDispatcher {
  constructor(controller) {
    this.controller = controller;
  }

  async dispatch(pageToken, params, ownerSessionId, signal) {
    signal?.throwIfAborted();
    const { action, backend_node_id: backendNodeId } = params;
    if (action === "click" || action === "hover") {
      await this.scrollNodeIntoView(pageToken, backendNodeId, ownerSessionId, signal);
      const { x, y } = await this.boxCenter(pageToken, backendNodeId, ownerSessionId, signal);
      await this.controller.send(pageToken, ownerSessionId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, signal);
      if (action === "click") {
        await this.controller.send(
          pageToken,
          ownerSessionId,
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x, y, button: "left", clickCount: 1 },
          signal,
        );
        await this.controller.send(
          pageToken,
          ownerSessionId,
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x, y, button: "left", clickCount: 1 },
          signal,
        );
      }
    } else if (action === "scroll") {
      await this.scroll(pageToken, backendNodeId, params, ownerSessionId, signal);
    } else if (action === "fill") {
      await this.callOnNode(pageToken, backendNodeId, function (value) {
        this.focus();
        if (this.isContentEditable) this.textContent = value;
        else {
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), "value");
          if (descriptor?.set) descriptor.set.call(this, value);
          else this.value = value;
        }
        this.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
      }, [params.text || ""], ownerSessionId, signal);
    } else if (action === "press") {
      if (Number.isInteger(backendNodeId)) {
        await this.callOnNode(pageToken, backendNodeId, function () { this.focus(); }, [], ownerSessionId, signal);
      }
      await this.pressKey(pageToken, params.key || "", ownerSessionId, signal);
    } else if (action === "select") {
      await this.callOnNode(pageToken, backendNodeId, function (value) {
        this.value = value;
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
      }, [params.value], ownerSessionId, signal);
    } else if (action === "check") {
      await this.callOnNode(pageToken, backendNodeId, function (checked) {
        this.checked = checked;
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
      }, [Boolean(params.checked)], ownerSessionId, signal);
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }
    signal?.throwIfAborted();
    return this.controller.hasPage(pageToken) ? this.controller.describe(pageToken, ownerSessionId) : null;
  }

  async scroll(pageToken, backendNodeId, params, ownerSessionId, signal) {
    if (params.delta_x || params.delta_y) {
      let point = { x: 0, y: 0 };
      if (Number.isInteger(backendNodeId)) {
        await this.scrollNodeIntoView(pageToken, backendNodeId, ownerSessionId, signal);
        point = await this.boxCenter(pageToken, backendNodeId, ownerSessionId, signal);
      }
      await this.controller.send(pageToken, ownerSessionId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: point.x,
        y: point.y,
        deltaX: params.delta_x || 0,
        deltaY: params.delta_y || 0,
      }, signal);
      return;
    }
    if (!Number.isInteger(backendNodeId)) {
      throw new Error("Page scrolling requires a non-zero delta when no element ref is provided");
    }
    await this.scrollNodeIntoView(pageToken, backendNodeId, ownerSessionId, signal);
  }

  async callOnNode(pageToken, backendNodeId, fn, args = [], ownerSessionId, signal) {
    if (!Number.isInteger(backendNodeId)) throw new Error("The target node no longer exists");
    const resolved = await this.controller.send(pageToken, ownerSessionId, "DOM.resolveNode", { backendNodeId }, signal);
    const objectId = resolved.object?.objectId;
    if (!objectId) throw new Error("The target node no longer exists");
    try {
      const result = await this.controller.send(pageToken, ownerSessionId, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: fn.toString(),
        arguments: args.map((value) => ({ value })),
        awaitPromise: true,
        userGesture: true,
      }, signal);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Page action failed");
    } finally {
      await this.controller.send(pageToken, ownerSessionId, "Runtime.releaseObject", { objectId }).catch(() => {});
    }
  }

  async scrollNodeIntoView(pageToken, backendNodeId, ownerSessionId, signal) {
    await this.callOnNode(pageToken, backendNodeId, function () {
      this.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    }, [], ownerSessionId, signal);
  }

  async boxCenter(pageToken, backendNodeId, ownerSessionId, signal) {
    if (!Number.isInteger(backendNodeId)) throw new Error("The target node no longer exists");
    const result = await this.controller.send(pageToken, ownerSessionId, "DOM.getBoxModel", { backendNodeId }, signal);
    const quad = result.model?.content;
    if (!Array.isArray(quad) || quad.length < 8) throw new Error("The target has no actionable box");
    const xValues = [quad[0], quad[2], quad[4], quad[6]];
    const yValues = [quad[1], quad[3], quad[5], quad[7]];
    if (![...xValues, ...yValues].every(Number.isFinite)) throw new Error("The target box is invalid");
    return {
      x: xValues.reduce((sum, value) => sum + value, 0) / xValues.length,
      y: yValues.reduce((sum, value) => sum + value, 0) / yValues.length,
    };
  }

  async pressKey(pageToken, shortcut, ownerSessionId, signal) {
    const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) throw new Error("Press requires a key");
    const key = parts.pop();
    const modifiers = parts.map(normalizeModifier);
    if (modifiers.some((modifier) => modifier === null)) throw new Error(`Unsupported key shortcut: ${shortcut}`);
    let modifierBits = 0;
    const pressedModifiers = [];
    let mainKeyDown = false;
    try {
      for (const modifier of modifiers) {
        modifierBits |= modifier.bit;
        await this.controller.send(pageToken, ownerSessionId, "Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: modifier.key,
          modifiers: modifierBits,
        }, signal);
        pressedModifiers.push(modifier);
      }
      const text = key.length === 1 && (modifierBits & 7) === 0 ? key : undefined;
      await this.controller.send(pageToken, ownerSessionId, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        text,
        modifiers: modifierBits,
      }, signal);
      mainKeyDown = true;
    } finally {
      if (mainKeyDown) {
        await this.controller.send(pageToken, ownerSessionId, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          modifiers: modifierBits,
        }).catch(() => {});
      }
      for (const modifier of [...pressedModifiers].reverse()) {
        modifierBits &= ~modifier.bit;
        await this.controller.send(pageToken, ownerSessionId, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key: modifier.key,
          modifiers: modifierBits,
        }).catch(() => {});
      }
    }
  }
}

function normalizeModifier(value) {
  const modifier = value.toLowerCase();
  if (modifier === "alt") return { key: "Alt", bit: 1 };
  if (modifier === "control" || modifier === "ctrl") return { key: "Control", bit: 2 };
  if (modifier === "meta" || modifier === "command" || modifier === "cmd") return { key: "Meta", bit: 4 };
  if (modifier === "shift") return { key: "Shift", bit: 8 };
  return null;
}
