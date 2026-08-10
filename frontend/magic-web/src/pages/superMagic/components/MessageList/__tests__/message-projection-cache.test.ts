import { describe, expect, it } from "vitest"
import {
	MessageProjectionCache,
	messagesConverter,
} from "@/pages/superMagic/components/MessageList/helpers"

function message(id: string, content = id, correlationId = `correlation-${id}`) {
	return {
		app_message_id: id,
		super_message_id: `super-${id}`,
		correlation_id: correlationId,
		role: "assistant",
		type: "super_magic_message",
		content,
	}
}

describe("MessageProjectionCache", () => {
	it("reuses the complete projection for an unchanged Topic membership revision", () => {
		const cache = new MessageProjectionCache()
		const source = [message("a"), message("b")]
		const first = messagesConverter(source, false, cache, 1)
		const second = messagesConverter(source, false, cache, 1)

		expect(second).toBe(first)
	})

	it("converts only a disjoint prepended page and reuses existing projected rows", () => {
		const cache = new MessageProjectionCache()
		const current = [message("a"), message("b")]
		const first = messagesConverter(current, false, cache, 1)
		const next = messagesConverter([message("old"), ...current], false, cache, 2)

		expect(next.map((item) => item.app_message_id)).toEqual(["old", "a", "b"])
		expect(next[1]).toBe(first[0])
		expect(next[2]).toBe(first[1])
	})

	it("falls back to full dedupe when an appended item overlaps an existing correlation", () => {
		const cache = new MessageProjectionCache()
		const current = [message("old", "old", "shared")]
		messagesConverter(current, false, cache, 1)

		const source = [...current, message("new", "new", "shared")]
		const cached = messagesConverter(source, false, cache, 2)
		const uncached = messagesConverter(source, false)

		expect(cached).toEqual(uncached)
	})
})
