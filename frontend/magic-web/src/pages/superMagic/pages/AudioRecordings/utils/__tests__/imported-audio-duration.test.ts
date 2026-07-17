import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAudioDurationMock } = vi.hoisted(() => ({
	getAudioDurationMock: vi.fn(),
}))

vi.mock("@/utils/audio", () => ({
	getAudioDuration: getAudioDurationMock,
}))

describe("resolveImportedAudioDuration", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
	})

	it("floors parsed duration to an integer when the shared audio helper succeeds", async () => {
		getAudioDurationMock.mockResolvedValue(12.5)
		const { resolveImportedAudioDuration } = await import("../imported-audio-duration")

		await expect(
			resolveImportedAudioDuration(new File(["audio"], "demo.wav", { type: "audio/wav" })),
		).resolves.toBe(12)
	})

	it("falls back to 0 when the shared helper returns an invalid duration", async () => {
		getAudioDurationMock.mockResolvedValue(Number.NaN)
		const { resolveImportedAudioDuration } = await import("../imported-audio-duration")

		await expect(
			resolveImportedAudioDuration(new File(["audio"], "invalid.wav", { type: "audio/wav" })),
		).resolves.toBe(0)
	})

	it("falls back to 0 when the shared helper rejects", async () => {
		getAudioDurationMock.mockRejectedValue(new Error("metadata error"))
		const { resolveImportedAudioDuration } = await import("../imported-audio-duration")

		await expect(
			resolveImportedAudioDuration(new File(["audio"], "broken.wav", { type: "audio/wav" })),
		).resolves.toBe(0)
	})

	it("falls back to 0 when metadata loading exceeds the import timeout", async () => {
		getAudioDurationMock.mockImplementation(() => new Promise(() => undefined))
		const { resolveImportedAudioDuration } = await import("../imported-audio-duration")

		const durationPromise = resolveImportedAudioDuration(
			new File(["audio"], "slow.wav", { type: "audio/wav" }),
		)

		await vi.advanceTimersByTimeAsync(3_000)

		await expect(durationPromise).resolves.toBe(0)
	})
})
