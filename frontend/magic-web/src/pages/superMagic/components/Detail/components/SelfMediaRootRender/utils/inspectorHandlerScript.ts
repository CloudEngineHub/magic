/**
 * Minimal ElementInspectorHandler script for injection into CardFrame iframes.
 *
 * This script is injected dynamically when the inspector is started and removed
 * when stopped. It listens for MAGIC_INSPECTOR_START/STOP messages and reports
 * HOVER/SELECT/HOVER_END back to the parent window.
 *
 * The script is self-contained — no external dependencies.
 */

const INSPECTOR_HANDLER_SCRIPT = `
(function() {
  if (window.__MAGIC_INSPECTOR_HANDLER__) return;
  window.__MAGIC_INSPECTOR_HANDLER__ = true;

  var INSPECTOR_MSG = {
    START: "MAGIC_INSPECTOR_START",
    STOP: "MAGIC_INSPECTOR_STOP",
    HOVER: "MAGIC_INSPECTOR_HOVER",
    SELECT: "MAGIC_INSPECTOR_SELECT",
    HOVER_END: "MAGIC_INSPECTOR_HOVER_END"
  };

  var active = false;
  var hoveredElement = null;

  function parsePx(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function getBoxSides(computed, prefix) {
    return {
      top: parsePx(computed.getPropertyValue(prefix + "-top")),
      right: parsePx(computed.getPropertyValue(prefix + "-right")),
      bottom: parsePx(computed.getPropertyValue(prefix + "-bottom")),
      left: parsePx(computed.getPropertyValue(prefix + "-left"))
    };
  }

  var STYLE_PROPS = [
    "display","position","width","height","color","backgroundColor",
    "fontSize","fontFamily","fontWeight","lineHeight","textAlign",
    "opacity","borderRadius","overflow","zIndex","flexDirection",
    "justifyContent","alignItems"
  ];

  function getElementSelector(element) {
    if (!element || element.nodeType !== 1) return "";
    if (element === document.documentElement) return "html";
    if (element === document.body) return "body";

    var path = [];
    var current = element;

    while (current && current.nodeType === 1 && current !== document.documentElement && current !== document.body) {
      var selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += "#" + current.id;
        path.unshift(selector);
        break;
      }

      var classes = [];
      if (current.className && typeof current.className === "string") {
        classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
      }

      var baseSelector = selector;
      if (classes.length > 0) {
        baseSelector += classes.map(function(c) { return "." + c; }).join("");
      }

      var parent = current.parentElement;
      if (parent) {
        var tag = current.tagName.toLowerCase();
        var siblings = Array.from(parent.children).filter(function(ch) {
          return ch.tagName.toLowerCase() === tag;
        });
        if (siblings.length > 1) {
          var index = siblings.indexOf(current) + 1;
          selector = baseSelector + ":nth-of-type(" + index + ")";
        } else {
          selector = baseSelector;
        }
      } else {
        selector = baseSelector;
      }

      path.unshift(selector);
      current = parent;
    }

    var selectorPath = path.join(" > ");
    if (element.parentElement === document.body && selectorPath) return "body > " + selectorPath;
    return selectorPath;
  }

  function collectElementInfo(el) {
    var computed = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var computedStyles = {};
    STYLE_PROPS.forEach(function(prop) { computedStyles[prop] = computed[prop] || ""; });

    var attributes = {};
    var skipAttrs = ["class","id","style"];
    var attrCount = 0;
    for (var i = 0; i < el.attributes.length && attrCount < 10; i++) {
      var attr = el.attributes[i];
      if (skipAttrs.indexOf(attr.name) === -1) {
        attributes[attr.name] = attr.value.length > 100 ? attr.value.slice(0,100) + "…" : attr.value;
        attrCount++;
      }
    }

    var rawText = (el.textContent || "").trim();
    var textContent = rawText.length > 120 ? rawText.slice(0,120) + "…" : rawText;

    var classList = [];
    if (el.className && typeof el.className === "string") {
      classList = el.className.trim().split(/\\s+/).filter(Boolean);
    }

    return {
      selector: getElementSelector(el),
      tagName: el.tagName.toLowerCase(),
      id: el.id || "",
      classList: classList,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      margin: getBoxSides(computed, "margin"),
      padding: getBoxSides(computed, "padding"),
      border: {
        top: parsePx(computed.borderTopWidth),
        right: parsePx(computed.borderRightWidth),
        bottom: parsePx(computed.borderBottomWidth),
        left: parsePx(computed.borderLeftWidth)
      },
      computedStyles: computedStyles,
      attributes: attributes,
      textContent: textContent,
      accessibleName: el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || undefined
    };
  }

  function onMouseMove(e) {
    if (!active) return;
    var target = e.target;
    if (!target || target === document.body || target === document.documentElement) return;
    if (target.getAttribute && target.getAttribute("data-injected") === "true") return;
    if (hoveredElement === target) return;
    hoveredElement = target;
    try {
      window.parent.postMessage({ type: INSPECTOR_MSG.HOVER, elementInfo: collectElementInfo(target), timestamp: Date.now() }, "*");
    } catch(ex) {}
  }

  function onMouseOut(e) {
    if (!active) return;
    var related = e.relatedTarget;
    if (!related || related === document.documentElement) {
      hoveredElement = null;
      try {
        window.parent.postMessage({ type: INSPECTOR_MSG.HOVER_END, timestamp: Date.now() }, "*");
      } catch(ex) {}
    }
  }

  function onClick(e) {
    if (!active) return;
    var target = e.target;
    if (!target) return;
    if (target.getAttribute && target.getAttribute("data-injected") === "true") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try {
      window.parent.postMessage({ type: INSPECTOR_MSG.SELECT, elementInfo: collectElementInfo(target), timestamp: Date.now() }, "*");
    } catch(ex) {}
    deactivate();
  }

  function activate() {
    if (active) return;
    active = true;
    hoveredElement = null;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("click", onClick, true);
    document.documentElement.style.cursor = "crosshair";
  }

  function deactivate() {
    if (!active) return;
    active = false;
    hoveredElement = null;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.documentElement.style.cursor = "";
  }

  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === INSPECTOR_MSG.START) { activate(); }
    if (event.data && event.data.type === INSPECTOR_MSG.STOP) { deactivate(); }
  });

  // If START was already sent before this script was injected, auto-activate
  activate();
})();
`

/**
 * Injects the inspector handler script into an iframe's document.
 * The iframe must have same-origin access (sandbox="allow-same-origin allow-scripts").
 *
 * Returns a cleanup function that removes the script and deactivates the handler.
 */
export function injectInspectorHandler(iframe: HTMLIFrameElement): (() => void) | null {
  const doc = iframe.contentDocument
  if (!doc) return null

  // Avoid double-injection
  if ((iframe.contentWindow as any)?.__MAGIC_INSPECTOR_HANDLER__) {
    return () => {
      iframe.contentWindow?.postMessage(
        { type: "MAGIC_INSPECTOR_STOP", timestamp: Date.now() },
        "*",
      )
    }
  }

  const script = doc.createElement("script")
  script.setAttribute("data-injected", "true")
  script.textContent = INSPECTOR_HANDLER_SCRIPT
  doc.body.appendChild(script)

  return () => {
    iframe.contentWindow?.postMessage(
      { type: "MAGIC_INSPECTOR_STOP", timestamp: Date.now() },
      "*",
    )
    try {
      script.remove()
    } catch {
      // iframe may already be detached
    }
    try {
      ; (iframe.contentWindow as any).__MAGIC_INSPECTOR_HANDLER__ = false
    } catch {
      // cross-origin or detached
    }
  }
}
