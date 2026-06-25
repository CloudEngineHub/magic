import { describe, expect, it } from "vitest"

import { extractChatTopicIdFromExecuteResult } from "../parseScheduledTaskExecuteResponse"

describe("extractChatTopicIdFromExecuteResult", () => {
	it("returns chat topic id from execute response", () => {
		expect(
			extractChatTopicIdFromExecuteResult({
				success: true,
				result: {
					type: "seq",
					seq: {
						message: {
							topic_id: "917107484254834690",
						},
					},
				},
			}),
		).toBe("917107484254834690")
	})

	it("returns null when topic id is missing", () => {
		expect(extractChatTopicIdFromExecuteResult({ success: true, result: {} })).toBeNull()
		expect(extractChatTopicIdFromExecuteResult(null)).toBeNull()
	})
})
