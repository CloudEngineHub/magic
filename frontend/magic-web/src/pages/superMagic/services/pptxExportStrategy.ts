import type { LargeExportOutputPolicy, MediaPolicy } from "@magic/html2pptx"

/** Emergency/local override key. Remote configuration can populate the same shape on window. */
export const PPTX_EXPORT_FLAGS_STORAGE_KEY = "magic:pptx-export-flags"

/**
 * Routing switches kept outside the renderer so a rollout can be stopped without changing the
 * export call sites. These are routing controls, not cumulative file-size limits.
 */
export interface PptxExportFeatureFlags {
	/** Enables the File System Access/streaming sink route. */
	streamingOutputSink: boolean
	/** Indicates that the active package writer is the zip.js writer. */
	zipJsPackageWriter: boolean
	/** Allows archives that may cross ZIP32 boundaries. */
	zip64: boolean
	/** Emergency route to the legacy memory API for safe small exports only. */
	forceLegacy: boolean
	/** Whether a small export may use the old Blob/memory route when streaming is unavailable. */
	legacyFallback: boolean
}

export const DEFAULT_PPTX_EXPORT_FEATURE_FLAGS: Readonly<PptxExportFeatureFlags> = {
	streamingOutputSink: true,
	zipJsPackageWriter: true,
	zip64: true,
	forceLegacy: false,
	legacyFallback: true,
}

/** Thresholds only choose a safe execution path; they never reject a large cumulative export. */
export const PPTX_EXPORT_ROUTING_LIMITS = {
	legacyMaxPages: 200,
	legacyMaxEstimatedBytes: 500 * 1024 * 1024,
	legacyMaxMediaBytes: 100 * 1024 * 1024,
	zip32MaxBytes: 4 * 1024 * 1024 * 1024,
} as const

export type PptxMediaSourceReliability = "local" | "stable-url" | "signed-url" | "unknown"

export type PptxExportRoute = "streaming" | "legacy" | "unavailable"
export type PptxExportStrategyReasonCode =
	| "streaming"
	| "legacy-small-export"
	| "forced-legacy"
	| "streaming-disabled"
	| "zipjs-disabled"
	| "zip64-disabled"
	| "file-stream-unavailable"
	| "legacy-not-safe"
	| "memory-output-requested"

export type ResolvedPptxMediaPolicyMode = Exclude<NonNullable<MediaPolicy["mode"]>, "auto">

export interface PptxExportStrategyInput {
	pageCount?: number
	estimatedBytes?: number | bigint
	largestMediaBytes?: number | bigint
	hasLargeMedia?: boolean
	/** Used to decide whether the current URL must be staged before a second pass. */
	mediaSource?: PptxMediaSourceReliability
	requestedMediaPolicy?: MediaPolicy["mode"]
	requiresReplay?: boolean
	outputPolicy?: LargeExportOutputPolicy
	fileStreamingAvailable?: boolean
	flags?: Partial<PptxExportFeatureFlags>
}

export interface PptxExportStrategyDecision {
	route: PptxExportRoute
	reasonCode: PptxExportStrategyReasonCode
	reason: string
	isLargeExport: boolean
	requiresZip64: boolean
	mediaPolicyMode: ResolvedPptxMediaPolicyMode
	fileStreamingAvailable: boolean
	featureFlags: PptxExportFeatureFlags
	legacyFallbackAllowed: boolean
}

/**
 * Resolve a media policy before the runner starts reading pages.
 *
 * `auto` is deliberately conservative for replayed/expiring sources: it selects rolling-stage.
 * A stable local source can remain direct-streamed and therefore does not consume OPFS space.
 */
export function resolvePptxMediaPolicyMode(
	options: {
		requested?: MediaPolicy["mode"]
		mediaSource?: PptxMediaSourceReliability
		requiresReplay?: boolean
	} = {},
): ResolvedPptxMediaPolicyMode {
	if (options.requested && options.requested !== "auto") return options.requested
	if (options.requiresReplay || options.mediaSource === "signed-url") return "rolling-stage"
	if (options.mediaSource === "unknown") return "rolling-stage"
	return "direct-stream"
}

/** Read defaults plus safe runtime/local overrides without throwing in SSR or private mode. */
export function resolvePptxExportFeatureFlags(
	overrides?: Partial<PptxExportFeatureFlags>,
): PptxExportFeatureFlags {
	const runtime = readRuntimeFeatureFlags()
	const stored = readStoredFeatureFlags()
	return {
		...DEFAULT_PPTX_EXPORT_FEATURE_FLAGS,
		...stored,
		...runtime,
		...overrides,
	}
}

/**
 * Decide whether an export may use the new streaming path.
 *
 * Large/unknown-risk exports never silently fall back to a Blob. They return `unavailable`, which
 * lets the caller show a capability message before opening a picker or doing expensive work.
 */
export function resolvePptxExportStrategy(
	input: PptxExportStrategyInput = {},
): PptxExportStrategyDecision {
	const featureFlags = resolvePptxExportFeatureFlags(input.flags)
	const fileStreamingAvailable = input.fileStreamingAvailable ?? detectFileStreamingCapability()
	const estimatedBytes = toFiniteNumber(input.estimatedBytes)
	const largestMediaBytes = toFiniteNumber(input.largestMediaBytes)
	const isLargeExport =
		(input.pageCount !== undefined &&
			input.pageCount > PPTX_EXPORT_ROUTING_LIMITS.legacyMaxPages) ||
		(estimatedBytes !== undefined &&
			estimatedBytes > PPTX_EXPORT_ROUTING_LIMITS.legacyMaxEstimatedBytes) ||
		(largestMediaBytes !== undefined &&
			largestMediaBytes > PPTX_EXPORT_ROUTING_LIMITS.legacyMaxMediaBytes) ||
		input.hasLargeMedia === true
	const requiresZip64 =
		(estimatedBytes !== undefined &&
			estimatedBytes >= PPTX_EXPORT_ROUTING_LIMITS.zip32MaxBytes) ||
		(largestMediaBytes !== undefined &&
			largestMediaBytes >= PPTX_EXPORT_ROUTING_LIMITS.zip32MaxBytes) ||
		isLargeExport
	const mediaPolicyMode = resolvePptxMediaPolicyMode({
		requested: input.requestedMediaPolicy,
		mediaSource: input.mediaSource,
		requiresReplay: input.requiresReplay ?? isLargeExport,
	})
	const legacyFallbackAllowed = featureFlags.legacyFallback && !isLargeExport && !requiresZip64

	if (featureFlags.forceLegacy) {
		if (legacyFallbackAllowed) {
			return createDecision({
				route: "legacy",
				reasonCode: "forced-legacy",
				reason: "Legacy PPTX export was forced by the active feature flag.",
				isLargeExport,
				requiresZip64,
				mediaPolicyMode,
				fileStreamingAvailable,
				featureFlags,
				legacyFallbackAllowed,
			})
		}
		return createDecision({
			route: "unavailable",
			reasonCode: "legacy-not-safe",
			reason: "The legacy in-memory PPTX path is not safe for this export size.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		})
	}

	if (input.outputPolicy === "memory" && isLargeExport) {
		return createDecision({
			route: "unavailable",
			reasonCode: "memory-output-requested",
			reason: "Large PPTX exports require a caller-owned streaming destination.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		})
	}

	if (!isLargeExport) {
		if (
			featureFlags.streamingOutputSink &&
			fileStreamingAvailable &&
			featureFlags.zipJsPackageWriter
		) {
			return createDecision({
				route: "streaming",
				reasonCode: "streaming",
				reason: "The browser and active feature flags support streaming PPTX output.",
				isLargeExport,
				requiresZip64,
				mediaPolicyMode,
				fileStreamingAvailable,
				featureFlags,
				legacyFallbackAllowed,
			})
		}
		if (featureFlags.legacyFallback) {
			return createDecision({
				route: "legacy",
				reasonCode: featureFlags.streamingOutputSink
					? "file-stream-unavailable"
					: "streaming-disabled",
				reason: "A safe small export may use the legacy in-memory path.",
				isLargeExport,
				requiresZip64,
				mediaPolicyMode,
				fileStreamingAvailable,
				featureFlags,
				legacyFallbackAllowed,
			})
		}
	}

	if (!featureFlags.streamingOutputSink) {
		return unavailableDecision(
			"streaming-disabled",
			"Streaming PPTX output is disabled by the active feature flag.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		)
	}
	if (!featureFlags.zipJsPackageWriter) {
		return unavailableDecision(
			"zipjs-disabled",
			"The streaming package writer is disabled by the active feature flag.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		)
	}
	if (requiresZip64 && !featureFlags.zip64) {
		return unavailableDecision(
			"zip64-disabled",
			"ZIP64 is disabled, so this export cannot safely use the large-file path.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		)
	}
	if (!fileStreamingAvailable) {
		return unavailableDecision(
			"file-stream-unavailable",
			"This browser cannot provide a writable file destination for a large PPTX.",
			isLargeExport,
			requiresZip64,
			mediaPolicyMode,
			fileStreamingAvailable,
			featureFlags,
			legacyFallbackAllowed,
		)
	}

	return createDecision({
		route: "streaming",
		reasonCode: "streaming",
		reason: "The large PPTX export is routed to the streaming sink.",
		isLargeExport,
		requiresZip64,
		mediaPolicyMode,
		fileStreamingAvailable,
		featureFlags,
		legacyFallbackAllowed,
	})
}

function unavailableDecision(
	reasonCode: Exclude<
		PptxExportStrategyReasonCode,
		| "streaming"
		| "legacy-small-export"
		| "forced-legacy"
		| "legacy-not-safe"
		| "memory-output-requested"
	>,
	reason: string,
	isLargeExport: boolean,
	requiresZip64: boolean,
	mediaPolicyMode: ResolvedPptxMediaPolicyMode,
	fileStreamingAvailable: boolean,
	featureFlags: PptxExportFeatureFlags,
	legacyFallbackAllowed: boolean,
): PptxExportStrategyDecision {
	return createDecision({
		route: "unavailable",
		reasonCode,
		reason,
		isLargeExport,
		requiresZip64,
		mediaPolicyMode,
		fileStreamingAvailable,
		featureFlags,
		legacyFallbackAllowed,
	})
}

function createDecision(
	decision: Omit<PptxExportStrategyDecision, "featureFlags"> & {
		featureFlags: PptxExportFeatureFlags
	},
): PptxExportStrategyDecision {
	return decision
}

function toFiniteNumber(value?: number | bigint): number | undefined {
	if (typeof value === "bigint") {
		const numberValue = Number(value)
		return Number.isFinite(numberValue) ? numberValue : undefined
	}
	return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

function detectFileStreamingCapability(): boolean {
	return typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function"
}

function readRuntimeFeatureFlags(): Partial<PptxExportFeatureFlags> {
	const value = (globalThis as { __MAGIC_PPTX_EXPORT_FLAGS__?: unknown })
		.__MAGIC_PPTX_EXPORT_FLAGS__
	return sanitizeFlags(value)
}

function readStoredFeatureFlags(): Partial<PptxExportFeatureFlags> {
	try {
		if (typeof localStorage === "undefined") return {}
		return sanitizeFlags(
			JSON.parse(localStorage.getItem(PPTX_EXPORT_FLAGS_STORAGE_KEY) || "null"),
		)
	} catch {
		return {}
	}
}

function sanitizeFlags(value: unknown): Partial<PptxExportFeatureFlags> {
	if (!value || typeof value !== "object") return {}
	const source = value as Record<string, unknown>
	const flags: Partial<PptxExportFeatureFlags> = {}
	for (const key of [
		"streamingOutputSink",
		"zipJsPackageWriter",
		"zip64",
		"forceLegacy",
		"legacyFallback",
	] as const) {
		if (typeof source[key] === "boolean") flags[key] = source[key]
	}
	return flags
}
