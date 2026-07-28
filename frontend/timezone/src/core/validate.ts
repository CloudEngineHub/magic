import { SUPPORTED_FORMATS } from "../constants/formats"
import { TimezoneError, TimezoneErrorCode } from "../constants/errors"
import { timezoneCodeSet } from "../data/timezone-catalog"

export const assertTimeInput = (input: unknown, fieldName = "input"): void => {
	if (input === null || input === undefined) {
		throw new TimezoneError(TimezoneErrorCode.INVALID_TIME_INPUT, `${fieldName} is required`)
	}

	if (typeof input === "number") {
		if (!Number.isFinite(input)) {
			throw new TimezoneError(
				TimezoneErrorCode.INVALID_TIME_INPUT,
				`${fieldName} must be a finite number`,
			)
		}
		return
	}

	if (typeof input === "string") {
		if (!input.trim()) {
			throw new TimezoneError(
				TimezoneErrorCode.INVALID_TIME_INPUT,
				`${fieldName} cannot be an empty string`,
			)
		}
		return
	}

	if (input instanceof Date) {
		if (Number.isNaN(input.getTime())) {
			throw new TimezoneError(
				TimezoneErrorCode.INVALID_TIME_INPUT,
				`${fieldName} is an invalid Date`,
			)
		}
		return
	}

	throw new TimezoneError(
		TimezoneErrorCode.INVALID_TIME_INPUT,
		`${fieldName} must be string | number | Date`,
	)
}

export const assertSupportedFormat = (format: string): void => {
	if (!format) {
		throw new TimezoneError(TimezoneErrorCode.INVALID_FORMAT, "format is required")
	}

	if (!SUPPORTED_FORMATS.includes(format as (typeof SUPPORTED_FORMATS)[number])) {
		throw new TimezoneError(TimezoneErrorCode.INVALID_FORMAT, `unsupported format: ${format}`)
	}
}

export const assertTimezoneCode = (timezone: string, fieldName = "timezone"): void => {
	if (!timezone) {
		throw new TimezoneError(TimezoneErrorCode.INVALID_TIMEZONE, `${fieldName} is required`)
	}

	if (!timezoneCodeSet.has(timezone)) {
		throw new TimezoneError(
			TimezoneErrorCode.INVALID_TIMEZONE,
			`unsupported timezone: ${timezone}`,
		)
	}
}
