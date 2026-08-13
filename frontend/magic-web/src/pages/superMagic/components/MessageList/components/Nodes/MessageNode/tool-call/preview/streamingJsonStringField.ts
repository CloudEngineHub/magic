import type { ToolRemarkPreviewParseResult, ToolRemarkPreviewParser } from "./types"

export type StreamingJsonStringFieldParseResult = ToolRemarkPreviewParseResult

export type StreamingJsonStringFieldParser = ToolRemarkPreviewParser

export interface CreateStreamingJsonStringFieldParserOptions {
	field: string
	transform?: (value: string) => string
	scanLimit?: number
}

const DEFAULT_SCAN_LIMIT = 4 * 1024

/**
 * Decode the portion of a JSON string that has already arrived. The caller only
 * invokes this after the closing quote is found, so incomplete trailing escapes
 * cannot be mistaken for a complete value.
 */
export function decodePartialJsonString(raw: string): string {
	let result = ""
	let index = 0

	while (index < raw.length) {
		const current = raw[index]

		if (current === "\\") {
			if (index + 1 >= raw.length) break

			const next = raw[index + 1]
			switch (next) {
				case "n":
					result += "\n"
					break
				case "t":
					result += "\t"
					break
				case "r":
					result += "\r"
					break
				case '"':
					result += '"'
					break
				case "\\":
					result += "\\"
					break
				case "/":
					result += "/"
					break
				case "b":
					result += "\b"
					break
				case "f":
					result += "\f"
					break
				default: {
					if (next === "u" && index + 5 < raw.length) {
						const hex = raw.slice(index + 2, index + 6)
						const code = Number.parseInt(hex, 16)
						if (!Number.isNaN(code)) {
							result += String.fromCharCode(code)
							index += 6
							continue
						}
					}

					result += current + next
					break
				}
			}

			index += 2
			continue
		}

		if (current === '"') break

		result += current
		index += 1
	}

	return result
}

export function createStreamingJsonStringFieldParser({
	field,
	transform = (value) => value,
	scanLimit = DEFAULT_SCAN_LIMIT,
}: CreateStreamingJsonStringFieldParserOptions): StreamingJsonStringFieldParser {
	const fieldToken = JSON.stringify(field)
	let previousPrefix = ""
	let searchOffset = 0
	let keyIndex = -1
	let valueStart = -1
	let valueScanOffset = -1
	let escaped = false
	let resolvedPrefix = ""
	let resolvedValue: string | undefined
	let exhausted = false

	const reset = () => {
		previousPrefix = ""
		searchOffset = 0
		keyIndex = -1
		valueStart = -1
		valueScanOffset = -1
		escaped = false
		resolvedPrefix = ""
		resolvedValue = undefined
		exhausted = false
	}

	const pending = (prefix: string): StreamingJsonStringFieldParseResult => {
		if (prefix.length >= scanLimit) {
			exhausted = true
			return { status: "exhausted" }
		}
		return { status: "pending" }
	}

	return {
		parse(rawArguments: string) {
			// Once resolved, ordinary content appends avoid even the bounded prefix slice.
			if (resolvedValue !== undefined && rawArguments.startsWith(resolvedPrefix)) {
				return { status: "resolved", value: resolvedValue }
			}
			if (exhausted && rawArguments.startsWith(previousPrefix)) return { status: "exhausted" }

			const prefix = rawArguments.slice(0, scanLimit)

			// A Final payload can replace the streamed prefix; restart only for that case.
			if (previousPrefix && !prefix.startsWith(previousPrefix)) reset()
			previousPrefix = prefix

			if (keyIndex < 0) {
				keyIndex = prefix.indexOf(fieldToken, searchOffset)
				if (keyIndex < 0) {
					searchOffset = Math.max(0, prefix.length - fieldToken.length + 1)
					return pending(prefix)
				}
			}

			if (valueStart < 0) {
				const colonIndex = prefix.indexOf(":", keyIndex + fieldToken.length)
				if (colonIndex < 0) return pending(prefix)

				let cursor = colonIndex + 1
				while (cursor < prefix.length && /\s/.test(prefix[cursor])) cursor += 1
				if (cursor >= prefix.length) return pending(prefix)
				if (prefix[cursor] !== '"') {
					exhausted = true
					return { status: "exhausted" }
				}

				valueStart = cursor + 1
				valueScanOffset = valueStart
			}

			for (let index = valueScanOffset; index < prefix.length; index += 1) {
				const current = prefix[index]
				if (escaped) {
					escaped = false
					continue
				}
				if (current === "\\") {
					escaped = true
					continue
				}
				if (current !== '"') continue

				resolvedValue = transform(decodePartialJsonString(prefix.slice(valueStart, index)))
				resolvedPrefix = prefix.slice(0, index + 1)
				previousPrefix = resolvedPrefix
				return { status: "resolved", value: resolvedValue }
			}

			valueScanOffset = prefix.length
			return pending(prefix)
		},
	}
}
