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
	generationMode?: VideoProductionGenerationMode
	skillId?: string
	aspectRatio?: string
	durationSeconds?: number
	resolution?: string
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

const EMPTY_CONFIG: VideoProductionConfig = {}

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
	if (generation?.duration_type === "range" && rawDurations && !Array.isArray(rawDurations)) {
		return {
			type: "range" as const,
			options: [],
			min: rawDurations.min,
			max: rawDurations.max,
			step: rawDurations.step ?? 1,
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
	const defaults: VideoProductionConfig = { generationMode: "normal" }
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

function mergeValidConfig(
	current: Partial<VideoProductionConfig> | undefined,
	capabilities: VideoProductionCapabilities,
	fillMissingWithDefaults: boolean,
): VideoProductionConfig {
	const next: VideoProductionConfig = {}
	if (current?.generationMode === "normal" || current?.generationMode === "detailed") {
		next.generationMode = current.generationMode
	} else if (fillMissingWithDefaults) {
		next.generationMode = capabilities.defaults.generationMode
	}
	if (typeof current?.skillId === "string" && current.skillId) next.skillId = current.skillId
	if (capabilities.showAspectRatio) {
		if (current?.aspectRatio !== undefined || fillMissingWithDefaults) {
			next.aspectRatio = capabilities.aspectRatioOptions.some(
				(item) => item.value === current?.aspectRatio,
			)
				? current?.aspectRatio
				: capabilities.defaults.aspectRatio
		}
	}
	if (capabilities.showResolution) {
		if (current?.resolution !== undefined || fillMissingWithDefaults) {
			next.resolution = capabilities.resolutionOptions.some(
				(item) => item.value === current?.resolution,
			)
				? current?.resolution
				: capabilities.defaults.resolution
		}
	}
	if (
		capabilities.showDuration &&
		(current?.durationSeconds !== undefined || fillMissingWithDefaults)
	) {
		const duration = current?.durationSeconds
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
	private model?: ModelItem | null
	private modelSignature = ""
	private inputScopeKey: string | undefined
	private defaultsActive = false
	private active = false

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	setContext({
		model,
		inputScopeKey = "",
		initializeWithDefaults = true,
	}: {
		model?: ModelItem | null
		inputScopeKey?: string
		initializeWithDefaults?: boolean
	}) {
		const nextModelId = model?.model_id || ""
		const nextModelSignature = JSON.stringify(model?.video_generation_config ?? null)
		const modelChanged = this.modelSignature !== nextModelSignature
		const scopeChanged = this.inputScopeKey !== inputScopeKey
		const shouldDisableDefaults = this.defaultsActive && !initializeWithDefaults
		if (
			nextModelId === this.currentModelId &&
			!modelChanged &&
			!scopeChanged &&
			!shouldDisableDefaults &&
			this.active
		) {
			return
		}
		this.active = true
		this.model = model
		this.modelSignature = nextModelSignature
		this.currentModelId = nextModelId
		this.inputScopeKey = inputScopeKey
		this.capabilities = resolveVideoProductionCapabilities({ model, inputMode: "standard" })
		if (scopeChanged) {
			this.defaultsActive = initializeWithDefaults
			this.config = mergeValidConfig(undefined, this.capabilities, this.defaultsActive)
		} else if (shouldDisableDefaults) {
			this.defaultsActive = false
			this.config = { ...EMPTY_CONFIG }
		} else if (modelChanged) {
			this.config = mergeValidConfig(
				this.defaultsActive ? undefined : this.config,
				this.capabilities,
				this.defaultsActive,
			)
		}
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
		this.config = mergeValidConfig(candidate, nextCapabilities, false)
	}

	clearCurrentConfig() {
		this.defaultsActive = false
		this.config = { ...EMPTY_CONFIG }
	}
}
