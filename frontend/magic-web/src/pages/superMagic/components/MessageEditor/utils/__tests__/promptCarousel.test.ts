import { describe, expect, it, vi } from "vitest"
import {
	resolvePromptCarouselState,
	tryAcceptPromptCarouselShortcut,
	tryNavigatePromptCarouselShortcut,
} from "../promptCarousel"

function createKeyboardEvent(overrides: Partial<KeyboardEvent> = {}) {
	return {
		key: "Tab",
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		isComposing: false,
		...overrides,
	} as KeyboardEvent
}

describe("tryAcceptPromptCarouselShortcut", () => {
	it("accepts a ready prompt with an unmodified Tab key", () => {
		const onAccept = vi.fn(() => true)

		expect(tryAcceptPromptCarouselShortcut(createKeyboardEvent(), onAccept)).toBe(true)
		expect(onAccept).toHaveBeenCalledOnce()
	})

	it("does not consume Tab when the prompt is not ready", () => {
		const onAccept = vi.fn(() => false)

		expect(tryAcceptPromptCarouselShortcut(createKeyboardEvent(), onAccept)).toBe(false)
		expect(onAccept).toHaveBeenCalledOnce()
	})

	it("preserves modified Tab shortcuts", () => {
		const onAccept = vi.fn(() => true)

		expect(
			tryAcceptPromptCarouselShortcut(createKeyboardEvent({ shiftKey: true }), onAccept),
		).toBe(false)
		expect(onAccept).not.toHaveBeenCalled()
	})

	it("does not consume Tab during IME composition", () => {
		const onAccept = vi.fn(() => true)

		expect(
			tryAcceptPromptCarouselShortcut(createKeyboardEvent({ isComposing: true }), onAccept),
		).toBe(false)
		expect(onAccept).not.toHaveBeenCalled()
	})
})

describe("tryNavigatePromptCarouselShortcut", () => {
	it("maps ArrowUp and ArrowDown to prompt navigation", () => {
		const onNavigate = vi.fn(() => true)

		expect(
			tryNavigatePromptCarouselShortcut(createKeyboardEvent({ key: "ArrowUp" }), onNavigate),
		).toBe(true)
		expect(
			tryNavigatePromptCarouselShortcut(
				createKeyboardEvent({ key: "ArrowDown" }),
				onNavigate,
			),
		).toBe(true)
		expect(onNavigate).toHaveBeenNthCalledWith(1, "previous")
		expect(onNavigate).toHaveBeenNthCalledWith(2, "next")
	})

	it("preserves modified arrow shortcuts", () => {
		const onNavigate = vi.fn(() => true)

		expect(
			tryNavigatePromptCarouselShortcut(
				createKeyboardEvent({ key: "ArrowDown", metaKey: true }),
				onNavigate,
			),
		).toBe(false)
		expect(onNavigate).not.toHaveBeenCalled()
	})

	it("does not navigate during IME composition", () => {
		const onNavigate = vi.fn(() => true)

		expect(
			tryNavigatePromptCarouselShortcut(
				createKeyboardEvent({ key: "ArrowDown", isComposing: true }),
				onNavigate,
			),
		).toBe(false)
		expect(onNavigate).not.toHaveBeenCalled()
	})
})

describe("resolvePromptCarouselState", () => {
	it("uses prompt examples only while the configured editor is empty", () => {
		expect(
			resolvePromptCarouselState({
				promptCarouselConfigured: true,
				hasEditorContent: false,
				hasFiles: false,
				isComposing: false,
				aiCompletionEnabled: true,
			}),
		).toEqual({ promptCarouselEnabled: true, aiCompletionEnabled: false })
	})

	it("switches to AI completion after text or mentions are present", () => {
		expect(
			resolvePromptCarouselState({
				promptCarouselConfigured: true,
				hasEditorContent: true,
				hasFiles: false,
				isComposing: false,
				aiCompletionEnabled: true,
			}),
		).toEqual({ promptCarouselEnabled: false, aiCompletionEnabled: true })
	})

	it("shows neither prompt examples nor AI completion for attachment-only input", () => {
		expect(
			resolvePromptCarouselState({
				promptCarouselConfigured: true,
				hasEditorContent: false,
				hasFiles: true,
				isComposing: false,
				aiCompletionEnabled: true,
			}),
		).toEqual({ promptCarouselEnabled: false, aiCompletionEnabled: false })
	})

	it("keeps the previous mode during IME composition", () => {
		expect(
			resolvePromptCarouselState({
				promptCarouselConfigured: true,
				hasEditorContent: true,
				hasFiles: false,
				isComposing: true,
				aiCompletionEnabled: true,
				previousState: {
					promptCarouselEnabled: true,
					aiCompletionEnabled: false,
				},
			}),
		).toEqual({ promptCarouselEnabled: true, aiCompletionEnabled: false })
	})
})
