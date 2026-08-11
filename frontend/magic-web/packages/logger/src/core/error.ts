export interface NormalizedError {
	error: Error
	syntheticError: boolean
}

export class MagicLoggerSyntheticError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "MagicLoggerSyntheticError"
	}
}

function toSafeMessage(value: unknown, fallbackMessage: string): string {
	if (value instanceof Error && value.message) return value.message
	if (typeof value === "string" && value.trim()) return value
	return fallbackMessage
}

export function normalizeError(value: unknown, fallbackMessage: string): NormalizedError {
	if (value instanceof Error) {
		return { error: value, syntheticError: false }
	}

	return {
		error: new MagicLoggerSyntheticError(toSafeMessage(value, fallbackMessage)),
		syntheticError: true,
	}
}
