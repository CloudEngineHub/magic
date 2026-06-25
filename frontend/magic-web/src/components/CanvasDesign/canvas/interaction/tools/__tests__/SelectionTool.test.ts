import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../Canvas"
import type { LayerElement } from "../../../types"
import { SelectionTool } from "../SelectionTool"

function createTool(node: {
	draggable: () => boolean
	isDragging: () => boolean
	dragDistance: () => number
	startDrag: (options: { evt: MouseEvent }) => void
}) {
	const canvas = {
		contentLayer: {},
		elementManager: {
			getElementInstance: () => ({
				getNode: () => node,
			}),
		},
	} as unknown as Canvas
	return new SelectionTool({ canvas })
}

function createNode() {
	return {
		draggable: vi.fn(() => true),
		isDragging: vi.fn(() => false),
		dragDistance: vi.fn(() => 3),
		startDrag: vi.fn(),
	}
}

type SelectionToolPrivate = {
	armPendingDirectDrag: (event: MouseEvent, elementId: string) => void
	armPendingMultiSelectionDrag: (event: MouseEvent, elementId: string) => void
	clearPendingDirectDrag: () => void
	pendingDirectDrag: unknown
}

type SelectionToolBoxPrivate = {
	findElementsInBox: (box: { x: number; y: number; width: number; height: number }) => string[]
}

describe("SelectionTool pending direct drag", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("registers window mouseup and clears pending drag on mouseup", () => {
		const node = createNode()
		const tool = createTool(node) as unknown as SelectionToolPrivate
		const addSpy = vi.spyOn(window, "addEventListener")
		const removeSpy = vi.spyOn(window, "removeEventListener")

		tool.armPendingDirectDrag(
			new MouseEvent("mousedown", {
				clientX: 10,
				clientY: 10,
			}),
			"element-1",
		)

		expect(addSpy).toHaveBeenCalledWith("mousemove", expect.any(Function))
		expect(addSpy).toHaveBeenCalledWith("mouseup", expect.any(Function))

		window.dispatchEvent(new MouseEvent("mouseup"))

		expect(tool.pendingDirectDrag).toBeNull()
		expect(removeSpy).toHaveBeenCalledWith("mousemove", expect.any(Function))
		expect(removeSpy).toHaveBeenCalledWith("mouseup", expect.any(Function))
	})

	it("starts dragging after the pointer moves past node dragDistance", () => {
		const node = createNode()
		const tool = createTool(node) as unknown as SelectionToolPrivate

		tool.armPendingDirectDrag(
			new MouseEvent("mousedown", {
				clientX: 0,
				clientY: 0,
			}),
			"element-1",
		)
		window.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 10,
				clientY: 0,
				buttons: 1,
			}),
		)

		expect(node.startDrag).toHaveBeenCalledTimes(1)
		expect(tool.pendingDirectDrag).toBeNull()
	})

	it("starts multi-selection proxy drag after the pointer moves past proxy dragDistance", () => {
		const beginTransformInteractionIntent = vi.fn()
		const clearTransformInteractionIntent = vi.fn()
		const startMultiSelectionProxyDrag = vi.fn(() => true)
		const canvas = {
			contentLayer: {},
			selectionManager: {
				getSelectedIds: () => ["element-1", "element-2"],
			},
			transformManager: {
				beginTransformInteractionIntent,
				clearTransformInteractionIntent,
				getMultiSelectionDragDistance: () => 3,
				startMultiSelectionProxyDrag,
			},
		} as unknown as Canvas
		const tool = new SelectionTool({ canvas }) as unknown as SelectionToolPrivate

		tool.armPendingMultiSelectionDrag(
			new MouseEvent("mousedown", {
				clientX: 0,
				clientY: 0,
			}),
			"element-1",
		)
		window.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 10,
				clientY: 0,
				buttons: 1,
			}),
		)

		expect(beginTransformInteractionIntent).toHaveBeenCalledWith(["element-1", "element-2"])
		expect(startMultiSelectionProxyDrag).toHaveBeenCalledTimes(1)
		expect(clearTransformInteractionIntent).not.toHaveBeenCalled()
		expect(tool.pendingDirectDrag).toBeNull()
	})

	it("uses spatial candidates while preserving top-level and permission filters", () => {
		const box = { x: 0, y: 0, width: 100, height: 100 }
		const elementsById = new Map<string, LayerElement>([
			[
				"visible",
				{
					id: "visible",
					type: "rectangle",
					x: 10,
					y: 10,
					width: 20,
					height: 20,
				},
			],
			[
				"outside",
				{
					id: "outside",
					type: "rectangle",
					x: 150,
					y: 150,
					width: 20,
					height: 20,
				},
			],
			[
				"locked",
				{
					id: "locked",
					type: "rectangle",
					locked: true,
					x: 10,
					y: 10,
					width: 20,
					height: 20,
				},
			],
		])
		const queryElementIdsByExpandedRect = vi.fn(() => [
			"child",
			"visible",
			"outside",
			"locked",
			"missing",
		])
		const getElementData = vi.fn((elementId: string) => elementsById.get(elementId))
		const findParentIdForElement = vi.fn((elementId: string) =>
			elementId === "child" ? "frame" : undefined,
		)
		const canvas = {
			geometryCacheManager: {
				queryElementIdsByExpandedRect,
			},
			elementManager: {
				findParentIdForElement,
				getElementData,
			},
			permissionManager: {
				canSelect: (element: LayerElement) => !element.locked,
			},
		} as unknown as Canvas
		const tool = new SelectionTool({ canvas }) as unknown as SelectionToolBoxPrivate

		expect(tool.findElementsInBox(box)).toEqual(["visible"])
		expect(queryElementIdsByExpandedRect).toHaveBeenCalledWith(box, 0)
		expect(getElementData).not.toHaveBeenCalledWith("child")
	})
})
