/**
 * Converts an unknown thrown value into a displayable message.
 *
 * API interceptors may reject with a plain response object rather than an
 * Error. String(error) turns that object into "[object Object]" and hides the
 * useful response fields, so serialize structured values as JSON instead.
 */
export function stringifyUnknownError(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === "string") return error

	try {
		const seen = new WeakSet<object>()
		const serialized = JSON.stringify(error, (_key, value: unknown) => {
			if (typeof value === "bigint") return `${value}n`
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) return "[Circular]"
				seen.add(value)
			}
			return value
		})
		if (serialized !== undefined) return serialized
	} catch {
		// Fall through to a stable JSON fallback for values with a throwing
		// toJSON implementation or another unsupported serialization shape.
	}

	return '{"error":"Unable to serialize thrown value"}'
}
