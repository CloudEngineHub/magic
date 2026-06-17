import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRecordingAudioPlayer } from "../useRecordingAudioPlayer"

describe("useRecordingAudioPlayer", () => {
	it("initializes with default states", () => {
		const { result } = renderHook(() => useRecordingAudioPlayer("test.mp3"))

		expect(result.current.currentTime).toBe(0)
		expect(result.current.duration).toBe(0)
		expect(result.current.playing).toBe(false)
		expect(result.current.progress).toBe(0)
		expect(result.current.playbackRate).toBe(1.0)
	})

	it("allows changing playbackRate and updates audioRef", () => {
		const { result } = renderHook(() => useRecordingAudioPlayer("test.mp3"))
		const mockAudio = {
			playbackRate: 1.0,
			play: vi.fn(),
			pause: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as HTMLAudioElement

		result.current.audioRef.current = mockAudio

		act(() => {
			result.current.setPlaybackRate(1.5)
		})

		expect(result.current.playbackRate).toBe(1.5)
		expect(mockAudio.playbackRate).toBe(1.5)
	})
})
