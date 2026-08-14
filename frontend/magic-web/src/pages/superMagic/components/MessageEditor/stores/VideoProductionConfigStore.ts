import { makeAutoObservable } from "mobx"
import type {
	VideoGenerationConstraints,
	VideoModelItem,
} from "@/components/CanvasDesign/public/magic-types"
import {
	buildVideoAspectRatioOptions,
	buildVideoDurationOptions,
	buildVideoResolutionOptions,
} from "@/components/CanvasDesign/ui/editors/video/generation/video-editor-config.generation"
import type { ModelItem } from "../components/ModelSwitch/types"

export type VideoProductionGenerationMode = "normal" | "detailed"

export interface VideoProductionConfig {
	generationMode: VideoProductionGenerationMode
	skillId?: string
	aspectRatio?: string
	durationSeconds?: number
	resolution?: string
}

export interface VideoProductionSendSnapshot {
	modelId: string
	config: Readonly<VideoProductionConfig>
}

export interface VideoProductionDurationCapabilities {
	type: "options" | "range"
	options: number[]
	min?: number
	max?: number
	step?: number
}

export interface VideoProductionCapabilities {
	aspectRatioOptions: ReturnType<typeof buildVideoAspectRatioOptions>
	resolutionOptions: ReturnType<typeof buildVideoResolutionOptions>
	duration: VideoProductionDurationCapabilities
	defaults: VideoProductionConfig
	showAspectRatio: boolean
	showDuration: boolean
	showResolution: boolean
	skillOptions: []
}

export interface ResolveVideoProductionCapabilitiesParams {
	model?: ModelItem | null
	inputMode: "standard"
	constraints?: VideoGenerationConstraints
	selectedResolution?: string
}

const STORAGE_PREFIX = "super_magic/video-production-config/v1"
const EMPTY_CONFIG: VideoProductionConfig = { generationMode: "normal" }

function asCanvasVideoModel(model?: ModelItem | null): VideoModelItem | undefined {
	return model ? (model as VideoModelItem) : undefined
}

function resolveInputModeConstraints(
	model: ModelItem | null | undefined,
	inputMode: "standard",
	constraints?: VideoGenerationConstraints,
): VideoGenerationConstraints | undefined {
	const modeConstraints =
		model?.video_generation_config?.input_modes?.[inputMode]?.generation_constraints
	if (!modeConstraints && !constraints) return undefined
	return {
		resolutions: constraints?.resolutions ?? modeConstraints?.resolutions,
		aspect_ratios: constraints?.aspect_ratios ?? modeConstraints?.aspect_ratios,
		durations: constraints?.durations ?? modeConstraints?.durations,
		sizes: constraints?.sizes ?? modeConstraints?.sizes,
	}
}

function getDurationCapabilities(
	model: ModelItem | null | undefined,
	constraints?: VideoGenerationConstraints,
) {
	if (constraints?.durations !== undefined) {
		return {
			type: "options" as const,
			options: buildVideoDurationOptions(asCanvasVideoModel(model), constraints),
		}
	}
	const generation = model?.video_generation_config?.generation
	const rawDurations = generation?.durations
	if (generation?.duration_type === "range" || (!Array.isArray(rawDurations) && rawDurations)) {
		const range = Array.isArray(rawDurations)
			? rawDurations.length > 0
				? {
						min: Math.min(...rawDurations),
						max: Math.max(...rawDurations),
						step: 1,
					}
				: undefined
			: rawDurations
		return {
			type: "range" as const,
			options: [],
			min: range?.min,
			max: range?.max,
			step: range?.step ?? 1,
		}
	}
	return {
		type: "options" as const,
		options: buildVideoDurationOptions(asCanvasVideoModel(model), constraints),
	}
}

export function resolveVideoProductionCapabilities({
	model,
	inputMode,
	constraints,
	selectedResolution,
}: ResolveVideoProductionCapabilitiesParams): VideoProductionCapabilities {
	void inputMode
	const canvasModel = asCanvasVideoModel(model)
	const effectiveConstraints = resolveInputModeConstraints(model, inputMode, constraints)
	const hasGenerationConfig = Boolean(model?.video_generation_config?.generation)
	const resolutionOptions = hasGenerationConfig
		? buildVideoResolutionOptions(canvasModel, effectiveConstraints)
		: []
	const defaults: VideoProductionConfig = { ...EMPTY_CONFIG }
	const defaultResolution = model?.video_generation_config?.generation?.default_resolution
	const resolution = resolutionOptions.some((option) => option.value === defaultResolution)
		? defaultResolution
		: resolutionOptions[0]?.value
	const aspectOptions = hasGenerationConfig
		? buildVideoAspectRatioOptions(
				canvasModel,
				selectedResolution ?? resolution,
				effectiveConstraints,
			)
		: []
	const aspectRatio = aspectOptions[0]?.value
	const duration = hasGenerationConfig
		? getDurationCapabilities(model, effectiveConstraints)
		: { type: "options" as const, options: [] }
	if (aspectRatio) defaults.aspectRatio = aspectRatio
	if (resolution) defaults.resolution = resolution
	const defaultDuration = model?.video_generation_config?.generation?.default_duration_seconds
	if (duration.type === "options") {
		defaults.durationSeconds = duration.options.includes(defaultDuration ?? NaN)
			? defaultDuration
			: duration.options[0]
	} else if (
		typeof defaultDuration === "number" &&
		defaultDuration >= (duration.min ?? -Infinity) &&
		defaultDuration <= (duration.max ?? Infinity)
	) {
		defaults.durationSeconds = defaultDuration
	} else if (duration.min != null) {
		defaults.durationSeconds = duration.min
	}
	return {
		aspectRatioOptions: aspectOptions,
		resolutionOptions,
		duration,
		defaults,
		showAspectRatio: aspectOptions.length > 0,
		showDuration:
			duration.type === "range"
				? duration.min != null && duration.max != null
				: duration.options.length > 0,
		showResolution: resolutionOptions.length > 0,
		skillOptions: [],
	}
}

function getStorageKey(userId: string, agentCode: string, modelId: string) {
	return `${STORAGE_PREFIX}/${encodeURIComponent(userId || "anonymous")}/${encodeURIComponent(agentCode || "video-production")}/${encodeURIComponent(modelId)}`
}

function readCachedConfig(key: string): Partial<VideoProductionConfig> | undefined {
	if (typeof localStorage === "undefined") return undefined
	try {
		const value = JSON.parse(localStorage.getItem(key) || "null")
		return value && typeof value === "object" ? value : undefined
	} catch {
		return undefined
	}
}

function writeCachedConfig(key: string, config: VideoProductionConfig) {
	if (typeof localStorage === "undefined") return
	try {
		localStorage.setItem(key, JSON.stringify(config))
	} catch {
		// Storage can be unavailable in private browsing; UI state remains usable.
	}
}

function mergeValidConfig(
	cached: Partial<VideoProductionConfig> | undefined,
	capabilities: VideoProductionCapabilities,
): VideoProductionConfig {
	const next: VideoProductionConfig = {
		generationMode: cached?.generationMode === "detailed" ? "detailed" : "normal",
	}
	if (typeof cached?.skillId === "string" && cached.skillId) next.skillId = cached.skillId
	if (capabilities.showAspectRatio) {
		next.aspectRatio = capabilities.aspectRatioOptions.some(
			(item) => item.value === cached?.aspectRatio,
		)
			? cached?.aspectRatio
			: capabilities.defaults.aspectRatio
	}
	if (capabilities.showResolution) {
		next.resolution = capabilities.resolutionOptions.some(
			(item) => item.value === cached?.resolution,
		)
			? cached?.resolution
			: capabilities.defaults.resolution
	}
	if (capabilities.showDuration) {
		const duration = cached?.durationSeconds
		if (capabilities.duration.type === "options") {
			next.durationSeconds = capabilities.duration.options.includes(duration ?? NaN)
				? duration
				: capabilities.defaults.durationSeconds
		} else {
			const min = capabilities.duration.min ?? -Infinity
			const max = capabilities.duration.max ?? Infinity
			const step = capabilities.duration.step ?? 1
			const isStepAligned =
				typeof duration === "number" &&
				Number.isFinite(step) &&
				Math.abs((duration - min) / step - Math.round((duration - min) / step)) < 1e-9
			next.durationSeconds =
				isStepAligned && duration >= min && duration <= max
					? duration
					: capabilities.defaults.durationSeconds
		}
	}
	return next
}

export class VideoProductionConfigStore {
	config: VideoProductionConfig = { ...EMPTY_CONFIG }
	capabilities: VideoProductionCapabilities = resolveVideoProductionCapabilities({
		inputMode: "standard",
	})
	currentModelId = ""
	private contextKey = ""
	private userId = "anonymous"
	private agentCode = "video-production"
	private model?: ModelItem | null
	private modelSignature = ""
	private active = false

	constructor() {
		makeAutoObservable(this, { contextKey: false }, { autoBind: true })
	}

	setContext({
		userId,
		agentCode,
		model,
	}: {
		userId?: string | null
		agentCode?: string | null
		model?: ModelItem | null
	}) {
		const nextModelId = model?.model_id || ""
		const nextUserId = userId || "anonymous"
		const nextAgentCode = agentCode || "video-production"
		const nextContextKey = `${nextUserId}/${nextAgentCode}/${nextModelId}`
		const nextModelSignature = JSON.stringify(model?.video_generation_config ?? null)
		const modelChanged = this.modelSignature !== nextModelSignature
		if (nextContextKey === this.contextKey && !modelChanged && this.active) return
		this.active = true
		this.contextKey = nextContextKey
		this.userId = nextUserId
		this.agentCode = nextAgentCode
		this.model = model
		this.modelSignature = nextModelSignature
		this.currentModelId = nextModelId
		this.capabilities = resolveVideoProductionCapabilities({ model, inputMode: "standard" })
		const cached = nextModelId
			? readCachedConfig(getStorageKey(nextUserId, nextAgentCode, nextModelId))
			: undefined
		const cachedResolutionIsValid = this.capabilities.resolutionOptions.some(
			(option) => option.value === cached?.resolution,
		)
		if (
			cachedResolutionIsValid &&
			cached?.resolution !== this.capabilities.defaults.resolution
		) {
			this.capabilities = resolveVideoProductionCapabilities({
				model,
				inputMode: "standard",
				selectedResolution: cached.resolution,
			})
		}
		this.config = mergeValidConfig(cached, this.capabilities)
		if (nextModelId)
			writeCachedConfig(getStorageKey(nextUserId, nextAgentCode, nextModelId), this.config)
	}

	deactivate() {
		this.active = false
	}

	setConfig(patch: Partial<VideoProductionConfig>) {
		const candidate = { ...this.config, ...patch }
		const nextCapabilities = resolveVideoProductionCapabilities({
			model: this.model,
			inputMode: "standard",
			selectedResolution: candidate.resolution,
		})
		this.capabilities = nextCapabilities
		this.config = mergeValidConfig(candidate, nextCapabilities)
		if (this.contextKey && this.currentModelId) {
			writeCachedConfig(
				getStorageKey(this.userId, this.agentCode, this.currentModelId),
				this.config,
			)
		}
	}

	clearCurrentConfig() {
		this.config = { ...this.capabilities.defaults }
	}

	createSendSnapshot(model?: ModelItem | null): VideoProductionSendSnapshot | undefined {
		const modelId = model?.model_id || this.currentModelId
		if (!this.active || !modelId) return undefined
		return Object.freeze({
			modelId,
			config: Object.freeze({ ...this.config }),
		})
	}
}
