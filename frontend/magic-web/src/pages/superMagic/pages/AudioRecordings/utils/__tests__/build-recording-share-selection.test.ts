import { describe, expect, it, vi } from "vitest"
import type { RecordingDetailFileMap } from "../../types/recording-detail"
import {
	buildRecordingShareSelection,
	collectRecordingRequiredShareFileIds,
	mergeRecordingShareFileIds,
} from "../build-recording-share-selection"

vi.hoisted(() => {
	const storageMock = {
		getItem: () => null,
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(),
		length: 0,
	}

	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const mockFileMap: RecordingDetailFileMap = {
	audio: { file_id: "file-audio", file_name: "session.wav" },
	transcript: { file_id: "file-transcript", file_name: "session-transcript.md" },
	notes: { file_id: "file-notes", file_name: "session-notes.md" },
	magicProject: { file_id: "file-magic-project", file_name: "magic.project.js" },
	summaryFiles: [
		{
			type: "summary",
			fileName: "summary.md",
			file: { file_id: "file-summary", file_name: "summary.md" },
		},
		{
			type: "topics",
			fileName: "topics.md",
			file: { file_id: "file-topics", file_name: "topics.md" },
		},
	],
}

describe("buildRecordingShareSelection", () => {
	it("returns empty selection when fileMap is null", () => {
		expect(buildRecordingShareSelection(null)).toEqual({
			shareableFiles: [],
			groupedItems: [],
			defaultSelectedFileIds: [],
		})
	})

	it("includes audio, transcript, notes, and summary files but excludes magic.project.js", () => {
		const selection = buildRecordingShareSelection(mockFileMap)

		expect(selection.defaultSelectedFileIds).toEqual([
			"file-audio",
			"file-transcript",
			"file-notes",
			"file-summary",
			"file-topics",
		])
		expect(selection.shareableFiles.map((file) => file.file_id)).toEqual(
			selection.defaultSelectedFileIds,
		)
		expect(selection.groupedItems.map((item) => item.fileId)).toEqual(
			selection.defaultSelectedFileIds,
		)
		expect(selection.groupedItems.some((item) => item.fileId === "file-magic-project")).toBe(
			false,
		)
	})

	it("preserves summary type metadata for grouped summary children", () => {
		const selection = buildRecordingShareSelection(mockFileMap)
		const summaryItems = selection.groupedItems.filter((item) => item.groupKey === "summary")

		expect(summaryItems).toEqual([
			expect.objectContaining({ summaryType: "summary", fileId: "file-summary" }),
			expect.objectContaining({ summaryType: "topics", fileId: "file-topics" }),
		])
	})

	it("handles partial file maps with only available detail tabs", () => {
		const partialMap: RecordingDetailFileMap = {
			audio: { file_id: "file-audio-only", file_name: "session.wav" },
			summaryFiles: [],
		}

		const selection = buildRecordingShareSelection(partialMap)

		expect(selection.defaultSelectedFileIds).toEqual(["file-audio-only"])
		expect(selection.groupedItems).toHaveLength(1)
		expect(selection.groupedItems[0]?.groupKey).toBe("audio")
	})

	it("collects only magic.project.js as the hidden required file without forcing audio into the final share payload", () => {
		expect(collectRecordingRequiredShareFileIds(mockFileMap)).toEqual(["file-magic-project"])
	})

	it("merges user selection with required recording share file ids without duplicates", () => {
		expect(
			mergeRecordingShareFileIds(["file-transcript", "file-audio"], ["file-magic-project"]),
		).toEqual(["file-transcript", "file-audio", "file-magic-project"])
	})
})
