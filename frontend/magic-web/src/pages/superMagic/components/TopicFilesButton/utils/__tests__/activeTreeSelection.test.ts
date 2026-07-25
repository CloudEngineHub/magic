import { describe, expect, it } from "vitest"
import { buildAttachmentIndex } from "../attachmentIndex"
import { resolveActiveTreeSelectionKey } from "../activeTreeSelection"
import type { AttachmentItem } from "../../hooks/types"

const attachments: AttachmentItem[] = [
	{
		file_id: "root-folder",
		name: "Root folder",
		is_directory: true,
		children: [
			{
				file_id: "nested-folder",
				name: "Nested folder",
				is_directory: true,
				children: [{ file_id: "active-file", file_name: "active.md" }],
			},
		],
	},
]

describe("resolveActiveTreeSelectionKey", () => {
	const treeIndex = buildAttachmentIndex(attachments)

	it("selects the active file when all of its parent folders are expanded", () => {
		expect(
			resolveActiveTreeSelectionKey(
				"active-file",
				treeIndex,
				new Set(["root-folder", "nested-folder"]),
			),
		).toBe("active-file")
	})

	it("selects the visible root folder when no parent folder is expanded", () => {
		expect(resolveActiveTreeSelectionKey("active-file", treeIndex, new Set())).toBe(
			"root-folder",
		)
	})

	it("selects the nearest visible folder for a partially expanded path", () => {
		expect(
			resolveActiveTreeSelectionKey("active-file", treeIndex, new Set(["root-folder"])),
		).toBe("nested-folder")
	})

	it("does not select a node when the active file is absent from the tree", () => {
		expect(resolveActiveTreeSelectionKey("missing-file", treeIndex, new Set())).toBeNull()
	})
})
