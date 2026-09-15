import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BorderDecorator } from "../BorderDecorator"
import { DECORATOR_CONFIG } from "../DecoratorConfig"

function createEventEmitterMock() {
	const handlers = new Map<string, Array<() => void>>()
	return {
		handlers,
		eventEmitter: {
			on: vi.fn((eventType: string, handler: () => void) => {
				const currentHandlers = handlers.get(eventType) ?? []
				currentHandlers.push(handler)
				handlers.set(eventType, currentHandlers)
			}),
			off: vi.fn((eventType: string, handler: () => void) => {
				handlers.set(
					eventType,
					(handlers.get(eventType) ?? []).filter((current) => current !== handler),
				)
			}),
		},
	}
}

describe("BorderDecorator", () => {
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

	it("updates only stroke width during viewport scaling and leaves drawing to the stage", () => {
		const previousAutoDrawEnabled = Konva.autoDrawEnabled
		Konva.autoDrawEnabled = false
		try {
			const container = document.createElement("div")
			document.body.appendChild(container)
			const stage = new Konva.Stage({ container, width: 500, height: 500 })
			const layer = new Konva.Layer()
			stage.add(layer)
			const group = new Konva.Group({ width: 120, height: 80, scaleX: 0.5, scaleY: 0.5 })
			layer.add(group)
			const { eventEmitter, handlers } = createEventEmitterMock()
			const isSelected = vi.fn(() => false)
			const decorator = new BorderDecorator(group, 120, 80, {
				isAnimated: false,
				elementId: "image-1",
				canvas: { eventEmitter, selectionManager: { isSelected } } as never,
			})

			decorator.create()
			const border = group.findOne<Konva.Rect>(".decorator-border")
			const layerDrawSpy = vi.spyOn(layer, "batchDraw")
			isSelected.mockClear()

			stage.scale({ x: 2, y: 2 })
			handlers.get("viewport:scale")?.[0]?.()

			expect(border?.strokeWidth()).toBeCloseTo(DECORATOR_CONFIG.BORDER_WIDTH)
			expect(isSelected).not.toHaveBeenCalled()
			expect(layerDrawSpy).not.toHaveBeenCalled()

			isSelected.mockReturnValue(true)
			handlers.get("element:select")?.[0]?.()
			expect(border?.visible()).toBe(false)
			expect(layerDrawSpy).toHaveBeenCalledTimes(1)

			const groupOffSpy = vi.spyOn(group, "off")
			decorator.destroy()
			expect(groupOffSpy).toHaveBeenCalledWith("transform", expect.any(Function))
			stage.destroy()
		} finally {
			Konva.autoDrawEnabled = previousAutoDrawEnabled
		}
	})
})
