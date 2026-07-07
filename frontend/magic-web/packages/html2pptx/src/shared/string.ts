/**
 * Split a string by top-level commas, ignoring commas inside parentheses
 *
 * Useful for CSS gradient parameters, multi-value background-image, multiple box-shadow values, and similar cases,
 * because functions such as rgb()/rgba() inside these values also contain commas and should not be split.
 */
export function splitByTopLevelComma(value: string): string[] {
	const parts: string[] = []
	let current = ""
	let depth = 0

	for (const char of value) {
		if (char === "(") depth++
		if (char === ")") depth--

		if (char === "," && depth === 0) {
			parts.push(current.trim())
			current = ""
		} else {
			current += char
		}
	}

	if (current.trim()) {
		parts.push(current.trim())
	}

	return parts
}
