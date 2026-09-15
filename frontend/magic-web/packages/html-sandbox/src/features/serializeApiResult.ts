interface SerializeApiResultLimits {
	maxDepth: number
	maxCollectionItems: number
	maxObjectProperties: number
	maxStringLength: number
	maxTotalNodes: number
	maxTotalStringLength: number
}

export interface SerializedApiResult {
	value: unknown
	truncated: boolean
}

const DEFAULT_LIMITS: SerializeApiResultLimits = {
	maxDepth: 6,
	maxCollectionItems: 100,
	maxObjectProperties: 100,
	maxStringLength: 10_000,
	maxTotalNodes: 2_000,
	maxTotalStringLength: 200_000,
}

const TRUNCATED_VALUE = "[Truncated]"

/**
 * Converts an API response to a bounded, structured-clone-safe value.
 * This work only runs while DevTools is subscribed to runtime logs.
 */
export function serializeApiResult(
	input: unknown,
	limits: SerializeApiResultLimits = DEFAULT_LIMITS,
): SerializedApiResult {
	let remainingNodes = limits.maxTotalNodes
	let remainingStringLength = limits.maxTotalStringLength
	let truncated = false
	const seen = new WeakSet<object>()

	const markTruncated = (message = TRUNCATED_VALUE): string => {
		truncated = true
		return message
	}

	const serializeString = (value: string): string => {
		const allowedLength = Math.min(limits.maxStringLength, remainingStringLength)
		if (value.length <= allowedLength) {
			remainingStringLength -= value.length
			return value
		}

		if (allowedLength <= 0) {
			return markTruncated("[Truncated: string budget exceeded]")
		}

		remainingStringLength -= allowedLength
		return `${value.slice(0, allowedLength)}${markTruncated("… [Truncated]")}`
	}

	const visit = (value: unknown, depth: number): unknown => {
		if (remainingNodes <= 0) return markTruncated("[Truncated: node budget exceeded]")
		remainingNodes -= 1

		if (value === null || typeof value === "boolean") return value
		if (typeof value === "string") return serializeString(value)
		if (typeof value === "number") return Number.isFinite(value) ? value : String(value)
		if (typeof value === "bigint") return `${value.toString()}n`
		if (typeof value === "undefined") return "[undefined]"
		if (typeof value === "symbol") return value.toString()
		if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`

		if (value instanceof Date) return value.toISOString()
		if (value instanceof RegExp) return value.toString()
		if (value instanceof Error) {
			return {
				name: value.name,
				message: serializeString(value.message),
				...(value.stack ? { stack: serializeString(value.stack) } : {}),
			}
		}
		if (typeof Blob !== "undefined" && value instanceof Blob) {
			return `[${value.constructor.name} size=${value.size} type=${value.type || "unknown"}]`
		}
		if (value instanceof ArrayBuffer) return `[ArrayBuffer byteLength=${value.byteLength}]`
		if (ArrayBuffer.isView(value)) {
			return `[${value.constructor.name} byteLength=${value.byteLength}]`
		}
		if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
			return `<${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ""}>`
		}

		if (depth >= limits.maxDepth) return markTruncated("[Truncated: max depth reached]")
		if (seen.has(value)) return markTruncated("[Circular]")
		seen.add(value)

		if (Array.isArray(value)) {
			const itemCount = Math.min(value.length, limits.maxCollectionItems)
			const result = value.slice(0, itemCount).map((item) => visit(item, depth + 1))
			if (value.length > itemCount) {
				result.push(markTruncated(`[Truncated: ${value.length - itemCount} more items]`))
			}
			return result
		}

		if (value instanceof Map) {
			const result: unknown[] = []
			let index = 0
			for (const [key, item] of value) {
				if (index >= limits.maxCollectionItems) {
					result.push(markTruncated(`[Truncated: ${value.size - index} more entries]`))
					break
				}
				result.push([visit(key, depth + 1), visit(item, depth + 1)])
				index += 1
			}
			return { type: "Map", entries: result }
		}

		if (value instanceof Set) {
			const result: unknown[] = []
			let index = 0
			for (const item of value) {
				if (index >= limits.maxCollectionItems) {
					result.push(markTruncated(`[Truncated: ${value.size - index} more items]`))
					break
				}
				result.push(visit(item, depth + 1))
				index += 1
			}
			return { type: "Set", values: result }
		}

		const keys = Object.keys(value)
		const propertyCount = Math.min(keys.length, limits.maxObjectProperties)
		const result: Record<string, unknown> = {}
		const record = value as Record<string, unknown>
		for (const key of keys.slice(0, propertyCount)) {
			try {
				result[key] = visit(record[key], depth + 1)
			} catch (error) {
				result[key] =
					`[Unserializable: ${error instanceof Error ? error.message : String(error)}]`
			}
		}
		if (keys.length > propertyCount) {
			result.__magic_truncated__ = markTruncated(
				`[Truncated: ${keys.length - propertyCount} more properties]`,
			)
		}
		return result
	}

	try {
		return { value: visit(input, 0), truncated }
	} catch (error) {
		return {
			value: `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`,
			truncated: true,
		}
	}
}
