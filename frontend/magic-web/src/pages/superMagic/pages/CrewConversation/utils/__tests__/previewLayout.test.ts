import { describe, expect, it } from "vitest"
import { resolvePreviewConversationTransition } from "../previewLayout"

describe("resolvePreviewConversationTransition", () => {
	it("collapses the conversation when a switchable preview session starts", () => {
		expect(resolvePreviewConversationTransition("switchable", "file", false)).toEqual({
			isSessionActive: true,
			action: "collapse",
			shouldCloseHistoryPanel: true,
		})
	})

	it("keeps the user-selected layout while switching preview tabs", () => {
		expect(resolvePreviewConversationTransition("switchable", "playback", true)).toEqual({
			isSessionActive: true,
			action: null,
			shouldCloseHistoryPanel: false,
		})
	})

	it.each(["website", "knowledge_base"] as const)(
		"keeps the preview session active for %s tabs",
		(tabType) => {
			expect(resolvePreviewConversationTransition("switchable", tabType, true)).toEqual({
				isSessionActive: true,
				action: null,
				shouldCloseHistoryPanel: false,
			})
		},
	)

	it("expands the conversation when the preview session ends", () => {
		expect(resolvePreviewConversationTransition("switchable", null, true)).toEqual({
			isSessionActive: false,
			action: "expand",
			shouldCloseHistoryPanel: false,
		})
	})

	it.each(["split", "fullscreen"] as const)(
		"keeps the conversation expanded when a %s preview session starts",
		(mode) => {
			expect(resolvePreviewConversationTransition(mode, "file", false)).toEqual({
				isSessionActive: true,
				action: "expand",
				shouldCloseHistoryPanel: false,
			})
		},
	)
})
