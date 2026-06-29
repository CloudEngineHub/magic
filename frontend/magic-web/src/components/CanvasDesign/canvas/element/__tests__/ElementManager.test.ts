import Konva from "konva"
import { describe, expect, it, vi } from "vitest"
import { ElementManager } from "../ElementManager"
import type { LayerElement } from "../../types"
import { CanvasDocumentIndex } from "../CanvasDocumentIndex"

interface DragManagerHarness {
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
	elements?: Map<
		string,
		{
			getData: () => LayerElement
			setDraggable: ReturnType<typeof vi.fn>
			setListening: ReturnType<typeof vi.fn>
		}
	>
	canDragElement: (element: LayerElement) => boolean
	canListenElement: () => boolean
	disableElementDragging: () => void
	disableElementDraggingOnly: () => void
	enableElementDragging: () => void
}

function createManager(options: { selectedIds?: string[]; canTransform?: boolean } = {}) {
	const selectedIds = new Set(options.selectedIds ?? [])
	const manager = Object.create(ElementManager.prototype) as DragManagerHarness
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

	it("keeps rerendered nodes non-interactive while element dragging is disabled", () => {
		const manager = createManager()
		const elementData = createElement("element-1")
		const element = {
			getData: () => elementData,
			setDraggable: vi.fn(),
			setListening: vi.fn(),
		}
		manager.elements = new Map([["element-1", element]])

		manager.disableElementDragging()

		expect(manager.canDragElement(elementData)).toBe(false)
		expect(manager.canListenElement()).toBe(false)
		expect(element.setDraggable).toHaveBeenLastCalledWith(false)
		expect(element.setListening).toHaveBeenLastCalledWith(false)

		manager.enableElementDragging()

		expect(manager.canDragElement(elementData)).toBe(true)
		expect(manager.canListenElement()).toBe(true)
		expect(element.setDraggable).toHaveBeenLastCalledWith(true)
		expect(element.setListening).toHaveBeenLastCalledWith(true)
	})

	it("keeps listening enabled when only element dragging is disabled", () => {
		const manager = createManager()
		const elementData = createElement("element-1")
		const element = {
			getData: () => elementData,
			setDraggable: vi.fn(),
			setListening: vi.fn(),
		}
		manager.elements = new Map([["element-1", element]])

		manager.disableElementDraggingOnly()

		expect(manager.canDragElement(elementData)).toBe(false)
		expect(manager.canListenElement()).toBe(true)
		expect(element.setDraggable).toHaveBeenLastCalledWith(false)
		expect(element.setListening).not.toHaveBeenCalled()
	})
})

describe("ElementManager node-only resize sync", () => {
	it("syncs internal transform layout when node-only updates group size", () => {
		const node = new Konva.Group({ width: 100, height: 80 })
		const onTransformResize = vi.fn()
		const elementData = createElement("element-1")
		const manager = Object.create(ElementManager.prototype) as {
			elements: Map<
				string,
				{
					getData: () => LayerElement
					getId: () => string
					getNode: () => Konva.Node
					onTransformResize?: (width: number, height: number) => void
				}
			>
			update: ElementManager["update"]
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

describe("ElementManager container child lifecycle", () => {
	it("mounts newly rendered child elements inside containers", () => {
		const childNode = new Konva.Group()
		const childElement = {
			render: vi.fn(() => childNode),
			onMounted: vi.fn(),
		}
		const manager = Object.create(ElementManager.prototype) as {
			elements: Map<string, typeof childElement>
			canvas: {
				eventEmitter: {
					emit: ReturnType<typeof vi.fn>
				}
			}
			createElementInstance: ReturnType<typeof vi.fn>
			markDocumentIndexDirty: ReturnType<typeof vi.fn>
			invalidateGeometryForElement: ReturnType<typeof vi.fn>
			renderChildren: (
				parentNode: Konva.Node,
				parentElementData: LayerElement,
				parentElement: unknown,
			) => void
		}
		manager.elements = new Map()
		manager.canvas = {
			eventEmitter: {
				emit: vi.fn(),
			},
		}
		manager.createElementInstance = vi.fn(() => childElement)
		manager.markDocumentIndexDirty = vi.fn()
		manager.invalidateGeometryForElement = vi.fn()

		const parentNode = new Konva.Group()
		const child = {
			id: "child-image",
			type: "image",
			x: 0,
			y: 0,
			width: 100,
			height: 80,
			src: "./images/child.png",
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

		manager.renderChildren(parentNode, frame, {} as never)

		expect(childElement.render).toHaveBeenCalled()
		expect(childElement.onMounted).toHaveBeenCalledOnce()
		expect(manager.elements.get("child-image")).toBe(childElement)
		expect(childNode.getParent()).toBe(parentNode)
	})
})

describe("ElementManager document patch export", () => {
	function createPatchManager(elements: LayerElement[], temporaryElementIds: string[] = []) {
		const manager = Object.create(ElementManager.prototype) as {
			elements: Map<string, { getData: () => LayerElement }>
			temporaryElements: Set<string>
			documentIndex: CanvasDocumentIndex
			exportDocumentPatch: ElementManager["exportDocumentPatch"]
			exportDocument: ElementManager["exportDocument"]
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

	it("recursively filters temporary children from exported documents", () => {
		const tempChild = {
			id: "temp-child",
			type: "image",
			x: 12,
			y: 24,
			width: 80,
			height: 60,
			src: undefined,
		} as LayerElement
		const child = {
			id: "child-1",
			type: "rectangle",
			x: 20,
			y: 32,
			width: 40,
			height: 30,
		} as LayerElement
		const frame = {
			id: "frame-1",
			type: "frame",
			x: 0,
			y: 0,
			width: 300,
			height: 200,
			children: [tempChild, child],
		} as LayerElement
		const manager = createPatchManager([frame, tempChild, child], ["temp-child"])

		expect(manager.exportDocument()).toEqual({
			elements: [
				expect.objectContaining({
					id: "frame-1",
					children: [
						expect.objectContaining({
							id: "child-1",
						}),
					],
				}),
			],
		})
		expect(manager.exportDocument({ includeTemporary: true })).toEqual({
			elements: [
				expect.objectContaining({
					id: "frame-1",
					children: [
						expect.objectContaining({
							id: "temp-child",
						}),
						expect.objectContaining({
							id: "child-1",
						}),
					],
				}),
			],
		})
	})
})
