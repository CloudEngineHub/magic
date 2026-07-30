export const DEFAULT_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss"
export const DAY_KEY_FORMAT = "YYYY-MM-DD"

export const SUPPORTED_FORMATS = [
	"HH:mm",
	"HH:mm:ss",
	"YYYY",
	"YYYY/MM",
	"YYYY-MM",
	"YYYY-MM-DD",
	"YYYY/MM/DD",
	"YYYY-MM-DD HH:mm",
	"YYYY/MM/DD HH:mm",
	"YYYY/MM/DD (ddd)",
	"YYYY-MM-DD (ddd)",
	"YYYY-MM-DD HH:mm:ss",
	"YYYY/MM/DD HH:mm:ss",
	"MM/DD/YYYY HH:mm:ss",
	"MM/DD/YYYY HH:mm",
	"YYYY-MM-DD HH:mm:ss (ddd)",
	"YYYY/MM/DD HH:mm:ss (ddd)",
] as const

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]
