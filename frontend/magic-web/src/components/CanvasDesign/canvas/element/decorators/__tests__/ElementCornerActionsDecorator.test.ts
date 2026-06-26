import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElementCornerActionsDecorator } from "../ElementCornerActionsDecorator"

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

function createCanvasMock(options: { hoveredElementId?: string | null; selected?: boolean } = {}) {
	const { handlers, eventEmitter } = createEventEmitterMock()
	let hoveredElementId = options.hoveredElementId ?? null

	return {
		canvas: {
			cursorManager: {
				restoreToolCursor: vi.fn(),
				setTemporary: vi.fn(),
			},
			eventEmitter,
			hoverManager: {
				getHoveredElementId: vi.fn(() => hoveredElementId),
			},
			permissionManager: {
				canUseSelectionToolAffordance: vi.fn(() => true),
			},
			selectionManager: {
				isSelected: vi.fn(() => options.selected ?? false),
				replaceSelection: vi.fn(),
			},
		},
		handlers,
		setHoveredElementId: (nextElementId: string | null) => {
			hoveredElementId = nextElementId
		},
	}
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
		const decorator = new ElementCornerActionsDecorator(group, {
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

		decorator.create()

		const rootGroup = group.findOne(".decorator-corner-actions")
		expect(rootGroup?.visible()).toBe(true)

		decorator.destroy()
		stage.destroy()
	})

	it("updates action visibility when global hover changes", () => {
		const { group, stage } = createStageGroup()
		const { canvas, handlers, setHoveredElementId } = createCanvasMock()
		const decorator = new ElementCornerActionsDecorator(group, {
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
})
