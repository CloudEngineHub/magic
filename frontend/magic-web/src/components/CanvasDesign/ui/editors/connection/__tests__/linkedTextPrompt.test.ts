import { describe, expect, it } from "vitest"
import {
	composePromptSegments,
	composePromptWithLinkedText,
	getLinkedTextPromptText,
	type LinkedTextConnection,
} from "../linkedTextPrompt"

describe("linkedTextPrompt", () => {
	it("composes linked text before editable prompt", () => {
		expect(composePromptWithLinkedText("linked prompt", "editable prompt")).toBe(
			"linked prompt\neditable prompt",
		)
	})

	it("keeps internal list markers and line breaks", () => {
		expect(composePromptWithLinkedText("• first\n• second\n\n1. third", "editable")).toBe(
			"• first\n• second\n\n1. third\neditable",
		)
	})

	it("does not require editable prompt when linked text exists", () => {
		expect(composePromptWithLinkedText("linked prompt", "")).toBe("linked prompt")
	})

	it("does not require linked text when editable prompt exists", () => {
		expect(composePromptWithLinkedText("", "editable prompt")).toBe("editable prompt")
	})

	it("joins multiple upstream text connections in order", () => {
		const connections: LinkedTextConnection[] = [
			{ connectionId: "a", sourceElementId: "source-a", text: "first" },
			{ connectionId: "b", sourceElementId: "source-b", text: "second\nline" },
		]

		expect(getLinkedTextPromptText(connections)).toBe("first\nsecond\nline")
	})

	it("skips empty segments without compressing non-empty segment content", () => {
		expect(composePromptSegments(["", "before\n\nafter", "   "])).toBe("before\n\nafter")
	})
})
