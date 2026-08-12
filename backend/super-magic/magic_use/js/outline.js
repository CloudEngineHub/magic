(function installMagicOutline(global) {
  if (global.MagicOutline) return;

  const TEXT_LIMIT = 40;

  function compact(value, limit) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function attributeText(element) {
    return Array.from(element.attributes)
      .filter((attribute) => attribute.name === "id" || attribute.name === "class" || attribute.name.startsWith("data-") || attribute.name.startsWith("aria-") || attribute.name === "name" || attribute.name === "role")
      .map((attribute) => `${attribute.name}="${compact(attribute.value, 160)}"`)
      .join(" ");
  }

  function renderNode(node, detail, depth, maxChars, state) {
    if (!(node instanceof Element) || state.length >= maxChars) return "";
    const tag = node.tagName.toLowerCase();
    const attrs = attributeText(node);
    const text = detail === "full" ? compact(node.textContent, 1000) : compact(node.childNodes.length === 1 ? node.textContent : "", TEXT_LIMIT);
    const opening = `<${tag}${attrs ? ` ${attrs}` : ""}>`;
    const closing = `</${tag}>`;
    if (["svg"].includes(tag)) return `<${tag}/>`;
    if (["script", "style", "noscript"].includes(tag)) return opening + closing;
    const children = Array.from(node.children);
    if (!children.length) return text ? `${opening}${text}${closing}` : `${opening}${closing}`;
    const rendered = [];
    const seen = new Map();
    children.forEach((child) => {
      const key = `${child.tagName.toLowerCase()} ${child.getAttribute("class") || ""}`;
      const count = seen.get(key) || 0;
      if (detail === "outline" && count >= 2) {
        seen.set(key, count + 1);
        return;
      }
      seen.set(key, count + 1);
      rendered.push(renderNode(child, detail, depth + 1, maxChars, state));
    });
    const omitted = Array.from(seen.values()).some((count) => count > 2);
    if (omitted && detail === "outline") rendered.push("<!-- repeated sibling nodes omitted -->");
    const body = rendered.filter(Boolean).join("\n");
    const result = body ? `${opening}\n${body}\n${closing}` : `${opening}${text}${closing}`;
    state.length += result.length;
    return result.slice(0, Math.max(0, maxChars - state.length + result.length));
  }

  global.MagicOutline = {
    read(root, options) {
      const detail = options?.detail === "full" ? "full" : "outline";
      const maxChars = Number.isInteger(options?.max_chars) ? options.max_chars : 20_000;
      const state = { length: 0 };
      const output = renderNode(root || document.body, detail, 0, maxChars, state);
      return { content: output, truncated: state.length >= maxChars };
    },
  };
})(globalThis);
