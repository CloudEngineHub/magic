import { beforeEach, describe, expect, it, vi } from "vitest"
import { ALL_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import {
	AUDIO_RECORDINGS_FILTER_SESSION_KEY,
	DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION,
	readAudioRecordingsFilterSession,
	resolveAvailableAudioRecordingGroupId,
	resolveMobileAudioRecordingsSortOption,
	writeAudioRecordingsFilterSession,
} from "../audio-recordings-filter-session"

/** Provides focused coverage for the shared PC/H5 session filter cache contract. */
describe("audio-recordings-filter-session", () => {
	beforeEach(() => {
		sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it("restores a valid filter snapshot from sessionStorage", () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				summaryFilter: "summarized",
				datePreset: "week",
				sortBy: "created_at",
				sortOrder: "desc",
				searchKeyword: "mock keyword",
				groupId: "mock-group-id",
			}),
		)

		expect(readAudioRecordingsFilterSession()).toEqual({
			summaryFilter: "summarized",
			datePreset: "week",
			sortBy: "created_at",
			sortOrder: "desc",
			searchKeyword: "mock keyword",
			groupId: "mock-group-id",
		})
	})

	it("falls back to defaults when the saved payload is invalid", () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				summaryFilter: "unknown",
				datePreset: "invalid",
				sortBy: "name",
				sortOrder: "sideways",
				searchKeyword: 123,
				groupId: null,
			}),
		)

		expect(readAudioRecordingsFilterSession()).toEqual(DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION)
		expect(readAudioRecordingsFilterSession().groupId).toBe(ALL_RECORDING_GROUP_ID)
	})

	it("keeps the list usable when storage APIs throw", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("mock storage read failure")
		})
		vi.spyOn(console, "warn").mockImplementation(() => undefined)

		expect(readAudioRecordingsFilterSession()).toEqual(DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION)
	})

	it("writes normalized snapshots for the current browser session", () => {
		writeAudioRecordingsFilterSession({
			summaryFilter: "not_summarized",
			datePreset: "month",
			sortBy: "updated_at",
			sortOrder: "desc",
			searchKeyword: "mock search",
			groupId: "mock-group-id",
		})

		expect(
			JSON.parse(sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}"),
		).toEqual({
			summaryFilter: "not_summarized",
			datePreset: "month",
			sortBy: "updated_at",
			sortOrder: "desc",
			searchKeyword: "mock search",
			groupId: "mock-group-id",
		})
	})

	it("maps shared sort fields to the mobile sheet sort option", () => {
		expect(
			resolveMobileAudioRecordingsSortOption({
				...DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION,
				sortBy: "created_at",
				sortOrder: "desc",
			}),
		).toBe("created_at_desc")
		expect(
			resolveMobileAudioRecordingsSortOption(DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION),
		).toBe("updated_at_desc")
	})

	it("resolves stale saved group ids back to the all-recordings group", () => {
		const groups = [{ id: "mock-group-id", name: "Mock group", projectCount: 2 }]

		expect(resolveAvailableAudioRecordingGroupId(ALL_RECORDING_GROUP_ID, groups)).toBe(
			ALL_RECORDING_GROUP_ID,
		)
		expect(resolveAvailableAudioRecordingGroupId("", groups)).toBe("")
		expect(resolveAvailableAudioRecordingGroupId("mock-group-id", groups)).toBe("mock-group-id")
		expect(resolveAvailableAudioRecordingGroupId("mock-stale-group-id", groups)).toBe(
			ALL_RECORDING_GROUP_ID,
		)
	})
})
