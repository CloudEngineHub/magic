import { describe, expect, it } from "vitest"
import { isGenerationTaskNotFoundError } from "../polling/generationPollingUtils"

describe("isGenerationTaskNotFoundError", () => {
	it("matches only the invalid-argument response that names the current task", () => {
		expect(
			isGenerationTaskNotFoundError(
				{ code: 14000, message: "video-task-1 未找到" },
				"video-task-1",
			),
		).toBe(true)
	})

	it("does not self-heal a different task or a different business error", () => {
		expect(
			isGenerationTaskNotFoundError(
				{ code: 14000, message: "video-task-2 未找到" },
				"video-task-1",
			),
		).toBe(false)
		expect(
			isGenerationTaskNotFoundError(
				{ code: 14001, message: "video-task-1 提交失败" },
				"video-task-1",
			),
		).toBe(false)
	})
})
