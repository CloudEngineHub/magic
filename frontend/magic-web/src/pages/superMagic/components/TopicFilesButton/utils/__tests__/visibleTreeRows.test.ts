import { describe, expect, it } from "vitest"
import {
	buildVisibleNodeIndexByKey,
	flattenVisibleAttachmentTreeRows,
	getDragReceiverNode,
	getDragTargetBlockRange,
	resolveVisibleTreeScrollAnchor,
	resolveVisibleTreeScrollTopForAnchor,
} from "../visibleTreeRows"
import type { AttachmentItem } from "../../hooks/types"
import type { TreeNodeData } from "../treeDataConverter"

function createNode(
	key: string,
	children?: TreeNodeData[],
	fileId = key,
	level = 0,
	isDirectory = Boolean(children?.length),
): TreeNodeData {
	return {
		key,
		title: null,
		item: {
			file_id: fileId,
			is_directory: isDirectory,
			children: children?.map((child) => child.item),
		},
		children,
		isLeaf: !children?.length,
		level,
	}
}

describe("visibleTreeRows", () => {
	it("flattens only expanded branches in display order", () => {
		const visibleRows = flattenVisibleAttachmentTreeRows(
			[
				{
					file_id: "first-folder",
					name: "First folder",
					is_directory: true,
					children: [{ file_id: "first-leaf", file_name: "first.md" }],
				},
				{
					file_id: "second-folder",
					name: "Second folder",
					is_directory: true,
					children: [{ file_id: "hidden-leaf", file_name: "hidden.md" }],
				},
			],
			new Set(["first-folder"]),
		)

		const visibleNodes = visibleRows.map((row) => row.node)
		expect(visibleNodes.map((node) => node.key)).toEqual([
			"first-folder",
			"first-leaf",
			"second-folder",
		])
	})

	it("indexes visible nodes by key and file id alias", () => {
		const visibleNodes = [
			createNode("folder-key", undefined, "folder-id"),
			createNode("file-key", undefined, "file-id"),
		]

		const indexByKey = buildVisibleNodeIndexByKey(visibleNodes)

		expect(indexByKey.get("folder-key")).toBe(0)
		expect(indexByKey.get("folder-id")).toBe(0)
		expect(indexByKey.get("file-key")).toBe(1)
		expect(indexByKey.get("file-id")).toBe(1)
	})

	it("keeps parent and ancestor metadata for visible rows", () => {
		const rows = flattenVisibleAttachmentTreeRows(
			[
				{
					file_id: "root-folder",
					name: "Root folder",
					is_directory: true,
					children: [
						{
							file_id: "child-folder",
							name: "Child folder",
							is_directory: true,
							children: [{ file_id: "leaf", file_name: "leaf.md" }],
						},
					],
				},
			],
			new Set(["root-folder", "child-folder"]),
		)

		expect(rows.map((row) => row.node.key)).toEqual(["root-folder", "child-folder", "leaf"])
		expect(rows[0].parentNode).toBeNull()
		expect(rows[1].parentNode).toBe(rows[0].node)
		expect(rows[2].parentNode).toBe(rows[1].node)
		expect(rows[2].ancestorKeys).toEqual(["root-folder", "child-folder"])
	})

	it("derives visible rows directly from attachment trees", () => {
		const attachmentsFromTree: AttachmentItem[] = [
			{
				file_id: "root-folder",
				name: "Root folder",
				is_directory: true,
				children: [
					{
						file_id: "child-folder",
						name: "Child folder",
						is_directory: true,
						children: [
							{
								file_id: "leaf-file",
								file_name: "leaf.md",
							},
						],
					},
				],
			},
		]

		const rows = flattenVisibleAttachmentTreeRows(
			attachmentsFromTree,
			new Set(["root-folder", "child-folder"]),
			"leaf-file",
		)

		expect(rows.map((row) => row.node.key)).toEqual([
			"root-folder",
			"child-folder",
			"leaf-file",
		])
		expect(rows[0].node.isLeaf).toBe(false)
		expect(rows[0].node.children).toBeUndefined()
		expect(rows[1].parentNode).toBe(rows[0].node)
		expect(rows[2].parentNode).toBe(rows[1].node)
		expect(rows[2].ancestorKeys).toEqual(["root-folder", "child-folder"])
		expect(rows[2].node.disabled).toBe(true)
		expect(buildVisibleNodeIndexByKey(rows.map((row) => row.node)).get("leaf-file")).toBe(2)
	})

	it("resolves drag receiver and block range from visible rows", () => {
		const rows = flattenVisibleAttachmentTreeRows(
			[
				{
					file_id: "root-folder",
					name: "Root folder",
					is_directory: true,
					children: [
						{ file_id: "root-leaf", file_name: "root.md" },
						{
							file_id: "nested-folder",
							name: "Nested folder",
							is_directory: true,
							children: [{ file_id: "nested-leaf", file_name: "nested.md" }],
						},
					],
				},
			],
			new Set(["root-folder", "nested-folder"]),
		)

		expect(getDragReceiverNode(rows[0])).toBe(rows[0].node)
		expect(getDragReceiverNode(rows[1])).toBe(rows[0].node)
		expect(getDragReceiverNode(rows[3])).toBe(rows[2].node)
		expect(getDragTargetBlockRange(rows, "root-folder")).toEqual({
			startIndex: 0,
			endIndex: 3,
		})
		expect(getDragTargetBlockRange(rows, "nested-folder")).toEqual({
			startIndex: 2,
			endIndex: 3,
		})
		expect(getDragTargetBlockRange(rows, "nested-leaf")).toBeNull()
	})

	it("restores scroll top from a visible row anchor after rows shift", () => {
		const rowHeight = 32
		const beforeNodes = [createNode("a"), createNode("b"), createNode("c")]
		const anchor = resolveVisibleTreeScrollAnchor(beforeNodes, rowHeight + 7, rowHeight)
		const afterNodes = [createNode("new-a"), createNode("a"), createNode("b"), createNode("c")]
		expect(anchor).toEqual({ key: "b", index: 1, offsetPx: 7 })
		if (!anchor) throw new Error("Expected scroll anchor")

		const nextScrollTop = resolveVisibleTreeScrollTopForAnchor(
			anchor,
			buildVisibleNodeIndexByKey(afterNodes),
			rowHeight,
		)

		expect(nextScrollTop).toBe(rowHeight * 2 + 7)
	})
})
