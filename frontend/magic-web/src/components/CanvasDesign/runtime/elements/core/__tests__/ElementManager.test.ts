import Konva from "konva"
import { describe, expect, it, vi } from "vitest"
import { ElementManager } from "../ElementManager"
import type { LayerElement } from "../../../document/types"
import { CanvasDocumentIndex } from "../CanvasDocumentIndex"
import { GenerationStatus } from "../../../../public/magic-types"

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
			getNode?: () => Konva.Node
			setDraggable: ReturnType<typeof vi.fn>
			setListening: ReturnType<typeof vi.fn>
		}
	>
	canDragElement: (element: LayerElement) => boolean
	canListenElement: () => boolean
	disableElementDragging: () => void
	disableElementDraggingOnly: () => void
	enableElementDragging: () => void
	setViewportGestureDraggingDisabled: (disabled: boolean) => void
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

	it("stops active element drags and disables draggable during viewport gesture", () => {
		const manager = createManager()
		const elementOneData = createElement("element-1")
		const elementTwoData = createElement("element-2")
		const nodeOne = new Konva.Group()
		const nodeTwo = new Konva.Group()
		vi.spyOn(nodeOne, "isDragging").mockReturnValue(true)
		vi.spyOn(nodeTwo, "isDragging").mockReturnValue(true)
		const stopDragOne = vi.spyOn(nodeOne, "stopDrag").mockImplementation(() => undefined)
		const stopDragTwo = vi.spyOn(nodeTwo, "stopDrag").mockImplementation(() => undefined)
		const elementOne = {
			getData: () => elementOneData,
			getNode: () => nodeOne,
			setDraggable: vi.fn(),
			setListening: vi.fn(),
		}
		const elementTwo = {
			getData: () => elementTwoData,
			getNode: () => nodeTwo,
			setDraggable: vi.fn(),
			setListening: vi.fn(),
		}
		manager.elements = new Map([
			["element-1", elementOne],
			["element-2", elementTwo],
		])

		manager.setViewportGestureDraggingDisabled(true)

		expect(stopDragOne).toHaveBeenCalledTimes(1)
		expect(stopDragTwo).toHaveBeenCalledTimes(1)
		expect(manager.canDragElement(elementOneData)).toBe(false)
		expect(manager.canDragElement(elementTwoData)).toBe(false)
		expect(elementOne.setDraggable).toHaveBeenLastCalledWith(false)
		expect(elementTwo.setDraggable).toHaveBeenLastCalledWith(false)

		manager.setViewportGestureDraggingDisabled(false)

		expect(manager.canDragElement(elementOneData)).toBe(true)
		expect(manager.canDragElement(elementTwoData)).toBe(true)
		expect(elementOne.setDraggable).toHaveBeenLastCalledWith(true)
		expect(elementTwo.setDraggable).toHaveBeenLastCalledWith(true)
	})

	it("unsubscribes viewport gesture listener on destroy", () => {
		const manager = Object.create(ElementManager.prototype) as ElementManager
		const unsubscribe = vi.fn()
		Object.assign(
			manager as unknown as {
				clear: ReturnType<typeof vi.fn>
				elements: Map<string, never>
				viewportGestureUnsubscribe?: () => void
			},
			{
				clear: vi.fn(),
				elements: new Map(),
				viewportGestureUnsubscribe: unsubscribe,
			},
		)

		manager.destroy()

		expect(unsubscribe).toHaveBeenCalledTimes(1)
		expect(
			(manager as unknown as { viewportGestureUnsubscribe?: () => void })
				.viewportGestureUnsubscribe,
		).toBeUndefined()
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

describe("ElementManager transform-safe full updates", () => {
	it("preserves the live node position and defers structural rerender for resource updates", () => {
		const node = new Konva.Group({ x: 140, y: 180 })
		let elementData = {
			id: "pasted-image",
			type: "image",
			x: 12,
			y: 16,
			width: 80,
			height: 60,
			status: GenerationStatus.Processing,
		} as LayerElement
		const updateElement = vi.fn((nextData: LayerElement) => {
			elementData = nextData
			return true
		})
		const rerenderWhenTransformIdle = vi.fn()
		const element = {
			getData: () => elementData,
			getNode: () => node,
			update: updateElement,
			rerenderWhenTransformIdle,
		}
		const manager = Object.create(ElementManager.prototype) as {
			elements: Map<string, typeof element>
			invalidateGeometryForElement: ReturnType<typeof vi.fn>
			scheduleContentLayerDraw: ReturnType<typeof vi.fn>
			update: ElementManager["update"]
		}
		manager.elements = new Map([["pasted-image", element]])
		manager.invalidateGeometryForElement = vi.fn()
		manager.scheduleContentLayerDraw = vi.fn()

		manager.update(
			"pasted-image",
			{
				src: "target/image.png",
				status: GenerationStatus.Completed,
			},
			{ silent: true },
		)

		expect(updateElement).toHaveBeenCalledWith(
			expect.objectContaining({
				x: 140,
				y: 180,
				src: "target/image.png",
				status: GenerationStatus.Completed,
			}),
		)
		expect(rerenderWhenTransformIdle).toHaveBeenCalledTimes(1)
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
