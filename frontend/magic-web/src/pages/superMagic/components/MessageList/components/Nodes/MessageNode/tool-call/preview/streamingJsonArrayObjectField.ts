import { decodePartialJsonString } from "./streamingJsonStringField"
import type { ToolRemarkPreviewParseResult, ToolRemarkPreviewParser } from "./types"

export interface CreateStreamingJsonArrayObjectStringFieldParserOptions {
	arrayField: string
	itemField: string
	transformItem?: (value: string) => string
	format?: (values: readonly string[]) => string
	scanLimit?: number
}

type ContainerType = "array" | "object"
type StringRole = "array-key" | "item-key" | "item-value" | "other"
type ValueExpectation = "none" | "colon" | "value"

const DEFAULT_SCAN_LIMIT = 32 * 1024

/**
 * Incrementally scans one configured array of objects instead of reparsing the
 * complete arguments JSON for every streamed chunk. Only direct item fields
 * are collected, preventing similarly named fields elsewhere from leaking in.
 */
export function createStreamingJsonArrayObjectStringFieldParser({
	arrayField,
	itemField,
	transformItem = (value) => value,
	format = (values) => values.join("、"),
	scanLimit = DEFAULT_SCAN_LIMIT,
}: CreateStreamingJsonArrayObjectStringFieldParserOptions): ToolRemarkPreviewParser {
	let previousPrefix = ""
	let scanOffset = 0
	let containers: ContainerType[] = []
	let lastSignificantCharacter = ""
	let targetArrayDepth = -1
	let arrayExpectation: ValueExpectation = "none"
	let itemExpectation: ValueExpectation = "none"
	let inString = false
	let escaped = false
	let stringRole: StringRole = "other"
	let stringBuffer = ""
	let exhausted = false
	let collectedValues: string[] = []
	let collectedRawValues = new Set<string>()

	const reset = () => {
		previousPrefix = ""
		scanOffset = 0
		containers = []
		lastSignificantCharacter = ""
		targetArrayDepth = -1
		arrayExpectation = "none"
		itemExpectation = "none"
		inString = false
		escaped = false
		stringRole = "other"
		stringBuffer = ""
		exhausted = false
		collectedValues = []
		collectedRawValues = new Set<string>()
	}

	const beginString = (role: StringRole) => {
		inString = true
		escaped = false
		stringRole = role
		stringBuffer = ""
	}

	const isObjectKeyPosition = () =>
		containers.at(-1) === "object" &&
		(lastSignificantCharacter === "{" || lastSignificantCharacter === ",")

	return {
		parse(rawArguments: string): ToolRemarkPreviewParseResult {
			if (exhausted && rawArguments.startsWith(previousPrefix)) return { status: "exhausted" }

			const prefix = rawArguments.slice(0, scanLimit)

			// Final tool-call arguments may replace rather than extend the streamed prefix.
			if (previousPrefix && !prefix.startsWith(previousPrefix)) reset()

			let aggregateChanged = false

			for (let index = scanOffset; index < prefix.length; index += 1) {
				const current = prefix[index]

				if (inString) {
					if (escaped) {
						stringBuffer += current
						escaped = false
						continue
					}
					if (current === "\\") {
						stringBuffer += current
						escaped = true
						continue
					}
					if (current !== '"') {
						stringBuffer += current
						continue
					}

					const value = decodePartialJsonString(stringBuffer)
					if (stringRole === "array-key" && value === arrayField) {
						arrayExpectation = "colon"
					} else if (stringRole === "item-key" && value === itemField) {
						itemExpectation = "colon"
					} else if (stringRole === "item-value" && !collectedRawValues.has(value)) {
						const transformedValue = transformItem(value)
						if (transformedValue) {
							collectedRawValues.add(value)
							collectedValues.push(transformedValue)
							aggregateChanged = true
						}
					}

					inString = false
					escaped = false
					stringRole = "other"
					stringBuffer = ""
					lastSignificantCharacter = '"'
					continue
				}

				if (/\s/.test(current)) continue

				if (arrayExpectation === "colon") {
					arrayExpectation = current === ":" ? "value" : "none"
					lastSignificantCharacter = current
					continue
				}
				if (arrayExpectation === "value") {
					arrayExpectation = "none"
					if (current === "[") {
						containers.push("array")
						targetArrayDepth = containers.length
						lastSignificantCharacter = current
						continue
					}
				}

				if (itemExpectation === "colon") {
					itemExpectation = current === ":" ? "value" : "none"
					lastSignificantCharacter = current
					continue
				}
				if (itemExpectation === "value") {
					itemExpectation = "none"
					if (current === '"') {
						beginString("item-value")
						continue
					}
				}

				if (current === '"') {
					let role: StringRole = "other"
					if (isObjectKeyPosition()) {
						if (containers.length === 1 && targetArrayDepth < 0) {
							role = "array-key"
						} else if (
							targetArrayDepth > 0 &&
							containers.length === targetArrayDepth + 1
						) {
							role = "item-key"
						}
					}
					beginString(role)
					continue
				}

				if (current === "{") containers.push("object")
				if (current === "[") containers.push("array")
				if (current === "}" && containers.at(-1) === "object") containers.pop()
				if (current === "]" && containers.at(-1) === "array") {
					if (containers.length === targetArrayDepth) targetArrayDepth = -1
					containers.pop()
				}
				lastSignificantCharacter = current
			}

			previousPrefix = prefix
			scanOffset = prefix.length

			if (aggregateChanged) {
				return { status: "resolved", value: format(collectedValues) }
			}
			if (prefix.length >= scanLimit) {
				exhausted = true
				return { status: "exhausted" }
			}
			return { status: "pending" }
		},
	}
}
