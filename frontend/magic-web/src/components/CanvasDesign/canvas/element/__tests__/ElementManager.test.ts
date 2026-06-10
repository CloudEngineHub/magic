import Konva from "konva"
import { describe, expect, it, vi } from "vitest"
import { ElementManager } from "../ElementManager"
import type { LayerElement } from "../../types"
import { CanvasDocumentIndex } from "../CanvasDocumentIndex"

function createManager(options: { selectedIds?: string[]; canTransform?: boolean } = {}) {
	const selectedIds = new Set(options.selectedIds ?? [])
	const manager = Object.create(ElementManager.prototype) as ElementManager & {
		canvas: {
			permissionManager: {
				canTransform: ReturnType<typeof vi.fn>
			}
			selectionManager: {
				getSelectionCount: () => number
				isSelected: (elementId: string) => boolean
			}
			isKeepRatioModifierPressed: () => boolean
		}
	}
	manager.canvas = {
		permissionManager: {
			canTransform: vi.fn(() => options.canTransform ?? true),
		},
		selectionManager: {
			getSelectionCount: () => selectedIds.size,
			isSelected: (elementId: string) => selectedIds.has(elementId),
		},
		isKeepRatioModifierPressed: () => false,
	}
	return manager
}

function createElement(id: string): LayerElement {
	return {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
	}
}

describe("ElementManager drag eligibility", () => {
	it("keeps the selected element draggable in single selection", () => {
		const manager = createManager({ selectedIds: ["element-1"] })

		expect(manager.canDragElement(createElement("element-1"))).toBe(true)
	})

	it("disables native dragging for selected nodes in multi-selection", () => {
		const manager = createManager({ selectedIds: ["element-1", "element-2"] })

		expect(manager.canDragElement(createElement("element-1"))).toBe(false)
		expect(manager.canDragElement(createElement("element-2"))).toBe(false)
	})

	it("does not disable native dragging for elements outside the multi-selection", () => {
		const manager = createManager({ selectedIds: ["element-1", "element-2"] })

		expect(manager.canDragElement(createElement("element-3"))).toBe(true)
	})
})

describe("ElementManager node-only resize sync", () => {
	it("syncs internal transform layout when node-only updates group size", () => {
		const node = new Konva.Group({ width: 100, height: 80 })
		const onTransformResize = vi.fn()
		const elementData = createElement("element-1")
		const manager = Object.create(ElementManager.prototype) as ElementManager & {
			elements: Map<
				string,
				{
					getData: () => LayerElement
					getId: () => string
					getNode: () => Konva.Node
					onTransformResize?: (width: number, height: number) => void
				}
			>
		}
		manager.elements = new Map([
			[
				"element-1",
				{
					getData: () => elementData,
					getId: () => "element-1",
					getNode: () => node,
					onTransformResize,
				},
			],
		])

		manager.update(
			"element-1",
			{ width: 160, height: 120 },
			{ mode: "node-only", skipGeometryInvalidate: true },
		)

		expect(node.width()).toBe(160)
		expect(node.height()).toBe(120)
		expect(onTransformResize).toHaveBeenCalledWith(160, 120)
	})
})

describe("ElementManager document patch export", () => {
	function createPatchManager(elements: LayerElement[], temporaryElementIds: string[] = []) {
		const manager = Object.create(ElementManager.prototype) as ElementManager & {
			elements: Map<string, { getData: () => LayerElement }>
			temporaryElements: Set<string>
			documentIndex: CanvasDocumentIndex
		}
		manager.elements = new Map(
			elements.map((element) => [element.id, { getData: () => element }]),
		)
		manager.temporaryElements = new Set(temporaryElementIds)
		manager.documentIndex = new CanvasDocumentIndex()
		return manager
	}

	it("exports sanitized upserts with parent ids", () => {
		const child = {
			id: "child-1",
			type: "image",
			x: 12,
			y: 24,
			width: 80,
			height: 60,
			src: "./images/a.png",
			runtimeOnly: true,
		} as LayerElement
		const frame = {
			id: "frame-1",
			type: "frame",
			x: 0,
			y: 0,
			width: 300,
			height: 200,
			children: [child],
		} as LayerElement
		const manager = createPatchManager([frame, child])

		const patch = manager.exportDocumentPatch({
			changedElementIds: ["child-1"],
		})

		expect(patch).toEqual({
			upserts: [
				{
					parentId: "frame-1",
					element: expect.objectContaining({
						id: "child-1",
						type: "image",
						src: "./images/a.png",
					}),
				},
			],
			deletedElementIds: [],
			changedElementIds: ["child-1"],
			elementNameChanges: undefined,
		})
		expect(patch.upserts[0]?.element).not.toHaveProperty("runtimeOnly")
	})

	it("skips deleted and temporary elements while preserving deleted ids", () => {
		const temp = { id: "temp-1", type: "rectangle", x: 0, y: 0 } as LayerElement
		const manager = createPatchManager([temp], ["temp-1"])

		const patch = manager.exportDocumentPatch({
			changedElementIds: ["deleted-1", "temp-1"],
			deletedElementIds: ["deleted-1"],
		})

		expect(patch.upserts).toEqual([])
		expect(patch.deletedElementIds).toEqual(["deleted-1"])
		expect(patch.changedElementIds).toEqual(["deleted-1", "temp-1"])
	})
})
