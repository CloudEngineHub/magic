export const HTML_SANDBOX_TELEMETRY_MESSAGE = "MAGIC_HTML_SANDBOX_TELEMETRY"
export const HTML_SANDBOX_TELEMETRY_SCHEMA_VERSION = 1
export type HtmlSandboxTelemetrySeverity = "info" | "warn" | "error"

export interface HtmlSandboxTelemetrySource {
	layer: "top" | "nested"
	depth: number
	fileId?: string
	path?: string
	requesterFileId?: string
	chainFileIds?: string[]
}

export interface HtmlSandboxTelemetryPage {
	href: string
	referrer: string
	readyState: DocumentReadyState
}

export type HtmlSandboxTelemetryEvent =
	| {
			type: "runtime_error"
			errorType:
				| "error"
				| "unhandledrejection"
				| "runtimeInlineInstall"
				| "runtimeRestart"
				| "runtimeLoad"
			message: string
			stack?: string
			source?: string
			lineno?: number
			colno?: number
			detail?: string
			runtimeUrl?: string
	  }
	| {
			type: "resource_load_failed"
			tagName: string
			url: string
			resourceType:
				| "script"
				| "stylesheet"
				| "image"
				| "font"
				| "media"
				| "iframe"
				| "unknown"
	  }

export interface HtmlSandboxTelemetryPayload {
	schemaVersion: typeof HTML_SANDBOX_TELEMETRY_SCHEMA_VERSION
	eventId: string
	severity: HtmlSandboxTelemetrySeverity
	event: HtmlSandboxTelemetryEvent
	source: HtmlSandboxTelemetrySource
	page: HtmlSandboxTelemetryPage
	timestamp: number
	dedupeKey?: string
	dedupeCount?: number
}

export interface HtmlSandboxTelemetryMessage {
	type: typeof HTML_SANDBOX_TELEMETRY_MESSAGE
	payload: HtmlSandboxTelemetryPayload
}

const MAX_TEXT_LENGTH = {
	message: 500,
	stack: 2000,
	url: 1000,
	source: 1000,
	detail: 1000,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object")
}

function isString(value: unknown): value is string {
	return typeof value === "string"
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string"
}

function isOptionalNumber(value: unknown): value is number | undefined {
	return value === undefined || typeof value === "number"
}

function truncateText(value: unknown, maxLength: number): string {
	const text = value == null ? "" : String(value)
	if (text.length <= maxLength) return text
	return `${text.slice(0, maxLength)}...[truncated]`
}

export function sanitizeHtmlSandboxTelemetryText(
	value: unknown,
	maxLength: number = MAX_TEXT_LENGTH.url,
): string {
	const text = truncateText(value, maxLength)
	if (!text) return ""

	try {
		const url = new URL(text, "http://sandbox.invalid")
		const sensitiveParams = ["token", "access_token", "signature", "x-oss-signature", "Expires"]
		sensitiveParams.forEach((key) => {
			if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]")
		})

		const serialized = url.toString()
		return text.startsWith("http") ? serialized : serialized.replace("http://sandbox.invalid", "")
	} catch {
		return text.replace(
			/([?&](?:token|access_token|signature|x-oss-signature|Expires)=)[^&#\s]+/gi,
			"$1[redacted]",
		)
	}
}

function isTelemetrySource(value: unknown): value is HtmlSandboxTelemetrySource {
	if (!isRecord(value)) return false
	const layer = value.layer
	const depth = value.depth
	return (
		(layer === "top" || layer === "nested") &&
		typeof depth === "number" &&
		Number.isFinite(depth) &&
		depth >= 0 &&
		isOptionalString(value.fileId) &&
		isOptionalString(value.path) &&
		isOptionalString(value.requesterFileId) &&
		(value.chainFileIds === undefined ||
			(Array.isArray(value.chainFileIds) && value.chainFileIds.every(isString)))
	)
}

function isTelemetryPage(value: unknown): value is HtmlSandboxTelemetryPage {
	if (!isRecord(value)) return false
	return (
		typeof value.href === "string" &&
		typeof value.referrer === "string" &&
		["loading", "interactive", "complete"].includes(String(value.readyState))
	)
}

function isRuntimeErrorEvent(
	value: Record<string, unknown>,
): value is Extract<HtmlSandboxTelemetryEvent, { type: "runtime_error" }> {
	return (
		value.type === "runtime_error" &&
		[
			"error",
			"unhandledrejection",
			"runtimeInlineInstall",
			"runtimeRestart",
			"runtimeLoad",
		].includes(String(value.errorType)) &&
		typeof value.message === "string" &&
		isOptionalString(value.stack) &&
		isOptionalString(value.source) &&
		isOptionalNumber(value.lineno) &&
		isOptionalNumber(value.colno) &&
		isOptionalString(value.detail) &&
		isOptionalString(value.runtimeUrl)
	)
}

function isResourceLoadFailedEvent(
	value: Record<string, unknown>,
): value is Extract<HtmlSandboxTelemetryEvent, { type: "resource_load_failed" }> {
	return (
		value.type === "resource_load_failed" &&
		typeof value.tagName === "string" &&
		typeof value.url === "string" &&
		["script", "stylesheet", "image", "font", "media", "iframe", "unknown"].includes(
			String(value.resourceType),
		)
	)
}

function isTelemetryEvent(value: unknown): value is HtmlSandboxTelemetryEvent {
	if (!isRecord(value)) return false
	return isRuntimeErrorEvent(value) || isResourceLoadFailedEvent(value)
}

export function isHtmlSandboxTelemetryMessage(
	value: unknown,
): value is HtmlSandboxTelemetryMessage {
	if (!isRecord(value)) return false

	if (value.type !== HTML_SANDBOX_TELEMETRY_MESSAGE) return false
	if (!isRecord(value.payload)) return false

	const payload = value.payload

	return (
		payload.schemaVersion === HTML_SANDBOX_TELEMETRY_SCHEMA_VERSION &&
		typeof payload.eventId === "string" &&
		["info", "warn", "error"].includes(String(payload.severity)) &&
		isTelemetryEvent(payload.event) &&
		isTelemetrySource(payload.source) &&
		isTelemetryPage(payload.page) &&
		typeof payload.timestamp === "number" &&
		isOptionalString(payload.dedupeKey) &&
		isOptionalNumber(payload.dedupeCount)
	)
}

export function normalizeHtmlSandboxTelemetryMessage(
	value: unknown,
): HtmlSandboxTelemetryMessage | null {
	if (!isHtmlSandboxTelemetryMessage(value)) return null

	const payload = value.payload
	const event =
		payload.event.type === "runtime_error"
			? {
					...payload.event,
					message: sanitizeHtmlSandboxTelemetryText(
						payload.event.message,
						MAX_TEXT_LENGTH.message,
					),
					stack: sanitizeHtmlSandboxTelemetryText(
						payload.event.stack,
						MAX_TEXT_LENGTH.stack,
					),
					source: sanitizeHtmlSandboxTelemetryText(
						payload.event.source,
						MAX_TEXT_LENGTH.source,
					),
					detail: sanitizeHtmlSandboxTelemetryText(
						payload.event.detail,
						MAX_TEXT_LENGTH.detail,
					),
					runtimeUrl: sanitizeHtmlSandboxTelemetryText(
						payload.event.runtimeUrl,
						MAX_TEXT_LENGTH.url,
					),
				}
			: {
					...payload.event,
					url: sanitizeHtmlSandboxTelemetryText(payload.event.url, MAX_TEXT_LENGTH.url),
				}

	return {
		type: value.type,
		payload: {
			...payload,
			event,
			page: {
				...payload.page,
				href: sanitizeHtmlSandboxTelemetryText(payload.page.href, MAX_TEXT_LENGTH.url),
				referrer: sanitizeHtmlSandboxTelemetryText(
					payload.page.referrer,
					MAX_TEXT_LENGTH.url,
				),
			},
		},
	}
}
