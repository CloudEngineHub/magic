import { describe, expect, it } from "vitest"
import { createTaskEndError, RecordingErrorManager } from "../RecordingErrorManager"

describe("RecordingErrorManager", () => {
	it("recognizes task-end errors when the backend serializes the code", () => {
		const error = Object.assign(new Error("task already completed"), {
			code: "43200",
			sessionId: "session-1",
		})

		expect(new RecordingErrorManager().isTaskEndError(error)).toBe(true)
	})

	it("does not classify malformed codes as task-end errors", () => {
		const error = Object.assign(new Error("invalid code"), { code: "43200x" })

		expect(new RecordingErrorManager().isTaskEndError(error)).toBe(false)
	})

	it("normalizes serialized task-end codes when creating errors", () => {
		expect(createTaskEndError("session-1", "43200").code).toBe(43200)
	})
})
