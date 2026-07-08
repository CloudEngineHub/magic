import { describe, expect, it } from "vitest"
import {
	buildSelectionCheckStates,
	countSelectedVisibleItems,
	getNearestSelectedAncestor,
	getSelectionChildIds,
} from "../fileSelectionIndex"
import { buildAttachmentIndex } from "../attachmentIndex"
import type { AttachmentItem } from "../../hooks/types"

function createNode(
	key: string,
	name: string,
	children?: AttachmentItem[],
	isHidden = false,
): AttachmentItem {
	return {
		file_id: key,
		name,
		is_directory: Boolean(children?.length),
		children,
		is_hidden: isHidden,
	}
}

const getItemId = (item: AttachmentItem) => item.file_id || ""

describe("fileSelectionIndex", () => {
	it("builds inherited and partial check states from the shared tree index", () => {
		const firstLeaf = createNode("first-leaf", "First leaf")
		const secondLeaf = createNode("second-leaf", "Second leaf")
		const folder = createNode("folder", "Folder", [firstLeaf, secondLeaf])
		const treeIndex = buildAttachmentIndex([folder])

		const states = buildSelectionCheckStates(treeIndex, new Set(["first-leaf"]), getItemId)

		expect(states.get("first-leaf")).toBe("checked")
		expect(states.get("second-leaf")).toBe("unchecked")
		expect(states.get("folder")).toBe("indeterminate")
	})

	it("counts selected folders through descendants while avoiding duplicates", () => {
		const firstLeaf = createNode("first-leaf", "First leaf")
		const secondLeaf = createNode("second-leaf", "Second leaf")
		const hiddenLeaf = createNode("hidden-leaf", "Hidden leaf", undefined, true)
		const folder = createNode("folder", "Folder", [firstLeaf, secondLeaf, hiddenLeaf])
		const treeIndex = buildAttachmentIndex([folder])

		expect(
			countSelectedVisibleItems(treeIndex, new Set(["folder", "first-leaf"]), getItemId),
		).toBe(3)
	})

	it("returns selection ids when node keys differ from getItemId values", () => {
		const leaf = createNode("generated-leaf-key", "Leaf")
		leaf.file_id = "leaf-id"
		const folder = createNode("generated-folder-key", "Folder", [leaf])
		folder.file_id = "folder-id"
		const treeIndex = buildAttachmentIndex([folder])

		const ancestor = getNearestSelectedAncestor(
			treeIndex,
			"leaf-id",
			new Set(["folder-id"]),
			getItemId,
		)

		expect(ancestor?.selectedAncestorId).toBe("folder-id")
		expect(ancestor?.directChildId).toBe("leaf-id")
		expect(getSelectionChildIds(treeIndex, "folder-id", getItemId)).toEqual(["leaf-id"])
	})
})
