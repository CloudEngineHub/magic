import { describe, expect, it } from "vitest"
import {
	PPT_COMPOSER_MIN_INPUT_HEIGHT,
	SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT,
	VIDEO_PRODUCTION_COMPOSER_MIN_INPUT_HEIGHT,
	resolveComposerMinInputHeight,
} from "@/pages/superMagic/components/ConversationInputResize/constants"

describe("TopicMessagePanel input minimum height", () => {
	it("uses the PPT-specific floor before other specialized composer rules", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: true,
				isVideoProductionMode: true,
				isSpecializedMode: true,
			}),
		).toBe(PPT_COMPOSER_MIN_INPUT_HEIGHT)
	})

	it("uses the standard floor for ordinary conversations and scene presets", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isVideoProductionMode: false,
				isSpecializedMode: false,
			}),
		).toBeUndefined()
	})

	it("keeps the existing floor for composers with specialized controls", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isVideoProductionMode: false,
				isSpecializedMode: true,
			}),
		).toBe(SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT)
	})

	it("uses the video production floor before other specialized composer rules", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isVideoProductionMode: true,
				isSpecializedMode: true,
			}),
		).toBe(VIDEO_PRODUCTION_COMPOSER_MIN_INPUT_HEIGHT)
	})
})
