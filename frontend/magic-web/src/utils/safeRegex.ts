export const MAX_REGEX_QUERY_LENGTH = 256

/**
 * Reject the most common nested-quantifier shape before handing user input to JavaScript RegExp.
 * This keeps ordinary patterns such as `^`, `.*`, and `a*` valid while blocking obvious ReDoS cases.
 */
export function isPotentiallyUnsafeRegex(value: string): boolean {
	const hasBackreference = /\\[1-9]/.test(value)
	const hasOverlappingQuantifiedAlternation = Array.from(
		value.matchAll(/\(([^()]*)\)(?:[+*]|\{\d)/g),
	).some(([, body]) => {
		const alternatives = body.split("|")
		return alternatives.some((left, index) =>
			alternatives.some(
				(right, otherIndex) =>
					index !== otherIndex &&
					Boolean(left) &&
					Boolean(right) &&
					right.startsWith(left),
			),
		)
	})

	return (
		value.length > MAX_REGEX_QUERY_LENGTH ||
		hasBackreference ||
		hasOverlappingQuantifiedAlternation ||
		/\([^()\n]*[+*](?:[^()\n]*)\)(?:[+*]|\{\d)/.test(value)
	)
}

export function tryCreateRegex(
	pattern: string,
	flags: string,
	validatePattern = true,
): RegExp | null {
	if (validatePattern && isPotentiallyUnsafeRegex(pattern)) return null

	try {
		return new RegExp(pattern, flags)
	} catch {
		return null
	}
}
