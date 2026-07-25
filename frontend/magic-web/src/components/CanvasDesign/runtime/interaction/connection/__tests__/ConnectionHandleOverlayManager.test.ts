import Konva from "konva"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { EventEmitter } from "../../../core/EventEmitter"
import {
	ElementTypeEnum,
	ToolTypeEnum,
	type CanvasDeviceInfo,
	type LayerElement,
} from "../../../document/types"
import { ConnectionHandleOverlayManager } from "../ConnectionHandleOverlayManager"
import { ConnectionHandleRenderer } from "../ConnectionHandleRenderer"

beforeAll(() => {
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => ({
			arc: vi.fn(),
			beginPath: vi.fn(),
			bezierCurveTo: vi.fn(),
			clearRect: vi.fn(),
			clip: vi.fn(),
			closePath: vi.fn(),
			drawImage: vi.fn(),
			fill: vi.fn(),
			fillRect: vi.fn(),
			fillText: vi.fn(),
			getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
			lineTo: vi.fn(),
			measureText: vi.fn(() => ({ width: 0 })),
			moveTo: vi.fn(),
			rect: vi.fn(),
			restore: vi.fn(),
			save: vi.fn(),
			scale: vi.fn(),
			setTransform: vi.fn(),
			stroke: vi.fn(),
			transform: vi.fn(),
			translate: vi.fn(),
		})),
	})
})

function createDeviceInfo(overrides?: Partial<CanvasDeviceInfo>): CanvasDeviceInfo {
	return {
		formFactor: overrides?.formFactor ?? "desktop",
		layout: overrides?.layout ?? "regular",
		input: {
			touch: overrides?.input?.touch ?? false,
			coarsePointer: overrides?.input?.coarsePointer ?? false,
			hover: overrides?.input?.hover ?? true,
		},
	}
}

function createTouchDeviceInfo(): CanvasDeviceInfo {
	return createDeviceInfo({
		formFactor: "tablet",
		input: {
			touch: true,
			coarsePointer: true,
			hover: false,
		},
	})
}

function createCanvasStub(
	options: {
		readonly?: boolean
		selectedIds?: string[]
		hoveredElementId?: string | null
		selectionToolActive?: boolean
		transformActive?: boolean
		dragging?: boolean
		connectionDragging?: boolean
		visible?: boolean
		extendingElementId?: string | null
		useRealLayer?: boolean
		deviceInfo?: CanvasDeviceInfo
		pointerPosition?: { x: number; y: number } | null
	} = {},
) {
	const state = {
		readonly: options.readonly ?? false,
		selectedIds: options.selectedIds ?? [],
		hoveredElementId: options.hoveredElementId ?? null,
		selectionToolActive: options.selectionToolActive ?? true,
		transformActive: options.transformActive ?? false,
		dragging: options.dragging ?? false,
		connectionDragging: options.connectionDragging ?? false,
		visible: options.visible ?? true,
		extendingElementId: options.extendingElementId ?? null,
		bounds: { x: 10, y: 20, width: 120, height: 80 },
		pointerPosition: options.pointerPosition ?? null,
		elementIds: new Set(["element-1", "element-2"]),
		elementTypes: new Map<string, LayerElement["type"]>(),
		deviceInfo: options.deviceInfo ?? createDeviceInfo(),
	}
	const stage = new Konva.Group() as Konva.Group & {
		getPointerPosition: () => { x: number; y: number } | null
	}
	stage.getPointerPosition = vi.fn(() => state.pointerPosition) as never
	const controlsLayer = options.useRealLayer ? new Konva.Layer() : new Konva.Group()
	const eventEmitter = new EventEmitter()
	const requestLayerDraw = vi.fn()
	const cursorManager = {
		setTemporary: vi.fn(),
		restoreToolCursor: vi.fn(),
	}
	const connectionDragManager = {
		startFromHandle: vi.fn(),
		releasePendingHandleInteraction: vi.fn(),
		isDraggingConnection: () => state.connectionDragging,
	}
	const getElementData = vi.fn((elementId: string): LayerElement | undefined => {
		if (!state.elementIds.has(elementId)) return undefined
		return {
			id: elementId,
			type: state.elementTypes.get(elementId) ?? ElementTypeEnum.Text,
			x: 10,
			y: 20,
			width: 120,
			height: 80,
			visible: state.visible,
		}
	})
	const canvas = {
		get readonly() {
			return state.readonly
		},
		get deviceInfo() {
			return state.deviceInfo
		},
		set deviceInfo(deviceInfo: CanvasDeviceInfo) {
			state.deviceInfo = deviceInfo
		},
		stage,
		controlsLayer,
		eventEmitter,
		runtimeScheduler: { requestLayerDraw },
		cursorManager,
		connectionDragManager,
		selectionManager: {
			getSelectedIds: () => state.selectedIds,
		},
		hoverManager: {
			getHoveredElementId: () => state.hoveredElementId,
		},
		elementManager: {
			hasElement: (elementId: string) => state.elementIds.has(elementId),
			getElementData,
			getNodeAdapter: () => ({
				getElementBounds: () => state.bounds,
			}),
		},
		permissionManager: {
			canUseSelectionToolAffordance: () => state.selectionToolActive,
			canHover: (element: LayerElement | undefined) => !!element && state.visible,
			canConnect: (element: LayerElement | undefined) =>
				!!element &&
				state.visible &&
				element.interactionConfig?.connectable !== false &&
				element.type !== ElementTypeEnum.Frame &&
				element.type !== ElementTypeEnum.Group,
		},
		transformManager: {
			isTransformInteractionActive: () => state.transformActive,
			isDraggingElement: () => state.dragging,
		},
		extendManager: {
			getExtendingElementId: () => state.extendingElementId,
		},
	} as unknown as Canvas

	const manager = new ConnectionHandleOverlayManager({ canvas })

	return {
		canvas,
		controlsLayer,
		manager,
		requestLayerDraw,
		cursorManager,
		connectionDragManager,
		state,
	}
}

function getOverlay(controlsLayer: Konva.Container): Konva.Group | null {
	const overlay = controlsLayer.findOne(`.${ConnectionHandleRenderer.OVERLAY_GROUP_NAME}`)
	return overlay instanceof Konva.Group ? overlay : null
}

function getRequiredOverlay(controlsLayer: Konva.Container): Konva.Group {
	const overlay = getOverlay(controlsLayer)
	if (!overlay) {
		throw new Error("Expected connection handle overlay")
	}
	return overlay
}

function getExitingOverlay(controlsLayer: Konva.Container): Konva.Group | null {
	const overlay = controlsLayer.findOne(`.${ConnectionHandleRenderer.EXITING_OVERLAY_GROUP_NAME}`)
	return overlay instanceof Konva.Group ? overlay : null
}

function getHandle(overlay: Konva.Group, side: "left" | "right"): Konva.Group {
	const handle = overlay
		.find(`.${ConnectionHandleRenderer.HANDLE_GROUP_NAME}`)
		.find((node) => node.getAttr("connectionHandleSide") === side)
	if (!(handle instanceof Konva.Group)) {
		throw new Error(`Expected ${side} handle to be a group`)
	}
	return handle
}

function getCircle(handle: Konva.Group): Konva.Circle {
	const circle = handle.findOne(`.${ConnectionHandleRenderer.HANDLE_CIRCLE_NAME}`)
	if (!(circle instanceof Konva.Circle)) {
		throw new Error("Expected handle circle")
	}
	return circle
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve()
}

describe("ConnectionHandleOverlayManager", () => {
	it("shows handles for the hovered element when there is no selection", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getRequiredOverlay(controlsLayer)
		const leftHandlePosition = getHandle(overlay, "left").position()
		const rightHandlePosition = getHandle(overlay, "right").position()
		expect(leftHandlePosition.y).toBe(state.bounds.y + state.bounds.height / 2)
		expect(rightHandlePosition.y).toBe(state.bounds.y + state.bounds.height / 2)
		expect(leftHandlePosition.x).toBeLessThan(state.bounds.x)
		expect(rightHandlePosition.x).toBeGreaterThan(state.bounds.x + state.bounds.width)
		expect(state.bounds.x - leftHandlePosition.x).toBeCloseTo(
			rightHandlePosition.x - state.bounds.x - state.bounds.width,
		)

		manager.destroy()
	})

	it("starts the enter animation from an inward offset with handles faded out", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			useRealLayer: true,
		})
		const finalOverlay = new ConnectionHandleRenderer().createOverlay(
			"element-1",
			state.bounds,
			1,
		)
		const finalLeftX = getHandle(finalOverlay, "left").x()
		const finalRightX = getHandle(finalOverlay, "right").x()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getRequiredOverlay(controlsLayer)
		const leftHandle = getHandle(overlay, "left")
		const rightHandle = getHandle(overlay, "right")
		expect(leftHandle.opacity()).toBeLessThan(0.05)
		expect(rightHandle.opacity()).toBeLessThan(0.05)
		expect(leftHandle.x()).toBeGreaterThan(finalLeftX)
		expect(leftHandle.x()).toBeLessThan(state.bounds.x)
		expect(rightHandle.x()).toBeLessThan(finalRightX)
		expect(rightHandle.x()).toBeGreaterThan(state.bounds.x + state.bounds.width)

		finalOverlay.destroy()
		manager.destroy()
	})

	it("hides handles when the element is too small on screen", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub()

		canvas.stage.scale({ x: 0.25, y: 0.25 })
		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		expect(getOverlay(controlsLayer)).toBeNull()

		canvas.stage.scale({ x: 1, y: 1 })
		canvas.eventEmitter.emit({ type: "viewport:scale", data: { scale: 1 } })

		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)
		manager.destroy()
	})

	it("shows handles for elongated elements when the minor axis remains usable", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub()
		state.bounds = { x: 10, y: 20, width: 400, height: 24 }

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)
		manager.destroy()
	})

	it("does not show handles for non-connectable container elements", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub()
		state.elementTypes.set("element-1", ElementTypeEnum.Frame)
		state.elementTypes.set("element-2", ElementTypeEnum.Group)

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeNull()

		state.hoveredElementId = "element-2"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })
		expect(getOverlay(controlsLayer)).toBeNull()

		manager.destroy()
	})

	it("keeps handles alive while the pointer is inside the overlay corridor", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getOverlay(controlsLayer)
		expect(overlay).toBeInstanceOf(Konva.Group)

		overlay?.fire("mouseenter")
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getOverlay(controlsLayer)).toBe(overlay)

		overlay?.fire("mouseleave")

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("keeps hovered handles alive by the same geometry as the transparent corridor", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
			pointerPosition: { x: 140, y: 60 },
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		const overlay = getRequiredOverlay(controlsLayer)

		canvas.stage.fire("mousemove")
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getOverlay(controlsLayer)).toBe(overlay)

		state.pointerPosition = { x: 220, y: 60 }
		canvas.stage.fire("mousemove")

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("keeps selected hovered handles alive by geometry when overlay mouseenter is blocked", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			hoveredElementId: "element-1",
			pointerPosition: { x: 140, y: 60 },
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		const overlay = getRequiredOverlay(controlsLayer)

		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getOverlay(controlsLayer)).toBe(overlay)

		state.pointerPosition = { x: 220, y: 60 }
		canvas.stage.fire("mousemove")

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("clears geometry-kept handles when the pointer leaves the stage", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			hoveredElementId: "element-1",
			pointerPosition: { x: 140, y: 60 },
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		canvas.stage.fire("mouseleave")

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("keeps handle overlay visible while the handle connection menu is open", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		const overlay = getRequiredOverlay(controlsLayer)

		canvas.eventEmitter.emit({
			type: "connection:menu:open",
			data: {
				originElementId: "element-1",
				originSide: "right",
				x: 120,
				y: 60,
				canvasX: 140,
				canvasY: 60,
				source: "handle",
			},
		})
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })
		canvas.stage.fire("mouseleave")

		expect(getOverlay(controlsLayer)).toBe(overlay)

		canvas.eventEmitter.emit({
			type: "connection:menu:close",
			data: {
				originElementId: "element-1",
				originSide: "right",
				source: "handle",
			},
		})

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("applies hover and active handle states with pointer cursor", () => {
		const { canvas, connectionDragManager, controlsLayer, cursorManager, manager, state } =
			createCanvasStub()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getRequiredOverlay(controlsLayer)
		const leftHandle = getHandle(overlay, "left")
		const circle = getCircle(leftHandle)
		const idleFill = circle.fill()
		const idleShadowOpacity = circle.shadowOpacity()

		leftHandle.fire("mouseenter")

		expect(cursorManager.setTemporary).toHaveBeenLastCalledWith("pointer")
		expect(leftHandle.getAttr("connectionHandleInteractionState")).toBe("hover")
		expect(circle.fill()).not.toBe(idleFill)
		expect(circle.shadowOpacity()).toBeGreaterThan(idleShadowOpacity)

		const hoverFill = circle.fill()
		const nativeEvent = {
			stopImmediatePropagation: vi.fn(),
			stopPropagation: vi.fn(),
		}
		const eventPayload = { evt: nativeEvent }
		leftHandle.fire("mousedown", eventPayload)

		expect(eventPayload).toMatchObject({ cancelBubble: true })
		expect(nativeEvent.stopPropagation).toHaveBeenCalled()
		expect(nativeEvent.stopImmediatePropagation).toHaveBeenCalled()
		expect(leftHandle.getAttr("connectionHandleInteractionState")).toBe("active")
		expect(circle.fill()).not.toBe(hoverFill)
		expect(cursorManager.setTemporary).toHaveBeenLastCalledWith("pointer")
		expect(connectionDragManager.startFromHandle).toHaveBeenCalledWith({
			elementId: "element-1",
			side: "left",
			event: expect.objectContaining(eventPayload),
		})

		leftHandle.fire("mouseup", { evt: nativeEvent })

		expect(leftHandle.getAttr("connectionHandleInteractionState")).toBe("hover")
		expect(connectionDragManager.releasePendingHandleInteraction).toHaveBeenCalledTimes(1)
		expect(cursorManager.restoreToolCursor).not.toHaveBeenCalled()

		leftHandle.fire("mouseleave")

		expect(leftHandle.getAttr("connectionHandleInteractionState")).toBe("idle")
		expect(circle.fill()).toBe(idleFill)
		expect(cursorManager.restoreToolCursor).toHaveBeenCalledTimes(1)
		manager.destroy()
	})

	it("restores the tool cursor when a hovered handle is destroyed", () => {
		const { canvas, controlsLayer, cursorManager, manager, state } = createCanvasStub()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getRequiredOverlay(controlsLayer)
		getHandle(overlay, "right").fire("mouseenter")

		manager.destroy()

		expect(cursorManager.restoreToolCursor).toHaveBeenCalledTimes(1)
	})

	it("uses hover-only handles on desktop even when a single element is selected", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})

		expect(getOverlay(controlsLayer)).toBeNull()

		state.hoveredElementId = "element-2"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })

		const overlays = controlsLayer.find(`.${ConnectionHandleRenderer.OVERLAY_GROUP_NAME}`)
		expect(overlays).toHaveLength(1)
		const overlay = overlays[0]
		expect(overlay).toBeInstanceOf(Konva.Group)
		expect(getHandle(overlay as Konva.Group, "right").id()).toBe("element-2")

		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("shows handles on desktop when hovering the single selected element", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		state.hoveredElementId = "element-1"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-1")
		expect(getHandle(overlay, "right").id()).toBe("element-1")
		manager.destroy()
	})

	it("uses selected-element handles on touch devices and keeps hover priority", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})

		expect(controlsLayer.find(`.${ConnectionHandleRenderer.OVERLAY_GROUP_NAME}`)).toHaveLength(
			1,
		)
		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-1")

		state.hoveredElementId = "element-2"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })

		expect(controlsLayer.find(`.${ConnectionHandleRenderer.OVERLAY_GROUP_NAME}`)).toHaveLength(
			1,
		)
		expect(getHandle(overlay, "right").id()).toBe("element-2")

		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(controlsLayer.find(`.${ConnectionHandleRenderer.OVERLAY_GROUP_NAME}`)).toHaveLength(
			1,
		)
		expect(getHandle(overlay, "right").id()).toBe("element-1")

		manager.destroy()
	})

	it("refreshes selected-element handles when device capabilities change", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		const desktopDeviceInfo = state.deviceInfo
		const touchDeviceInfo = createTouchDeviceInfo()
		state.deviceInfo = touchDeviceInfo
		canvas.eventEmitter.emit({
			type: "canvas:devicechange",
			data: { previous: desktopDeviceInfo, current: touchDeviceInfo },
		})

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-1")

		state.deviceInfo = desktopDeviceInfo
		canvas.eventEmitter.emit({
			type: "canvas:devicechange",
			data: { previous: touchDeviceInfo, current: desktopDeviceInfo },
		})

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("keeps hovered handles alive over the overlay before hiding on desktop", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			hoveredElementId: "element-2",
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-2")

		overlay.fire("mouseenter")
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getHandle(overlay, "left").id()).toBe("element-2")

		overlay.fire("mouseleave")

		expect(getOverlay(controlsLayer)).toBeNull()

		manager.destroy()
	})

	it("keeps hovered handles alive over the overlay before falling back to selection on touch", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			hoveredElementId: "element-2",
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-2")

		overlay.fire("mouseenter")
		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })

		expect(getHandle(overlay, "left").id()).toBe("element-2")

		overlay.fire("mouseleave")

		expect(getHandle(overlay, "left").id()).toBe("element-1")

		manager.destroy()
	})

	it("hides handles for multi-selection", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.selectedIds = ["element-1", "element-2"]
		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1", "element-2"] },
		})

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("hides handles when readonly, off selection tool, or transform is active", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.readonly = true
		canvas.eventEmitter.emit({ type: "canvas:readonly", data: { readonly: true } })
		expect(getOverlay(controlsLayer)).toBeNull()

		state.readonly = false
		state.selectionToolActive = false
		canvas.eventEmitter.emit({ type: "tool:change", data: { tool: null } })
		expect(getOverlay(controlsLayer)).toBeNull()

		state.selectionToolActive = true
		canvas.eventEmitter.emit({ type: "tool:change", data: { tool: ToolTypeEnum.Select } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.transformActive = true
		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		manager.destroy()
	})

	it("keeps handles hidden while a connection drag is active", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.connectionDragging = true
		manager.refresh()
		expect(getOverlay(controlsLayer)).toBeNull()

		state.hoveredElementId = "element-2"
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-2" } })
		expect(getOverlay(controlsLayer)).toBeNull()

		state.connectionDragging = false
		manager.refresh()

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-2")
		manager.destroy()
	})

	it("hides immediately on transform start without leaving an exit animation", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
			useRealLayer: true,
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.transformActive = true
		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1"] },
		})

		expect(getOverlay(controlsLayer)).toBeNull()
		expect(getExitingOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("destroys an already exiting handle overlay when transform drag starts", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
			useRealLayer: true,
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.hoveredElementId = null
		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: null } })
		expect(getOverlay(controlsLayer)).toBeNull()
		expect(getExitingOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1"] },
		})

		expect(getExitingOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("hides immediately when a direct element drag starts", () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			hoveredElementId: "element-1",
			useRealLayer: true,
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		canvas.eventEmitter.emit({
			type: "element:dragstart",
			data: { elementId: "element-1" },
		})

		expect(getOverlay(controlsLayer)).toBeNull()
		expect(getExitingOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("hides immediately when Konva reports a node dragstart on the stage", () => {
		const { canvas, controlsLayer, manager } = createCanvasStub({
			hoveredElementId: "element-1",
			useRealLayer: true,
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		canvas.stage.fire("dragstart")

		expect(getOverlay(controlsLayer)).toBeNull()
		expect(getExitingOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("restores handles for a single selected element after transform dragend settles", async () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.dragging = true
		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		canvas.eventEmitter.emit({
			type: "elements:transform:dragend",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		state.dragging = false
		await flushMicrotasks()

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "left").id()).toBe("element-1")
		manager.destroy()
	})

	it("keeps selected-element handles hidden after transform dragend settles on desktop", async () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			hoveredElementId: "element-1",
		})

		canvas.eventEmitter.emit({ type: "element:hover", data: { elementId: "element-1" } })
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.dragging = true
		state.hoveredElementId = null
		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		canvas.eventEmitter.emit({
			type: "elements:transform:dragend",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		state.dragging = false
		await flushMicrotasks()

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("restores handles for a single selected element after anchor transform settles", async () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.transformActive = true
		canvas.eventEmitter.emit({
			type: "elements:transform:anchorDragStart",
			data: { elementIds: ["element-1"], activeAnchor: "middle-right" },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		canvas.eventEmitter.emit({
			type: "elements:transform:anchorDragend",
			data: { elementIds: ["element-1"], activeAnchor: "middle-right" },
		})
		expect(getOverlay(controlsLayer)).toBeNull()

		state.transformActive = false
		await flushMicrotasks()

		const overlay = getRequiredOverlay(controlsLayer)
		expect(getHandle(overlay, "right").id()).toBe("element-1")
		manager.destroy()
	})

	it("keeps handles hidden for multi-selection after transform dragend settles", async () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1", "element-2"],
		})

		state.dragging = true
		canvas.eventEmitter.emit({
			type: "elements:transform:dragstart",
			data: { elementIds: ["element-1", "element-2"] },
		})
		canvas.eventEmitter.emit({
			type: "elements:transform:dragend",
			data: { elementIds: ["element-1", "element-2"] },
		})

		state.dragging = false
		await flushMicrotasks()

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})

	it("keeps handles hidden after resize when the element is below the screen-size threshold", async () => {
		const { canvas, controlsLayer, manager, state } = createCanvasStub({
			selectedIds: ["element-1"],
			deviceInfo: createTouchDeviceInfo(),
		})

		canvas.eventEmitter.emit({
			type: "element:select",
			data: { elementIds: ["element-1"] },
		})
		expect(getOverlay(controlsLayer)).toBeInstanceOf(Konva.Group)

		state.transformActive = true
		canvas.eventEmitter.emit({
			type: "elements:transform:anchorDragStart",
			data: { elementIds: ["element-1"], activeAnchor: "bottom-right" },
		})
		state.bounds = { x: 10, y: 20, width: 40, height: 40 }
		canvas.eventEmitter.emit({
			type: "elements:transform:anchorDragend",
			data: { elementIds: ["element-1"], activeAnchor: "bottom-right" },
		})

		state.transformActive = false
		await flushMicrotasks()

		expect(getOverlay(controlsLayer)).toBeNull()
		manager.destroy()
	})
})
