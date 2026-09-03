import { describe, expect, it } from "vitest"
import {
	PPT_COMPOSER_MIN_INPUT_HEIGHT,
	DEFAULT_COMPOSER_MIN_INPUT_HEIGHT,
	SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT,
	resolveComposerMinInputHeight,
} from "@/pages/superMagic/components/ConversationInputResize/constants"

describe("TopicMessagePanel input minimum height", () => {
	it("uses the PPT-specific floor before other specialized composer rules", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: true,
				isSelfMediaMode: true,
				isRecordSummaryMode: true,
			}),
		).toBe(PPT_COMPOSER_MIN_INPUT_HEIGHT)
	})

	it("uses the standard floor for ordinary conversations and scene presets", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isSelfMediaMode: false,
				isRecordSummaryMode: false,
			}),
		).toBe(DEFAULT_COMPOSER_MIN_INPUT_HEIGHT)
	})

	it("keeps the existing specialized floor for self-media and recording modes", () => {
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isSelfMediaMode: true,
				isRecordSummaryMode: false,
			}),
		).toBe(SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT)
		expect(
			resolveComposerMinInputHeight({
				isPptMode: false,
				isSelfMediaMode: false,
				isRecordSummaryMode: true,
			}),
		).toBe(SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT)
	})
})
