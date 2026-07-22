import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElementCornerActionsDecorator } from "../ElementCornerActionsDecorator"
import { COLORS } from "../../image/ImageElement.config"

function createEventEmitterMock() {
	const handlers = new Map<string, Array<(event: { data?: unknown }) => void>>()

	return {
		handlers,
		eventEmitter: {
			on: vi.fn((eventType: string, handler: (event: { data?: unknown }) => void) => {
				const currentHandlers = handlers.get(eventType) ?? []
				currentHandlers.push(handler)
				handlers.set(eventType, currentHandlers)
				return () => {
					const nextHandlers = handlers
						.get(eventType)
						?.filter((currentHandler) => currentHandler !== handler)
					handlers.set(eventType, nextHandlers ?? [])
				}
			}),
			off: vi.fn((eventType: string, handler: (event: { data?: unknown }) => void) => {
				const nextHandlers = handlers
					.get(eventType)
					?.filter((currentHandler) => currentHandler !== handler)
				handlers.set(eventType, nextHandlers ?? [])
			}),
			emit: vi.fn(),
		},
	}
}

function createStageGroup() {
	const container = document.createElement("div")
	document.body.appendChild(container)

	const stage = new Konva.Stage({
		container,
		width: 500,
		height: 500,
	})
	stage.scale({ x: 1, y: 1 })
	const layer = new Konva.Layer()
	stage.add(layer)
	const group = new Konva.Group({ width: 120, height: 80 })
	layer.add(group)

	return { container, group, stage }
}

function createCanvasMock(
	options: {
		hoveredElementId?: string | null
		selected?: boolean
		selectionCount?: number
		touch?: boolean
		connectionDragging?: boolean
	} = {},
) {
	const { handlers, eventEmitter } = createEventEmitterMock()
	let hoveredElementId = options.hoveredElementId ?? null
	let selected = options.selected ?? false
	let selectionCount = options.selectionCount ?? (selected ? 1 : 0)
	let connectionDragging = options.connectionDragging ?? false

	return {
		canvas: {
			cursorManager: {
				restoreToolCursor: vi.fn(),
				setTemporary: vi.fn(),
			},
			deviceInfo: {
				formFactor: "desktop",
				layout: "regular",
				input: {
					touch: options.touch ?? false,
					coarsePointer: options.touch ?? false,
					hover: !(options.touch ?? false),
				},
			},
			eventEmitter,
			hoverManager: {
				getHoveredElementId: vi.fn(() => hoveredElementId),
			},
			connectionDragManager: {
				isDraggingConnection: vi.fn(() => connectionDragging),
			},
			permissionManager: {
				canUseSelectionToolAffordance: vi.fn(() => true),
			},
			selectionManager: {
				getSelectionCount: vi.fn(() => selectionCount),
				isSelected: vi.fn(() => selected),
				replaceSelection: vi.fn(),
			},
		},
		handlers,
		setHoveredElementId: (nextElementId: string | null) => {
			hoveredElementId = nextElementId
		},
		setSelected: (nextSelected: boolean) => {
			selected = nextSelected
			selectionCount = nextSelected ? Math.max(selectionCount, 1) : 0
		},
		setSelectionCount: (nextSelectionCount: number) => {
			selectionCount = nextSelectionCount
		},
		setConnectionDragging: (nextConnectionDragging: boolean) => {
			connectionDragging = nextConnectionDragging
		},
	}
}

function createDecorator(
	group: Konva.Group,
	canvas: ReturnType<typeof createCanvasMock>["canvas"],
) {
	return new ElementCornerActionsDecorator(group, {
		elementId: "image-1",
		canvas: canvas as never,
		width: 120,
		height: 80,
		actions: [
			{
				key: "fullscreen",
				placement: "bottom-right",
				icon: "fullscreen",
				onClick: vi.fn(),
			},
		],
	})
}

describe("ElementCornerActionsDecorator", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			scale: vi.fn(),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it("restores visible actions from the current hovered element when recreated", () => {
		const { group, stage } = createStageGroup()
		const { canvas } = createCanvasMock({ hoveredElementId: "image-1" })
		const decorator = createDecorator(group, canvas)

		decorator.create()

		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(true)

		decorator.destroy()
		stage.destroy()
	})

	it("updates action visibility when global hover changes", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setHoveredElementId } = createCanvasMock()
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(false)

		setHoveredElementId("image-1")
		handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(rootGroup?.visible()).toBe(true)

		setHoveredElementId(null)
		handlers.get("element:hover")?.[0]?.({ data: { elementId: null } })
		expect(rootGroup?.visible()).toBe(false)

		decorator.destroy()
		stage.destroy()
	})

	it("keeps actions hidden while a connection drag is active", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setConnectionDragging, setHoveredElementId } = createCanvasMock()
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(false)

		setConnectionDragging(true)
		setHoveredElementId("image-1")
		handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(rootGroup?.visible()).toBe(false)

		setConnectionDragging(false)
		handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(rootGroup?.visible()).toBe(true)

		decorator.destroy()
		stage.destroy()
	})

	it("keeps actions hidden when the hovered element is part of a multi-selection", () => {
		const { group, stage } = createStageGroup()
		const { canvas } = createCanvasMock({
			hoveredElementId: "image-1",
			selected: true,
			selectionCount: 2,
		})
		const decorator = createDecorator(group, canvas)

		decorator.create()

		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(false)

		decorator.destroy()
		stage.destroy()
	})

	it("hides visible actions when selection changes from single to multiple", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setSelectionCount } = createCanvasMock({
			hoveredElementId: "image-1",
			selected: true,
			selectionCount: 1,
		})
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(true)

		setSelectionCount(2)
		handlers.get("element:select")?.[0]?.({ data: { elementIds: ["image-1", "image-2"] } })
		expect(rootGroup?.visible()).toBe(false)

		group.fire("mouseenter")
		expect(rootGroup?.visible()).toBe(false)

		decorator.destroy()
		stage.destroy()
	})

	it("shows actions for a selected element on touch devices", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setSelected } = createCanvasMock({ touch: true })
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(false)

		setSelected(true)
		handlers.get("element:select")?.[0]?.({ data: { elementIds: ["image-1"] } })
		expect(rootGroup?.visible()).toBe(true)

		decorator.destroy()
		stage.destroy()
	})

	it("hides touch actions when deselected or dragging starts", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setSelected } = createCanvasMock({ selected: true, touch: true })
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(true)

		setSelected(false)
		handlers.get("element:deselect")?.[0]?.({})
		expect(rootGroup?.visible()).toBe(false)

		setSelected(true)
		handlers.get("element:select")?.[0]?.({ data: { elementIds: ["image-1"] } })
		expect(rootGroup?.visible()).toBe(true)

		group.fire("dragstart")
		expect(rootGroup?.visible()).toBe(false)

		decorator.destroy()
		stage.destroy()
	})

	it("uses touch active feedback without entering the mouse hover cursor path", () => {
		const { group, stage } = createStageGroup()
		const { canvas } = createCanvasMock({ selected: true, touch: true })
		const decorator = createDecorator(group, canvas)

		decorator.create()
		const buttonBg = group.findOne<Konva.Rect>(".decorator-corner-action-fullscreen-button")
		expect(buttonBg).toBeTruthy()

		buttonBg?.fire("touchstart", { evt: new Event("touchstart") })
		expect(buttonBg?.fill()).toBe(COLORS.BUTTON_BG_HOVER)
		expect(canvas.cursorManager.setTemporary).not.toHaveBeenCalled()

		buttonBg?.fire("touchend", { evt: new Event("touchend") })
		expect(buttonBg?.fill()).toBe(COLORS.BUTTON_BG)
		expect(canvas.cursorManager.restoreToolCursor).not.toHaveBeenCalled()

		decorator.destroy()
		stage.destroy()
	})
})
