import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { buildMobileAttachmentTreeIndex, searchMobileAttachmentTree } from "../attachmentTree"

const fictionalTree: AttachmentItem[] = [
	{
		file_id: "fictional-folder-a",
		name: "Fictional Folder",
		is_directory: true,
		children: [
			{
				file_id: "fictional-file-a",
				name: "Fictional Document.md",
				file_extension: "md",
				is_directory: false,
			},
		],
	},
]

const legacyIdTree = [
	{
		id: "fictional-legacy-folder",
		name: "Legacy Folder",
		is_directory: true,
		children: [
			{
				id: "fictional-legacy-file",
				name: "Legacy Document.txt",
				is_directory: false,
			},
		],
	},
] as AttachmentItem[]

describe("mobile attachment tree utilities", () => {
	it("indexes parent relationships and complete paths in one snapshot", () => {
		const index = buildMobileAttachmentTreeIndex(fictionalTree)

		expect(index.getParentItemById("fictional-file-a")?.file_id).toBe("fictional-folder-a")
		expect(index.getParentItemsById("fictional-file-a").map((item) => item.file_id)).toEqual([
			"fictional-folder-a",
		])
	})

	it("returns matching items with their parent path label", () => {
		const index = buildMobileAttachmentTreeIndex(fictionalTree)
		const results = searchMobileAttachmentTree(index, "document", () => true)

		expect(results).toHaveLength(1)
		expect(results[0].item.file_id).toBe("fictional-file-a")
		expect(results[0].pathLabel).toBe("Fictional Folder")
	})

	it("uses legacy ids consistently for lookup and search paths", () => {
		const index = buildMobileAttachmentTreeIndex(legacyIdTree)
		const results = searchMobileAttachmentTree(index, "legacy document", () => true)

		expect(index.getItemById("fictional-legacy-file")).toBeDefined()
		expect(results[0].pathLabel).toBe("Legacy Folder")
	})
})
