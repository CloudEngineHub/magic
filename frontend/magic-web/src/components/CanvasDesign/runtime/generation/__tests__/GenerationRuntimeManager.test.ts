import { describe, expect, it, vi } from "vitest"
import { GenerationRuntimeManager } from "../GenerationRuntimeManager"
import { EventEmitter } from "../../core/EventEmitter"

describe("GenerationRuntimeManager", () => {
	it("keeps runtime state outside element data and notifies only the target", () => {
		const manager = new GenerationRuntimeManager()
		const targetListener = vi.fn()
		const otherListener = vi.fn()
		manager.subscribeElement("image-1", targetListener)
		manager.subscribeElement("image-2", otherListener)

		const attemptId = manager.beginAttempt({
			attemptId: "attempt-1",
			operation: "image-generate",
			failurePolicy: "restore-existing",
			targets: [
				{
					elementId: "image-1",
					generateImageRequest: { image_id: "request-1", model_id: "model" },
				},
			],
		})

		expect(attemptId).toBe("attempt-1")
		expect(manager.getTargetState("image-1")).toMatchObject({
			attemptId: "attempt-1",
			operation: "image-generate",
			phase: "submitting",
			generateImageRequest: { image_id: "request-1" },
		})
		expect(targetListener).toHaveBeenCalledTimes(1)
		expect(otherListener).not.toHaveBeenCalled()

		manager.completeAttempt(attemptId)
		expect(manager.getTargetState("image-1")).toBeNull()
		expect(targetListener).toHaveBeenCalledTimes(2)
	})

	it("supersedes an older attempt for the same element", () => {
		const manager = new GenerationRuntimeManager()
		manager.beginAttempt({
			attemptId: "older",
			operation: "video-generate",
			failurePolicy: "restore-existing",
			targets: [{ elementId: "video-1" }],
		})

		manager.beginAttempt({
			attemptId: "newer",
			operation: "video-generate",
			failurePolicy: "restore-existing",
			targets: [{ elementId: "video-1" }],
		})

		expect(manager.isCurrent("older", "video-1")).toBe(false)
		expect(manager.isCurrent("older")).toBe(false)
		expect(manager.isCurrent("newer", "video-1")).toBe(true)
		expect(manager.completeAttempt("older")).toBeNull()
		expect(manager.getTargetState("video-1")?.attemptId).toBe("newer")
	})

	it("updates a batch phase and clears all remaining current targets atomically", () => {
		const manager = new GenerationRuntimeManager()
		const firstListener = vi.fn()
		const secondListener = vi.fn()
		manager.subscribeElement("image-1", firstListener)
		manager.subscribeElement("image-2", secondListener)
		manager.beginAttempt({
			attemptId: "batch",
			operation: "image-batch",
			phase: "preparing",
			failurePolicy: "remove-placeholder",
			targets: [
				{ elementId: "image-1", outputIndex: 1 },
				{ elementId: "image-2", outputIndex: 2 },
			],
		})

		expect(manager.updateAttemptPhase("batch", "submitting")).toBe(true)
		expect(manager.getTargetState("image-1")?.phase).toBe("submitting")
		expect(manager.getTargetState("image-2")?.phase).toBe("submitting")

		manager.failAttempt("batch")
		expect(manager.getTargetState("image-1")).toBeNull()
		expect(manager.getTargetState("image-2")).toBeNull()
		expect(firstListener).toHaveBeenCalledTimes(3)
		expect(secondListener).toHaveBeenCalledTimes(3)
	})

	it("removes only the deleted target from a shared attempt", () => {
		const manager = new GenerationRuntimeManager()
		manager.beginAttempt({
			attemptId: "batch",
			operation: "image-batch",
			failurePolicy: "remove-placeholder",
			targets: [{ elementId: "image-1" }, { elementId: "image-2" }],
		})

		manager.clearElement("image-1")

		expect(manager.getTargetState("image-1")).toBeNull()
		expect(manager.isCurrent("batch", "image-2")).toBe(true)
		expect(manager.getAttempt("batch")?.targets).toEqual([{ elementId: "image-2" }])
	})

	it("cleans the target when the element is deleted as runtime-only", () => {
		const eventEmitter = new EventEmitter()
		const manager = new GenerationRuntimeManager({
			canvas: { eventEmitter } as never,
		})
		manager.beginAttempt({
			attemptId: "runtime-only-delete",
			operation: "image-generate",
			failurePolicy: "promote-empty",
			targets: [{ elementId: "image-1" }],
		})

		eventEmitter.emit({
			type: "element:deleted",
			data: { elementId: "image-1", persistence: "runtime-only" },
		})

		expect(manager.getTargetState("image-1")).toBeNull()
		expect(manager.getAttempt("runtime-only-delete")).toBeNull()
	})
})
