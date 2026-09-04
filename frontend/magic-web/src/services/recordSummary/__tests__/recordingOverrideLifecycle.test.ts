import { describe, expect, it, vi } from "vitest"
import { runForceOverrideFinalization } from "../recordingOverrideLifecycle"

describe("runForceOverrideFinalization", () => {
	it("uploads and summarizes the old session before completing it", async () => {
		const calls: string[] = []
		let resolveUploads!: () => void

		const finalization = runForceOverrideFinalization({
			stopRecordingServices: vi.fn(async () => {
				calls.push("stop")
			}),
			flushSessionUploads: vi.fn(
				() =>
					new Promise<void>((resolve) => {
						calls.push("flush-start")
						resolveUploads = () => {
							calls.push("flush-complete")
							resolve()
						}
					}),
			),
			summarizeSession: vi.fn(() => {
				calls.push("summarize")
			}),
			completeSession: vi.fn(() => {
				calls.push("complete")
			}),
		})

		await Promise.resolve()
		expect(calls).toEqual(["stop", "flush-start"])

		resolveUploads()
		await finalization

		expect(calls).toEqual(["stop", "flush-start", "flush-complete", "summarize", "complete"])
	})

	it("does not summarize or complete the session when upload draining fails", async () => {
		const summarizeSession = vi.fn()
		const completeSession = vi.fn()

		await expect(
			runForceOverrideFinalization({
				stopRecordingServices: vi.fn(),
				flushSessionUploads: vi.fn().mockRejectedValue(new Error("batch save failed")),
				summarizeSession,
				completeSession,
			}),
		).rejects.toThrow("batch save failed")

		expect(summarizeSession).not.toHaveBeenCalled()
		expect(completeSession).not.toHaveBeenCalled()
	})

	it("does not complete the old session when summary creation fails", async () => {
		const completeSession = vi.fn()

		await expect(
			runForceOverrideFinalization({
				stopRecordingServices: vi.fn(),
				flushSessionUploads: vi.fn(),
				summarizeSession: vi.fn().mockRejectedValue(new Error("summary failed")),
				completeSession,
			}),
		).rejects.toThrow("summary failed")

		expect(completeSession).not.toHaveBeenCalled()
	})
})
