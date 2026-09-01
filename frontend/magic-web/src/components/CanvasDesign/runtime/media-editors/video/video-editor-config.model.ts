import type {
	VideoInputMode,
	VideoInputModeConfig,
	VideoInputModeVariant,
	VideoModelItem,
} from "../../../public/magic-types"

export const VIDEO_INPUT_MODE_ORDER: VideoInputMode[] = [
	"standard",
	"omni_reference",
	"video_edit",
	"keyframe_guided",
	"image_reference",
]

export interface VideoReferenceAssetLike {
	assetType: "image" | "video" | "audio"
}

export interface VideoReferenceAssetLimits {
	reference_images: { min: number; max: number }
	reference_videos: { min: number; max: number }
	reference_audios: { min: number; max: number }
	total: { min: number; max: number }
	variantCode?: string
}

function normalizeFieldRange(raw?: { min?: number; max?: number }) {
	return {
		min: Number.isFinite(raw?.min) ? Math.max(0, Number(raw?.min)) : 0,
		max: Number.isFinite(raw?.max) ? Math.max(0, Number(raw?.max)) : Infinity,
	}
}

function countAssets(assets: VideoReferenceAssetLike[]) {
	return assets.reduce(
		(acc, item) => {
			if (item.assetType === "image") acc.images += 1
			if (item.assetType === "video") acc.videos += 1
			if (item.assetType === "audio") acc.audios += 1
			return acc
		},
		{ images: 0, videos: 0, audios: 0 },
	)
}

export function getAvailableInputModes(model: VideoModelItem | undefined): VideoInputMode[] {
	if (!model) return ["standard"]
	const inputModes = model.video_generation_config?.input_modes
	if (!inputModes || Object.keys(inputModes).length === 0) return ["standard"]
	const modes = VIDEO_INPUT_MODE_ORDER.filter((mode) => Boolean(inputModes[mode]))
	return modes.length > 0 ? modes : ["standard"]
}

export function getInputModeConfig(
	model: VideoModelItem | undefined,
	inputMode: VideoInputMode,
): VideoInputModeConfig | undefined {
	if (!model) return undefined
	const config = model.video_generation_config?.input_modes?.[inputMode]
	if (config) return config
	if (inputMode === "standard") return { supported_fields: [] }
	return undefined
}

function getEffectiveFrameRoles(modeConfig: VideoInputModeConfig | undefined) {
	const raw = modeConfig?.frame_roles
	return raw && raw.length > 0 ? raw : (["start", "end"] as const)
}

export function resolveVideoFrameRoleSupport(modeConfig: VideoInputModeConfig | undefined) {
	const supportsFramesField = Boolean(modeConfig?.supported_fields?.includes("frames"))
	const roles = getEffectiveFrameRoles(modeConfig)
	return {
		supportsStartFrame: supportsFramesField && roles.includes("start"),
		supportsEndFrame: supportsFramesField && roles.includes("end"),
	}
}

function resolveBestVariant(
	variants: VideoInputModeVariant[] | undefined,
	counts: { images: number; videos: number; audios: number },
) {
	if (!variants?.length) return undefined
	let best: VideoInputModeVariant | undefined
	let bestPenalty = Infinity
	let bestSupportedKinds = -1
	for (const variant of variants) {
		const fields = [
			["reference_images", counts.images],
			["reference_videos", counts.videos],
			["reference_audios", counts.audios],
		] as const
		let penalty = 0
		let supportedKinds = 0
		for (const [field, count] of fields) {
			const range = normalizeFieldRange(variant.limits?.[field])
			if (count > 0 && range.max > 0) supportedKinds += 1
			if (count > range.max) penalty += count - range.max
			if (count < range.min) penalty += range.min - count
		}
		if (
			penalty < bestPenalty ||
			(penalty === bestPenalty && supportedKinds > bestSupportedKinds)
		) {
			best = variant
			bestPenalty = penalty
			bestSupportedKinds = supportedKinds
		}
	}
	return best
}

export function resolveReferenceAssetLimits(
	modeConfig: VideoInputModeConfig | undefined,
	assets: VideoReferenceAssetLike[] = [],
): VideoReferenceAssetLimits {
	const counts = countAssets(assets)
	const defaultImages = modeConfig?.supported_fields?.includes("reference_images")
		? normalizeFieldRange({ max: modeConfig.reference_images?.max_count })
		: normalizeFieldRange({ max: 0 })
	const defaultVideos = modeConfig?.supported_fields?.includes("reference_videos")
		? normalizeFieldRange({ max: modeConfig.max_count })
		: normalizeFieldRange({ max: 0 })
	const defaultAudios = modeConfig?.supported_fields?.includes("reference_audios")
		? normalizeFieldRange({ max: modeConfig.max_count })
		: normalizeFieldRange({ max: 0 })
	const variants = assets.length > 0 ? modeConfig?.variants : undefined
	const selected = resolveBestVariant(variants, counts)
	const range = (
		field: "reference_images" | "reference_videos" | "reference_audios",
		fallback: { min: number; max: number },
	) => (selected?.limits?.[field] ? normalizeFieldRange(selected.limits[field]) : fallback)
	const images = range("reference_images", defaultImages)
	const videos = range("reference_videos", defaultVideos)
	const audios = range("reference_audios", defaultAudios)
	const finiteMax = [images.max, videos.max, audios.max].filter(Number.isFinite) as number[]
	const hasUnboundedTypeMax = [images.max, videos.max, audios.max].some(
		(value) => !Number.isFinite(value),
	)
	const fallbackTotalMax = hasUnboundedTypeMax ? Infinity : finiteMax.reduce((a, b) => a + b, 0)
	const totalMax = modeConfig?.variants?.length
		? assets.length > 0
			? fallbackTotalMax
			: (modeConfig.max_count ?? fallbackTotalMax)
		: (modeConfig?.max_count ?? fallbackTotalMax)
	return {
		reference_images: images,
		reference_videos: videos,
		reference_audios: audios,
		total: normalizeFieldRange({ max: totalMax }),
		variantCode: assets.length > 0 ? selected?.code : undefined,
	}
}
