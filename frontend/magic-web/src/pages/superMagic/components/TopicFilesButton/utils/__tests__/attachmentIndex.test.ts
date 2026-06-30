import { describe, expect, it } from "vitest"
import {
	buildAttachmentIndex,
	collectAttachmentIndexStructureStats,
	getAttachmentByLookupKey,
	getAttachmentPathByLookupKey,
	getParentItemByLookupKey,
	getPathKeysByLookupKey,
	isDescendantByParentMap,
} from "../attachmentIndex"
import type { AttachmentItem } from "../../hooks/types"

function createItem(
	key: string,
	name: string,
	children?: AttachmentItem[],
	fileId = key,
): AttachmentItem {
	return {
		file_id: fileId,
		name,
		is_directory: Boolean(children?.length),
		children,
	}
}

describe("buildAttachmentIndex", () => {
	it("indexes attachments by key and file id", () => {
		const child = createItem("child-key", "Child", undefined, "child-file-id")
		const root = createItem("root-key", "Root", [child], "root-file-id")
		const attachmentIndex = buildAttachmentIndex([root])

		expect(attachmentIndex.totalCount).toBe(2)
		expect(attachmentIndex.allKeys).toEqual(["root-file-id", "child-file-id"])
		expect(attachmentIndex.rootKeys).toEqual(["root-file-id"])
		expect(attachmentIndex.getItemByKey("child-file-id")).toBe(child)
		expect(attachmentIndex.getItemById("child-file-id")).toBe(child)
	})

	it("tracks parent and path metadata", () => {
		const leaf = createItem("leaf", "Leaf")
		const folder = createItem("folder", "Folder", [leaf])
		const root = createItem("root", "Root", [folder])
		const attachmentIndex = buildAttachmentIndex([root])

		expect(attachmentIndex.parentKeyByKey.get("leaf")).toBe("folder")
		expect(attachmentIndex.getEntryByKey("leaf")?.parentItem).toBe(folder)
		expect(attachmentIndex.getPathKeys("leaf")).toEqual(["root", "folder", "leaf"])
		expect(attachmentIndex.getParentItemsByKey("leaf")).toEqual([root, folder])
	})

	it("falls back to relative path, path, then generated key when file_id is absent", () => {
		const relativePathItem: AttachmentItem = {
			relative_file_path: "virtual/relative.md",
			name: "Relative",
		}
		const pathItem: AttachmentItem = {
			path: "virtual/path.md",
			name: "Path",
		}
		const fallbackItem: AttachmentItem = {
			name: "Fallback",
		}
		const attachmentIndex = buildAttachmentIndex([relativePathItem, pathItem, fallbackItem])

		expect(attachmentIndex.getItemById("virtual/relative.md")).toBe(relativePathItem)
		expect(attachmentIndex.getItemByKey("virtual/path.md")).toBe(pathItem)
		expect(attachmentIndex.getItemById("root-2")).toBe(fallbackItem)
	})

	it("returns parent items by file id", () => {
		const file = createItem("file-key", "File", undefined, "file-id")
		const folder = createItem("folder-key", "Folder", [file], "folder-id")
		const attachmentIndex = buildAttachmentIndex([folder])

		expect(attachmentIndex.getParentItemsById("file-id")).toEqual([folder])
		expect(attachmentIndex.getParentItemsById("folder-id")).toEqual([])
		expect(attachmentIndex.getPathKeysById("file-id")).toEqual(["folder-id", "file-id"])
		expect(attachmentIndex.getParentItemById("file-id")).toBe(folder)
		expect(attachmentIndex.getParentItemByKey("file-id")).toBe(folder)
	})

	it("supports lookup helpers across key and file id", () => {
		const file = createItem("file-key", "File", undefined, "file-id")
		const folder = createItem("folder-key", "Folder", [file], "folder-id")
		const attachmentIndex = buildAttachmentIndex([folder])

		expect(getAttachmentByLookupKey(attachmentIndex, "file-id")).toBe(file)
		expect(getPathKeysByLookupKey(attachmentIndex, "file-id")).toEqual(["folder-id", "file-id"])
		expect(getParentItemByLookupKey(attachmentIndex, "file-id")).toBe(folder)
		expect(getAttachmentPathByLookupKey(attachmentIndex, "file-id")).toEqual([folder, file])
		expect(getAttachmentPathByLookupKey(attachmentIndex, "folder-id")).toEqual([folder])
		expect(getAttachmentPathByLookupKey(attachmentIndex, "missing-id")).toEqual([])
		expect(isDescendantByParentMap(attachmentIndex, "folder-id", "file-id")).toBe(true)
		expect(isDescendantByParentMap(attachmentIndex, "file-id", "folder-id")).toBe(false)
	})

	it("skips hidden attachments by default", () => {
		const visibleLeaf = createItem("visible-leaf", "Visible")
		const hiddenLeaf = createItem("hidden-leaf", "Hidden")
		hiddenLeaf.is_hidden = true
		const root = createItem("root", "Root", [visibleLeaf, hiddenLeaf])
		const attachmentIndex = buildAttachmentIndex([root])

		expect(attachmentIndex.allKeys).toEqual(["root", "visible-leaf"])
		expect(attachmentIndex.getChildKeysByKey("root")).toEqual(["visible-leaf"])
		expect(attachmentIndex.getItemByKey("hidden-leaf")).toBeUndefined()
	})

	it("reports structural reference counts for memory regression checks", () => {
		const file = createItem("file-key", "File", undefined, "file-id")
		const folder = createItem("folder-key", "Folder", [file], "folder-id")
		const attachmentIndex = buildAttachmentIndex([folder])

		expect(collectAttachmentIndexStructureStats(attachmentIndex)).toEqual({
			attachment_index_entry_count: 2,
			attachment_index_map_entry_count: 8,
			attachment_index_path_key_ref_count: 0,
			attachment_index_child_key_ref_count: 1,
			attachment_index_root_key_count: 1,
			attachment_index_all_key_count: 2,
			attachment_index_max_path_depth: 2,
			attachment_index_avg_path_depth: 1.5,
		})
	})

	it("exposes child and descendant keys for selection logic", () => {
		const firstLeaf = createItem("first-leaf", "First leaf")
		const secondLeaf = createItem("second-leaf", "Second leaf")
		const nestedFolder = createItem("nested-folder", "Nested folder", [secondLeaf])
		const root = createItem("root", "Root", [firstLeaf, nestedFolder])
		const attachmentIndex = buildAttachmentIndex([root])

		expect(attachmentIndex.getEntryById("nested-folder")?.item).toBe(nestedFolder)
		expect(attachmentIndex.getChildKeysByKey("root")).toEqual(["first-leaf", "nested-folder"])
		expect(attachmentIndex.getChildKeysById("root")).toEqual(["first-leaf", "nested-folder"])
		expect(attachmentIndex.getDescendantKeysByKey("root")).toEqual([
			"first-leaf",
			"nested-folder",
			"second-leaf",
		])
		expect(attachmentIndex.getDescendantKeysById("nested-folder")).toEqual(["second-leaf"])
	})
})
