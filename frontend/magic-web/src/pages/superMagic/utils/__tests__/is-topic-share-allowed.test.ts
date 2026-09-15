import { describe, expect, it } from "vitest"
import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"
import { isTopicShareAllowed } from "../is-topic-share-allowed"

describe("isTopicShareAllowed", () => {
	it("returns false when messages are missing or empty", () => {
		expect(isTopicShareAllowed(null)).toBe(false)
		expect(isTopicShareAllowed(undefined)).toBe(false)
		expect(isTopicShareAllowed([])).toBe(false)
	})

	it("returns true when the topic has shareable messages", () => {
		expect(isTopicShareAllowed([{ status: "finished" }])).toBe(true)
	})

	it("returns false when only REVOKED messages exist", () => {
		expect(isTopicShareAllowed([{ status: MessageStatus.REVOKED }])).toBe(false)
	})

	it("uses Canonical imStatus for share visibility", () => {
		expect(isTopicShareAllowed([{ status: "read", imStatus: MessageStatus.REVOKED }])).toBe(
			false,
		)
	})

	it.each([
		{
			label: "历史撤回后已有普通消息",
			messages: [{ status: MessageStatus.REVOKED }, { status: "finished" }],
		},
		{
			label: "普通消息后存在当前撤回段",
			messages: [
				{ status: "finished" },
				{ status: MessageStatus.REVOKED },
				{ status: MessageStatus.REVOKED },
			],
		},
		{
			label: "历史撤回和当前撤回段同时存在",
			messages: [
				{ status: MessageStatus.REVOKED },
				{ status: "finished" },
				{ status: MessageStatus.REVOKED },
			],
		},
	])("returns true when $label leaves a shareable visible branch", ({ messages }) => {
		expect(isTopicShareAllowed(messages)).toBe(true)
	})
})
