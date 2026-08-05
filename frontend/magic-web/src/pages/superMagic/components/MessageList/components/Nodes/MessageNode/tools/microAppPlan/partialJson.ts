export interface PartialJsonResult {
	value: unknown
	isComplete: boolean
}

interface ParsedValue {
	found: boolean
	value: unknown
	isComplete: boolean
}

const MAX_PARTIAL_JSON_LENGTH = 512 * 1024

class PartialJsonParser {
	private index = 0

	constructor(private readonly source: string) {}

	parse(): PartialJsonResult {
		this.skipWhitespace()
		const result = this.parseValue()
		this.skipWhitespace()

		return {
			value: result.found ? result.value : undefined,
			isComplete: result.found && result.isComplete && this.index === this.source.length,
		}
	}

	private parseValue(): ParsedValue {
		this.skipWhitespace()
		const character = this.source[this.index]

		if (character === "{") return this.parseObject()
		if (character === "[") return this.parseArray()
		if (character === '"') return this.parseString()
		if (character === "-" || this.isDigit(character)) return this.parseNumber()
		if (character === "t") return this.parseLiteral("true", true)
		if (character === "f") return this.parseLiteral("false", false)
		if (character === "n") return this.parseLiteral("null", null)

		return { found: false, value: undefined, isComplete: false }
	}

	private parseObject(): ParsedValue {
		const value: Record<string, unknown> = {}
		this.index += 1

		while (this.index < this.source.length) {
			this.skipWhitespace()
			if (this.source[this.index] === "}") {
				this.index += 1
				return { found: true, value, isComplete: true }
			}

			const key = this.parseString()
			if (!key.found || !key.isComplete || typeof key.value !== "string") {
				return { found: true, value, isComplete: false }
			}

			this.skipWhitespace()
			if (this.source[this.index] !== ":") {
				return { found: true, value, isComplete: false }
			}
			this.index += 1

			const item = this.parseValue()
			if (!item.found) return { found: true, value, isComplete: false }
			value[key.value] = item.value
			if (!item.isComplete) return { found: true, value, isComplete: false }

			this.skipWhitespace()
			const separator = this.source[this.index]
			if (separator === ",") {
				this.index += 1
				continue
			}
			if (separator === "}") {
				this.index += 1
				return { found: true, value, isComplete: true }
			}

			return { found: true, value, isComplete: false }
		}

		return { found: true, value, isComplete: false }
	}

	private parseArray(): ParsedValue {
		const value: unknown[] = []
		this.index += 1

		while (this.index < this.source.length) {
			this.skipWhitespace()
			if (this.source[this.index] === "]") {
				this.index += 1
				return { found: true, value, isComplete: true }
			}

			const item = this.parseValue()
			if (!item.found) return { found: true, value, isComplete: false }
			value.push(item.value)
			if (!item.isComplete) return { found: true, value, isComplete: false }

			this.skipWhitespace()
			const separator = this.source[this.index]
			if (separator === ",") {
				this.index += 1
				continue
			}
			if (separator === "]") {
				this.index += 1
				return { found: true, value, isComplete: true }
			}

			return { found: true, value, isComplete: false }
		}

		return { found: true, value, isComplete: false }
	}

	private parseString(): ParsedValue {
		if (this.source[this.index] !== '"') {
			return { found: false, value: undefined, isComplete: false }
		}

		this.index += 1
		const parts: string[] = []
		let chunkStart = this.index

		const flushPlain = () => {
			if (this.index > chunkStart) parts.push(this.source.slice(chunkStart, this.index))
		}

		while (this.index < this.source.length) {
			const character = this.source[this.index]
			if (character === '"') {
				flushPlain()
				this.index += 1
				return { found: true, value: parts.join(""), isComplete: true }
			}

			if (character !== "\\") {
				this.index += 1
				continue
			}

			flushPlain()
			if (this.index + 1 >= this.source.length) {
				return { found: true, value: parts.join(""), isComplete: false }
			}

			const escaped = this.source[this.index + 1]
			if (escaped === "u") {
				const hex = this.source.slice(this.index + 2, this.index + 6)
				if (hex.length < 4) {
					return { found: true, value: parts.join(""), isComplete: false }
				}
				if (/^[0-9a-fA-F]{4}$/.test(hex)) {
					parts.push(String.fromCharCode(Number.parseInt(hex, 16)))
				}
				this.index += 6
				chunkStart = this.index
				continue
			}

			parts.push(this.decodeEscape(escaped))
			this.index += 2
			chunkStart = this.index
		}

		flushPlain()
		return { found: true, value: parts.join(""), isComplete: false }
	}

	private parseNumber(): ParsedValue {
		const start = this.index
		while (this.index < this.source.length && /[0-9eE+.-]/.test(this.source[this.index])) {
			this.index += 1
		}

		const raw = this.source.slice(start, this.index)
		const value = Number(raw)
		if (!Number.isFinite(value)) {
			return { found: false, value: undefined, isComplete: false }
		}

		return {
			found: true,
			value,
			isComplete: this.index < this.source.length,
		}
	}

	private parseLiteral(token: string, value: unknown): ParsedValue {
		const remaining = this.source.slice(this.index)
		if (!token.startsWith(remaining) && !remaining.startsWith(token)) {
			return { found: false, value: undefined, isComplete: false }
		}
		if (remaining.length < token.length) {
			return { found: false, value: undefined, isComplete: false }
		}

		this.index += token.length
		return { found: true, value, isComplete: true }
	}

	private skipWhitespace() {
		while (this.index < this.source.length && /\s/.test(this.source[this.index])) {
			this.index += 1
		}
	}

	private isDigit(character: string | undefined) {
		return character !== undefined && character >= "0" && character <= "9"
	}

	private decodeEscape(character: string) {
		const escapes: Record<string, string> = {
			'"': '"',
			"\\": "\\",
			"/": "/",
			b: "\b",
			f: "\f",
			n: "\n",
			r: "\r",
			t: "\t",
		}
		return escapes[character] ?? character
	}
}

export function parsePartialJson(source: string): PartialJsonResult {
	if (!source) return { value: undefined, isComplete: false }

	try {
		return { value: JSON.parse(source), isComplete: true }
	} catch {
		// Tool arguments are expected to be incomplete while streaming.
	}

	const safeSource =
		source.length > MAX_PARTIAL_JSON_LENGTH ? source.slice(0, MAX_PARTIAL_JSON_LENGTH) : source
	return new PartialJsonParser(safeSource).parse()
}
