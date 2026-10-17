/**
 * Renders agent-written JSON values as short readable text.
 * Example: { age: 52, city: "西安" } → "age: 52 · city: 西安"; ["a", "b"] → "a、b".
 */
export function formatResearchValue(value: unknown): string {
	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	if (Array.isArray(value)) return value.map(formatResearchValue).filter(Boolean).join("、")
	if (typeof value === "object") {
		return Object.entries(value as Record<string, unknown>)
			.map(([key, item]) => {
				const text = formatResearchValue(item)
				return text ? `${key}: ${text}` : ""
			})
			.filter(Boolean)
			.join(" · ")
	}
	return ""
}
