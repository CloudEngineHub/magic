import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TreeNodeData } from "../../utils/treeDataConverter"
import type { VisibleTreeNodeRow } from "../../utils/visibleTreeRows"
import CustomTree from "./CustomTree"

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getVirtualItems: () => [{ index: 55, key: "file-55", start: 1870 }],
		getTotalSize: () => 2040,
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
		scrollToOffset: vi.fn(),
		measurementsCache: Array.from({ length: 60 }, (_, index) => ({
			start: index * 34,
			end: (index + 1) * 34,
		})),
	}),
}))

vi.mock("./style", () => ({
	useStyles: () => ({ styles: { customTreeNode: "customTreeNode" } }),
}))

vi.mock("./useCustomTreePerf", () => ({
	measureTreeSelect: (_keys: unknown, _node: unknown, callback: () => void) => callback(),
	recordTreeScrollAnchorMissing: vi.fn(),
	recordTreeScrollAnchorRestore: vi.fn(),
	useCustomTreePerfMetrics: vi.fn(),
}))

function createRows(count: number): VisibleTreeNodeRow[] {
	return Array.from({ length: count }, (_, index) => {
		const node: TreeNodeData = {
			key: `file-${index}`,
			title: `File ${index}`,
			item: { file_id: `file-${index}`, file_name: `File ${index}` },
			level: 0,
			isLeaf: true,
		}

		return { node, parentNode: null, ancestorKeys: [] }
	})
}

function createFolderRows(): VisibleTreeNodeRow[] {
	const folder: TreeNodeData = {
		key: "folder-0",
		title: "Folder 0",
		item: { file_id: "folder-0", is_directory: true },
		level: 0,
		isLeaf: false,
	}
	const children = Array.from({ length: 4 }, (_, index) => {
		const node: TreeNodeData = {
			key: `file-${index}`,
			title: `File ${index}`,
			item: { file_id: `file-${index}`, file_name: `File ${index}` },
			level: 1,
			isLeaf: true,
		}

		return { node, parentNode: folder, ancestorKeys: ["folder-0"] }
	})

	return [{ node: folder, parentNode: null, ancestorKeys: [] }, ...children]
}

describe("CustomTree virtualization", () => {
	it("uses the virtualizer's measured total size and row offset", () => {
		const visibleRows = createRows(60)
		const scrollElement = document.createElement("div")
		document.body.appendChild(scrollElement)

		const { container, unmount } = render(
			<CustomTree
				visibleRows={visibleRows}
				visibleNodes={visibleRows.map((row) => row.node)}
				visibleNodeIndexByKey={
					new Map(visibleRows.map((row, index) => [String(row.node.key), index]))
				}
				scrollElementRef={{ current: scrollElement }}
			/>,
		)

		expect(container.querySelector<HTMLElement>(".magic-tree")?.style.height).toBe("2040px")
		expect(container.querySelector<HTMLElement>('[data-index="55"]')?.style.transform).toBe(
			"translateY(1870px)",
		)

		unmount()
		scrollElement.remove()
	})

	it("positions drag target block from virtualizer measurements", () => {
		const visibleRows = createFolderRows()
		const scrollElement = document.createElement("div")
		document.body.appendChild(scrollElement)

		const { container, unmount } = render(
			<CustomTree
				visibleRows={visibleRows}
				visibleNodes={visibleRows.map((row) => row.node)}
				visibleNodeIndexByKey={
					new Map(visibleRows.map((row, index) => [String(row.node.key), index]))
				}
				scrollElementRef={{ current: scrollElement }}
				virtualThreshold={0}
				dragTargetKey="folder-0"
				dragTargetNodeClass="drag-target-block"
			/>,
		)

		const dragTargetBlock = container.querySelector<HTMLElement>(".drag-target-block")
		expect(dragTargetBlock?.style.top).toBe("0px")
		expect(dragTargetBlock?.style.height).toBe("170px")

		unmount()
		scrollElement.remove()
	})
})
