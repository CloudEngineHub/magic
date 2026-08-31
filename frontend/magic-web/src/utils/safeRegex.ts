export const MAX_REGEX_QUERY_LENGTH = 256

/**
 * Reject the most common nested-quantifier shape before handing user input to JavaScript RegExp.
 * This keeps ordinary patterns such as `^`, `.*`, and `a*` valid while blocking obvious ReDoS cases.
 */
export function isPotentiallyUnsafeRegex(value: string): boolean {
	return (
		value.length > MAX_REGEX_QUERY_LENGTH ||
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
