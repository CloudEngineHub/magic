import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { resolveAudioCopyRootFileIds } from "../resolve-audio-copy-files"

function attachment(overrides: Partial<AttachmentItem>): AttachmentItem {
	return {
		file_id: "mock-file-id",
		file_name: "mock-file",
		name: "mock-file",
		is_directory: false,
		is_hidden: false,
		children: [],
		...overrides,
	} as AttachmentItem
}

describe("resolveAudioCopyRootFileIds", () => {
	it("returns only visible root-level file and folder ids", () => {
		const result = resolveAudioCopyRootFileIds([
			attachment({
				file_id: "mock-root-file-id",
				file_name: "root-audio.mp3",
			}),
			attachment({
				file_id: "mock-root-folder-id",
				file_name: "mock-folder",
				is_directory: true,
				children: [
					attachment({
						file_id: "mock-child-file-id",
						file_name: "child-note.md",
					}),
				],
			}),
			attachment({
				file_id: "mock-hidden-root-id",
				file_name: "hidden-config.json",
				is_hidden: true,
			}),
		])

		expect(result).toEqual(["mock-root-file-id", "mock-root-folder-id"])
	})

	it("ignores empty ids and never recursively expands child files", () => {
		const result = resolveAudioCopyRootFileIds([
			attachment({
				file_id: "",
				file_name: "missing-id.md",
			}),
			attachment({
				file_id: "mock-folder-id",
				file_name: "mock-folder",
				is_directory: true,
				children: [
					attachment({
						file_id: "mock-nested-file-id",
						file_name: "nested.md",
					}),
				],
			}),
		])

		expect(result).toEqual(["mock-folder-id"])
	})
})
