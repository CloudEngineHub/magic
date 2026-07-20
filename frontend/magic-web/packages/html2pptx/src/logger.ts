/**
 * Unified html2pptx logging.
 *
 * Usage:
 *   1. Call configureLogger(options) once at the entry point.
 *   2. Import { log } from "./logger" directly from any file.
 *   3. Use createScopedLog("sandbox") when a submodule prefix is needed.
 */

// Internal levels, only used inside this package and not exposed publicly.
export const LogLevel = {
	L1: 10,
	L2: 20,
	L3: 30,
	L4: 40,
} as const

export type LogLevelValue = typeof LogLevel[keyof typeof LogLevel]

export type LogFn = (
	level: LogLevelValue,
	message: string,
	context?: Record<string, unknown>,
) => void

// Public interface, fully compatible with console.
export interface ExternalLogger {
	debug?(...args: unknown[]): void
	info?(...args: unknown[]): void
	warn?(...args: unknown[]): void
	error?(...args: unknown[]): void
}

export type LogLevelLabel = "debug" | "info" | "warn" | "error"

// Internal level to standard method mapping.
const LevelToMethod: Record<LogLevelValue, LogLevelLabel> = {
	10: "debug",
	20: "info",
	30: "warn",
	40: "error",
}

const LabelToValue: Record<LogLevelLabel, LogLevelValue> = {
	debug: 10,
	info:  20,
	warn:  30,
	error: 40,
}

// Global configuration.
export interface LoggerOptions {
	minLevel?: LogLevelLabel
	logger?: ExternalLogger
}

const PREFIX = "[html2pptx]"

let _minLevel: LogLevelValue = LogLevel.L2
let _logger: ExternalLogger | null = null

export function configureLogger(options: LoggerOptions = {}): void {
	_minLevel = options.minLevel ? LabelToValue[options.minLevel] : LogLevel.L2
	_logger = options.logger ?? null
}

export function resetLogger(): void {
	_minLevel = LogLevel.L2
	_logger = null
}

function emit(prefix: string, level: LogLevelValue, message: string, context?: Record<string, unknown>): void {
	if (level < _minLevel) return

	const method = LevelToMethod[level]
	const target = _logger ?? console
	const fn = target[method]
	if (typeof fn !== "function") return

	const text = `${prefix} ${message}`
	context && Object.keys(context).length > 0
		? fn.call(target, text, context)
		: fn.call(target, text)
}

export const log: LogFn = (level, message, context) => emit(PREFIX, level, message, context)

export function createScopedLog(scope: string): LogFn {
	const prefix = `${PREFIX}:${scope}`
	return (level, message, context) => emit(prefix, level, message, context)
}
