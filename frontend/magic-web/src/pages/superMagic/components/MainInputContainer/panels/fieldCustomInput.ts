import type { FieldCustomInputConfig } from "./types"

interface DecimalInteger {
	coefficient: bigint
	scale: number
}

// 防止异常科学计数法输入触发无限制的 BigInt 扩容。
const MAX_DECIMAL_SCALE = 1_000

function parseDecimalInteger(value: string): DecimalInteger | null {
	const match = value.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/)
	if (!match) return null

	const [, sign, integerPart = "", decimalPart = "", leadingDecimalPart = "", exponentText] =
		match
	const fractionPart = decimalPart || leadingDecimalPart
	const digits = `${integerPart || "0"}${fractionPart}`.replace(/^0+(?=\d)/, "")
	let coefficient = BigInt(digits || "0")
	if (sign === "-") coefficient = -coefficient
	if (coefficient === 0n) return { coefficient: 0n, scale: 0 }

	const exponent = exponentText ? Number(exponentText) : 0
	let scale = fractionPart.length - exponent
	if (!Number.isSafeInteger(scale) || Math.abs(scale) > MAX_DECIMAL_SCALE) return null

	if (scale < 0) {
		coefficient *= 10n ** BigInt(-scale)
		scale = 0
	}

	return { coefficient, scale }
}

function scaleDecimalInteger(value: DecimalInteger, scale: number) {
	return value.coefficient * 10n ** BigInt(scale - value.scale)
}

function matchesConfiguredStep(value: string, baseValue: number, step: number) {
	const parsedValue = parseDecimalInteger(value)
	const parsedBase = parseDecimalInteger(String(baseValue))
	const parsedStep = parseDecimalInteger(String(step))
	if (!parsedValue || !parsedBase || !parsedStep || parsedStep.coefficient <= 0n) return false

	const scale = Math.max(parsedValue.scale, parsedBase.scale, parsedStep.scale)
	const difference =
		scaleDecimalInteger(parsedValue, scale) - scaleDecimalInteger(parsedBase, scale)
	const scaledStep = scaleDecimalInteger(parsedStep, scale)

	return difference % scaledStep === 0n
}

/** Normalize and validate a custom field value before writing it to field.current_value. */
export function normalizeFieldCustomInputValue(
	value: string,
	config: FieldCustomInputConfig,
): string | null {
	const trimmedValue = value.trim()
	if (!trimmedValue) return null

	const numericValue = Number(trimmedValue)
	if (!Number.isFinite(numericValue)) return null
	if (config.integer && !Number.isSafeInteger(numericValue)) return null
	if (config.min !== undefined && numericValue < config.min) return null
	if (config.max !== undefined && numericValue > config.max) return null

	if (config.step !== undefined) {
		if (!Number.isFinite(config.step) || config.step <= 0) return null

		const baseValue = config.min ?? 0
		if (!matchesConfiguredStep(trimmedValue, baseValue, config.step)) return null
	}

	return String(numericValue)
}
