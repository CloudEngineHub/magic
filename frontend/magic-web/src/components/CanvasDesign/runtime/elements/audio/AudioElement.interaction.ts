export type AudioControlInteractionMode = "full" | "compact" | "drag-only"

export const AUDIO_CONTROL_INTERACTION = {
	desktop: {
		compactMinWidth: 180,
		compactMinHeight: 96,
		fullMinWidth: 320,
		fullMinHeight: 180,
		compactProgressHitHeight: 16,
	},
	coarsePointer: {
		compactMinWidth: 240,
		compactMinHeight: 144,
		fullMinWidth: 400,
		fullMinHeight: 240,
		compactProgressHitHeight: 24,
	},
} as const

export interface AudioControlInteractionPolicy {
	mode: AudioControlInteractionMode
	progressMinimumScreenHeight: number
}

/** 根据元素最终屏幕尺寸决定内部播放器与元素拖动之间的交互优先级。 */
export function resolveAudioControlInteractionPolicy(options: {
	screenWidth: number
	screenHeight: number
	coarsePointer: boolean
}): AudioControlInteractionPolicy {
	const config = options.coarsePointer
		? AUDIO_CONTROL_INTERACTION.coarsePointer
		: AUDIO_CONTROL_INTERACTION.desktop
	const screenWidth = Math.max(0, options.screenWidth)
	const screenHeight = Math.max(0, options.screenHeight)

	if (screenWidth < config.compactMinWidth || screenHeight < config.compactMinHeight) {
		return {
			mode: "drag-only",
			progressMinimumScreenHeight: config.compactProgressHitHeight,
		}
	}

	if (screenWidth < config.fullMinWidth || screenHeight < config.fullMinHeight) {
		return {
			mode: "compact",
			progressMinimumScreenHeight: config.compactProgressHitHeight,
		}
	}

	return {
		mode: "full",
		progressMinimumScreenHeight: options.coarsePointer ? 44 : 32,
	}
}
