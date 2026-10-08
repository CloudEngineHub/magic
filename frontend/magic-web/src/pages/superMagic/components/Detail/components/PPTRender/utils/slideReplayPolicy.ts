/** Only declarative slides can rewind without re-executing authored JavaScript. */
export function canReplaySlideInPlace(content: string): boolean {
	const doc = new DOMParser().parseFromString(content, "text/html")
	// Event handlers and embedded documents can own state that animation APIs cannot reset.
	if (doc.querySelector("iframe, object, embed, form, input, textarea, select, details"))
		return false
	// Important authored animation rules can override the temporary reset stylesheet. They
	// retain document replay rather than silently failing to replay a completed entrance.
	for (const element of doc.querySelectorAll("style, [style]")) {
		const css =
			element.tagName === "STYLE"
				? (element.textContent ?? "")
				: (element.getAttribute("style") ?? "")
		if (/animation(?:-[a-z-]+)?\s*:[^;{}]*!important/i.test(css)) return false
	}
	for (const element of doc.querySelectorAll("*")) {
		if (element.getAttributeNames().some((name) => /^on/i.test(name))) return false
	}
	return Array.from(doc.querySelectorAll("script")).every((script) => {
		// Some loaders supply only processed HTML. This specific host polyfill is stateless;
		// arbitrary scripts carrying a generic data-injected marker still require replay.
		if (script.getAttribute("data-injected") === "at-polyfill") return true
		const type = (script.getAttribute("type") ?? "").trim().toLowerCase()
		if (["application/json", "application/ld+json", "importmap"].includes(type)) return true
		if (!script.src && !script.textContent?.trim()) return true
		// Standard deck messaging and Tailwind configure presentation, not an authored timeline.
		const src = script.getAttribute("src") ?? ""
		return (
			/^(?:\.\/)?slide-bridge\.js$/.test(src) ||
			/^https:\/\/cdn\.tailwindcss\.com(?:\/3\.4\.17)?\/?$/.test(src)
		)
	})
}
