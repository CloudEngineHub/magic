import type { CSSProperties } from "react"

export function normalizeInlineStyle(style: unknown): CSSProperties | undefined {
	if (!style) return undefined

	if (typeof style === "object" && !Array.isArray(style)) {
		return style as CSSProperties
	}

	if (typeof style !== "string" || typeof document === "undefined") return undefined

	const styleElement = document.createElement("div")
	styleElement.setAttribute("style", style)

	const normalizedStyle: Record<string, string> = {}
	for (let index = 0; index < styleElement.style.length; index += 1) {
		const propertyName = styleElement.style.item(index)
		if (!propertyName) continue

		const reactPropertyName = propertyName.startsWith("--")
			? propertyName
			: propertyName.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase())
		normalizedStyle[reactPropertyName] = styleElement.style.getPropertyValue(propertyName)
	}

	return normalizedStyle as CSSProperties
}
