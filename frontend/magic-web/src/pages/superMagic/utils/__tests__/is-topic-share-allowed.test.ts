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

	it("returns true when shareable messages exist before the REVOKED marker", () => {
		expect(
			isTopicShareAllowed([
				{ status: "finished" },
				{ status: MessageStatus.REVOKED },
				{ status: "finished" },
			]),
		).toBe(true)
	})

	it("returns false when all shareable messages appear only after the REVOKED marker", () => {
		expect(
			isTopicShareAllowed([
				{ status: MessageStatus.REVOKED },
				{ status: "finished" },
			]),
		).toBe(false)
	})
})
