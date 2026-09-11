import type {
	ILogger,
	ILoggerConfig,
	IProvider,
	ICustomEvent,
	IUserInfo,
	ProviderErrorInput,
} from "../../../packages/logger/src"

const MAX_PENDING_ERRORS = 100
const MAX_QUEUED_TEXT_LENGTH = 1000
const SAFE_CONFIG_KEYS = new Set(["pid", "userId", "deviceId", "sessionId", "release", "env"])
const SENSITIVE_VALUE_PATTERN =
	/(token|password|secret|signature|api[_-]?key)["']?\s*[:=]\s*["']?[^\s,;"']+/gi

type DeferredTrackLogger = ILogger & {
	initialize: () => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isProviderErrorInput(value: unknown): value is ProviderErrorInput {
	if (!isRecord(value) || value.kind !== "provider-error-input") return false
	if (typeof value.fallbackMessage !== "string" || !isRecord(value.attributes)) return false

	const { attributes } = value
	return (
		typeof attributes.namespace === "string" &&
		typeof attributes.eventId === "string" &&
		typeof attributes.release === "string" &&
		(attributes.captureSource === "manual" || attributes.captureSource === "global")
	)
}

function sanitizeText(value: string): string {
	return (
		value
			.slice(0, MAX_QUEUED_TEXT_LENGTH)
			// Headers can contain spaces or multiple cookies; masking only the first word leaks
			// the credential after "Bearer" or the remaining cookie values.
			.replace(/(authorization|cookie)["']?\s*[:=][^\r\n]*/gi, "$1=[redacted]")
			.replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
			.replace(SENSITIVE_VALUE_PATTERN, "$1=[redacted]")
			.slice(0, MAX_QUEUED_TEXT_LENGTH)
	)
}

function sanitizeQueuedValue(value: unknown): unknown {
	if (value instanceof Error) {
		// Provider initialization happens after the first render; keep only bounded diagnostic data
		// in the interim queue so an exception cannot retain a token or an entire user input.
		const error = new Error(sanitizeText(value.message))
		error.name = sanitizeText(value.name)
		if (value.stack) error.stack = sanitizeText(value.stack)
		return error
	}

	if (typeof value === "string") return sanitizeText(value)
	if (typeof value === "number" || typeof value === "boolean" || value === null) return value
	return "[redacted]"
}

function sanitizeQueuedErrorArgs(args: unknown[]): unknown[] {
	const candidate = args[0]
	if (args.length === 1 && isProviderErrorInput(candidate)) {
		return [
			{
				kind: candidate.kind,
				value: sanitizeQueuedValue(candidate.value),
				fallbackMessage: sanitizeText(candidate.fallbackMessage),
				attributes: {
					namespace: sanitizeText(candidate.attributes.namespace),
					eventId: sanitizeText(candidate.attributes.eventId),
					release: sanitizeText(candidate.attributes.release),
					captureSource: candidate.attributes.captureSource,
					eventKey:
						typeof candidate.attributes.eventKey === "string"
							? sanitizeText(candidate.attributes.eventKey)
							: undefined,
					errorKind:
						typeof candidate.attributes.errorKind === "string"
							? sanitizeText(candidate.attributes.errorKind)
							: undefined,
				},
			},
		]
	}

	return args.slice(0, 2).map(sanitizeQueuedValue)
}

function sanitizeConfig(config: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(config)
			.filter(([key, value]) => SAFE_CONFIG_KEYS.has(key) && typeof value === "string")
			.map(([key, value]) => [key, sanitizeText(value)]),
	)
}

/**
 * Creates the small facade used by the application tracking logger.
 * Provider initialization is intentionally controlled by the caller so the first render does
 * not import or evaluate an optional RUM SDK. Only bounded, sanitized errors survive that gap.
 */
export function createDeferredTrackLogger(
	logger: ILogger,
	config: ILoggerConfig,
): DeferredTrackLogger {
	let initialized = false
	let failed = false
	let initializationPromise: Promise<void> | null = null
	let pendingErrors: unknown[][] = []
	let pendingConfig: Record<string, string> = {}

	const initialize = async (): Promise<void> => {
		if (initializationPromise) return initializationPromise

		initializationPromise = (async () => {
			try {
				await logger.init(config)
				initialized = true

				if (Object.keys(pendingConfig).length > 0) {
					logger.setConfig(pendingConfig)
				}

				const errors = pendingErrors
				pendingErrors = []
				for (const args of errors) {
					logger.error(...args)
				}
			} catch {
				// APM is optional. Dropping the bounded queue keeps initialization failures from
				// blocking the application while the self-hosted logger remains independent.
				pendingErrors = []
				pendingConfig = {}
				failed = true
				// Avoid recursively reporting through this same facade or exposing SDK credentials.
				console.warn("[TrackLogger] Optional provider initialization failed")
			}
		})()

		return initializationPromise
	}

	const deferred: DeferredTrackLogger = {
		initialize,
		init: initialize,
		start: () => {
			if (initialized) {
				logger.start()
				return
			}
			void initialize().then(() => {
				if (initialized) logger.start()
			})
		},
		stop: () => {
			if (initialized) logger.stop()
		},
		error: (...args: unknown[]) => {
			if (failed) return
			if (initialized) {
				logger.error(...args)
				return
			}

			if (pendingErrors.length >= MAX_PENDING_ERRORS) pendingErrors.shift()
			pendingErrors.push(sanitizeQueuedErrorArgs(args))
		},
		report: (value: Parameters<ILogger["report"]>[0]) => {
			if (initialized) logger.report(value)
		},
		track: (event: ICustomEvent) => {
			if (initialized) logger.track(event)
		},
		setConfig: (nextConfig: Record<string, string>) => {
			if (failed) return
			const safeConfig = sanitizeConfig(nextConfig)
			pendingConfig = { ...pendingConfig, ...safeConfig }
			if (initialized && Object.keys(safeConfig).length > 0) logger.setConfig(safeConfig)
		},
		setUser: (user: IUserInfo) => {
			if (initialized) logger.setUser(user)
		},
		getProvider: (): IProvider | null => logger.getProvider(),
	}

	return deferred
}
