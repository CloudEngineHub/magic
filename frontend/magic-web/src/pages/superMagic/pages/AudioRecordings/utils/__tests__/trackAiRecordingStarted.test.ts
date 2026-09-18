import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	createAiRecordingStartedReporter,
	resolveRecordingAnalyticsSource,
} from "../trackAiRecordingStarted"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@/services/analytics", () => ({ track }))

describe("resolveRecordingAnalyticsSource", () => {
	it("maps desktop web to pc and mobile web to h5", () => {
		expect(resolveRecordingAnalyticsSource(false)).toBe("pc")
		expect(resolveRecordingAnalyticsSource(true)).toBe("h5")
	})
})

describe("createAiRecordingStartedReporter", () => {
	beforeEach(() => {
		track.mockReset()
	})

	it("tracks a successful recorded start exactly once per project", () => {
		const report = createAiRecordingStartedReporter(() => "pc")

		report({
			projectId: "project-audio-001",
			audioSource: "recorded",
			transcriptionEnabled: true,
		})
		report({
			projectId: "project-audio-001",
			audioSource: "recorded",
			transcriptionEnabled: true,
		})

		expect(track).toHaveBeenCalledTimes(1)
		expect(track).toHaveBeenCalledWith("ai_recording_started", {
			project_id: "project-audio-001",
			source: "pc",
			audio_source: "recorded",
			transcription_enabled: true,
		})
	})

	it("tracks imported starts with the h5 source and real transcription flag", () => {
		const report = createAiRecordingStartedReporter(() => "h5")

		report({
			projectId: "project-import",
			audioSource: "imported",
			transcriptionEnabled: false,
		})

		expect(track).toHaveBeenCalledWith("ai_recording_started", {
			project_id: "project-import",
			source: "h5",
			audio_source: "imported",
			transcription_enabled: false,
		})
	})

	it("does not track blank project ids", () => {
		const report = createAiRecordingStartedReporter(() => "pc")

		report({
			projectId: "   ",
			audioSource: "recorded",
			transcriptionEnabled: true,
		})

		expect(track).not.toHaveBeenCalled()
	})

	it("still records a second project after the first start", () => {
		const report = createAiRecordingStartedReporter(() => "pc")

		report({
			projectId: "project-a",
			audioSource: "recorded",
			transcriptionEnabled: true,
		})
		report({
			projectId: "project-b",
			audioSource: "imported",
			transcriptionEnabled: false,
		})

		expect(track).toHaveBeenCalledTimes(2)
	})
})
