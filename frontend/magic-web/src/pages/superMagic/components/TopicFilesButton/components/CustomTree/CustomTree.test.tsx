import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TreeNodeData } from "../../utils/treeDataConverter"
import type { VisibleTreeNodeRow } from "../../utils/visibleTreeRows"
import CustomTree from "./CustomTree"

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getVirtualItems: () => [{ index: 55, key: "file-55", start: 1870 }],
		getTotalSize: () => 2040,
		measurementsCache: Array.from({ length: 60 }, (_, index) => ({
			index,
			key: `file-${index}`,
			start: index === 55 ? 1870 : index * 34,
			end: index === 55 ? 1904 : (index + 1) * 34,
			size: index === 55 ? 34 : 34,
			lane: 0,
		})),
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
		scrollToOffset: vi.fn(),
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

function createRows(
	count: number,
	options?: { directoryIndexes?: number[] },
): VisibleTreeNodeRow[] {
	const directoryIndexes = new Set(options?.directoryIndexes ?? [])

	return Array.from({ length: count }, (_, index) => {
		const isDirectory = directoryIndexes.has(index)
		const node: TreeNodeData = {
			key: `file-${index}`,
			title: `File ${index}`,
			item: {
				file_id: `file-${index}`,
				file_name: `File ${index}`,
				is_directory: isDirectory,
			},
			level: 0,
			isLeaf: !isDirectory,
		}

		return { node, parentNode: null, ancestorKeys: [] }
	})
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

	it("positions the drag target block with measured virtual offsets", () => {
		const visibleRows = createRows(60, { directoryIndexes: [50] })
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
				dragTargetKey="file-50"
				dragTargetNodeClass="drag-target"
			/>,
		)

		const highlight = container.querySelector<HTMLElement>(".drag-target")
		// Measured start for index 50 is 50 * 34; estimate-based math would use 50 * 32.
		expect(highlight?.style.top).toBe("1700px")
		expect(highlight?.style.height).toBe("34px")

		unmount()
		scrollElement.remove()
	})
})
