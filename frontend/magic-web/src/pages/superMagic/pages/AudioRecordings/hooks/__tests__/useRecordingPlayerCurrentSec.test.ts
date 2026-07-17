import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRecordingPlayerCurrentSec } from "../useRecordingPlayerCurrentSec"

function createAudioStub(currentTime = 0) {
	const listeners = new Map<string, EventListener>()
	return {
		currentTime,
		addEventListener: (type: string, listener: EventListener) => {
			listeners.set(type, listener)
		},
		removeEventListener: (type: string) => {
			listeners.delete(type)
		},
		emit: (type: string) => {
			listeners.get(type)?.(new Event(type))
		},
	} as unknown as HTMLAudioElement
}

describe("useRecordingPlayerCurrentSec", () => {
	it("tracks fallback time while paused", () => {
		const audioRef = { current: createAudioStub(12) }
		const { result } = renderHook(() => useRecordingPlayerCurrentSec(audioRef, false, 12))
		expect(result.current).toBe(12)
	})

	it("updates from audio seeked events while paused", () => {
		const audio = createAudioStub(4)
		const audioRef = { current: audio }

		const { result } = renderHook(() => useRecordingPlayerCurrentSec(audioRef, false, 4))
		audio.currentTime = 18
		act(() => {
			;(audio as unknown as { emit: (type: string) => void }).emit("seeked")
		})
		expect(result.current).toBe(18)
	})

	it("schedules requestAnimationFrame while playing", async () => {
		const rafMock = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})

		const audioRef = { current: createAudioStub(7) }
		renderHook(() => useRecordingPlayerCurrentSec(audioRef, true, 0))

		expect(rafMock).toHaveBeenCalled()
		rafMock.mockRestore()
	})

	it("does not restart RAF when fallbackSec changes during playback", () => {
		const cancelMock = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
		const rafMock = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)

		const audioRef = { current: createAudioStub(7) }
		const { rerender } = renderHook(
			({ fallback }) => useRecordingPlayerCurrentSec(audioRef, true, fallback),
			{ initialProps: { fallback: 1 } },
		)

		const rafCallsAfterMount = rafMock.mock.calls.length
		const cancelCallsAfterMount = cancelMock.mock.calls.length

		rerender({ fallback: 5 })
		rerender({ fallback: 10 })

		expect(rafMock.mock.calls.length).toBe(rafCallsAfterMount)
		expect(cancelMock.mock.calls.length).toBe(cancelCallsAfterMount)

		cancelMock.mockRestore()
		rafMock.mockRestore()
	})
})
