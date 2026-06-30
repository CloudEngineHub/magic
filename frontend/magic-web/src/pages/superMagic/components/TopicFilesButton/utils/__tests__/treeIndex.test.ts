import { describe, expect, it } from "vitest"
import {
	buildTreeIndex,
	collectTreeIndexStructureStats,
	getAttachmentByLookupKey,
	getParentNodeByLookupKey,
	getPathKeysByLookupKey,
	getTreeNodeByLookupKey,
	isDescendantByParentMap,
} from "../treeIndex"
import type { TreeNodeData } from "../treeDataConverter"

function createNode(
	key: string,
	name: string,
	children?: TreeNodeData[],
	fileId = key,
): TreeNodeData {
	return {
		key,
		title: null,
		item: {
			file_id: fileId,
			name,
			is_directory: Boolean(children?.length),
			children: children?.map((child) => child.item),
		},
		children,
		isLeaf: !children?.length,
		level: 0,
	}
}

describe("buildTreeIndex", () => {
	it("indexes nodes and items by key and file id", () => {
		const child = createNode("child-key", "Child", undefined, "child-file-id")
		const root = createNode("root-key", "Root", [child], "root-file-id")
		const treeIndex = buildTreeIndex([root])

		expect(treeIndex.totalCount).toBe(2)
		expect(treeIndex.allKeys).toEqual(["root-key", "child-key"])
		expect(treeIndex.rootKeys).toEqual(["root-key"])
		expect(treeIndex.getNodeByKey("child-key")).toBe(child)
		expect(treeIndex.getItemById("child-file-id")).toBe(child.item)
	})

	it("tracks parent and path metadata", () => {
		const leaf = createNode("leaf", "Leaf")
		const folder = createNode("folder", "Folder", [leaf])
		const root = createNode("root", "Root", [folder])
		const treeIndex = buildTreeIndex([root])

		expect(treeIndex.parentKeyByKey.get("leaf")).toBe("folder")
		expect(treeIndex.getEntryByKey("leaf")?.parentNode).toBe(folder)
		expect(treeIndex.getPathKeys("leaf")).toEqual(["root", "folder", "leaf"])
		expect(treeIndex.getParentItemsByKey("leaf")).toEqual([root.item, folder.item])
	})

	it("falls back to the node key when file_id is absent", () => {
		const node = createNode("virtual-key", "Virtual", undefined, "")
		const treeIndex = buildTreeIndex([node])

		expect(treeIndex.getItemById("virtual-key")).toBe(node.item)
		expect(treeIndex.getNodeById("virtual-key")).toBe(node)
	})

	it("returns parent items by file id", () => {
		const file = createNode("file-key", "File", undefined, "file-id")
		const folder = createNode("folder-key", "Folder", [file], "folder-id")
		const treeIndex = buildTreeIndex([folder])

		expect(treeIndex.getParentItemsById("file-id")).toEqual([folder.item])
		expect(treeIndex.getParentItemsById("folder-id")).toEqual([])
		expect(treeIndex.getPathKeysById("file-id")).toEqual(["folder-key", "file-key"])
		expect(treeIndex.getParentNodeById("file-id")).toBe(folder)
		expect(treeIndex.getParentNodeByKey("file-key")).toBe(folder)
	})

	it("supports lookup helpers across key and file id", () => {
		const file = createNode("file-key", "File", undefined, "file-id")
		const folder = createNode("folder-key", "Folder", [file], "folder-id")
		const treeIndex = buildTreeIndex([folder])

		expect(getTreeNodeByLookupKey(treeIndex, "file-id")).toBe(file)
		expect(getTreeNodeByLookupKey(treeIndex, "file-key")).toBe(file)
		expect(getAttachmentByLookupKey(treeIndex, "file-id")).toBe(file.item)
		expect(getPathKeysByLookupKey(treeIndex, "file-id")).toEqual(["folder-key", "file-key"])
		expect(getParentNodeByLookupKey(treeIndex, "file-id")).toBe(folder)
		expect(isDescendantByParentMap(treeIndex, "folder-id", "file-id")).toBe(true)
		expect(isDescendantByParentMap(treeIndex, "file-id", "folder-id")).toBe(false)
	})

	it("reports structural reference counts for memory regression checks", () => {
		const file = createNode("file-key", "File", undefined, "file-id")
		const folder = createNode("folder-key", "Folder", [file], "folder-id")
		const treeIndex = buildTreeIndex([folder])

		expect(collectTreeIndexStructureStats(treeIndex)).toEqual({
			tree_index_entry_count: 2,
			tree_index_map_entry_count: 14,
			tree_index_path_key_ref_count: 3,
			tree_index_child_key_ref_count: 1,
			tree_index_root_key_count: 1,
			tree_index_all_key_count: 2,
			tree_index_max_path_depth: 2,
			tree_index_avg_path_depth: 1.5,
		})
	})

	it("exposes child and descendant keys without prebuilding a selection index", () => {
		const firstLeaf = createNode("first-leaf", "First leaf")
		const secondLeaf = createNode("second-leaf", "Second leaf")
		const nestedFolder = createNode("nested-folder", "Nested folder", [secondLeaf])
		const root = createNode("root", "Root", [firstLeaf, nestedFolder])
		const treeIndex = buildTreeIndex([root])

		expect(treeIndex.getEntryById("nested-folder")?.item).toBe(nestedFolder.item)
		expect(treeIndex.getChildKeysByKey("root")).toEqual(["first-leaf", "nested-folder"])
		expect(treeIndex.getChildKeysById("root")).toEqual(["first-leaf", "nested-folder"])
		expect(treeIndex.getDescendantKeysByKey("root")).toEqual([
			"first-leaf",
			"nested-folder",
			"second-leaf",
		])
		expect(treeIndex.getDescendantKeysById("nested-folder")).toEqual(["second-leaf"])
	})
})
