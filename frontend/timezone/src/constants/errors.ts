export const TimezoneErrorCode = {
	INVALID_TIME_INPUT: "INVALID_TIME_INPUT",
	INVALID_TIMEZONE: "INVALID_TIMEZONE",
	INVALID_FORMAT: "INVALID_FORMAT",
	LOCALE_NOT_FOUND: "LOCALE_NOT_FOUND",
	UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
} as const

export type TimezoneErrorCode = (typeof TimezoneErrorCode)[keyof typeof TimezoneErrorCode]

export class TimezoneError extends Error {
	public readonly code: TimezoneErrorCode
	public readonly details?: Record<string, unknown>

	constructor(code: TimezoneErrorCode, message: string, details?: Record<string, unknown>) {
		super(message)
		this.name = "TimezoneError"
		this.code = code
		this.details = details
	}
}
