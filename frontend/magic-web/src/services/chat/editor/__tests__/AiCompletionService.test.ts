import { afterEach, describe, expect, it, vi } from "vitest"
import AiCompletionService from "../AiCompletionService"

describe("AiCompletionService.insertSuggestion", () => {
	afterEach(() => {
		AiCompletionService.composition = false
	})

	it("does not consume Tab when there is no valid suggestion", () => {
		const editor = {
			isDestroyed: false,
			commands: {
				focus: vi.fn(),
				insertContent: vi.fn(),
			},
			getAttributes: vi.fn(() => ({ suggestion: "" })),
		} as never

		expect(AiCompletionService.insertSuggestion({ editor })).toBe(false)
		expect(editor.commands.insertContent).not.toHaveBeenCalled()
	})

	it("does not consume Tab during IME composition", () => {
		const editor = {
			isDestroyed: false,
			commands: {
				focus: vi.fn(),
				insertContent: vi.fn(),
			},
			getAttributes: vi.fn(() => ({ suggestion: "旧建议" })),
		} as never
		AiCompletionService.composition = true

		expect(AiCompletionService.insertSuggestion({ editor })).toBe(false)
		expect(editor.commands.insertContent).not.toHaveBeenCalled()
	})
})
