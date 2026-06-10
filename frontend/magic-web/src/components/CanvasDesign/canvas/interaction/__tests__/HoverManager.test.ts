import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HoverManager } from "../HoverManager"
import type { LayerElement } from "../../types"

interface HoverManagerPrivate {
	handleMouseMove: (event: { target: Konva.Node }) => void
	hoverNode: Konva.Node | null
	hoveredElementId: string | null
	destroy: () => void
}

function installRafMock() {
	const callbacks: FrameRequestCallback[] = []
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => {
			callbacks.push(callback)
			return callbacks.length
		}),
	)
	vi.stubGlobal("cancelAnimationFrame", vi.fn())
	return {
		flush: () => {
			const callback = callbacks.shift()
			callback?.(0)
		},
		count: () => callbacks.length,
	}
}

function createHoverManager(
	options: {
		transformActive?: boolean | (() => boolean)
		selected?: boolean
	} = {},
) {
	const stage = new Konva.Group()
	const controlsLayer = new Konva.Group()
	const requestLayerDraw = vi.fn()
	const emit = vi.fn()
	const elementData: LayerElement = {
		id: "element-1",
		type: "rectangle",
		x: 10,
		y: 20,
		width: 120,
		height: 80,
	}
	const canvas = {
		stage,
		controlsLayer,
		runtimeScheduler: { requestLayerDraw },
		eventEmitter: {
			on: vi.fn(),
			off: vi.fn(),
			emit,
		},
		elementManager: {
			hasElement: (elementId: string) => elementId === "element-1",
			getElementData: () => elementData,
			getElementInstance: () => undefined,
			getNodeAdapter: () => ({
				getElementBounds: () => ({ x: 10, y: 20, width: 120, height: 80 }),
				createHoverEffect: () => null,
			}),
		},
		permissionManager: {
			canHover: () => true,
		},
		selectionManager: {
			isSelected: () => options.selected ?? false,
		},
		transformManager: {
			isTransformInteractionActive: () =>
				typeof options.transformActive === "function"
					? options.transformActive()
					: (options.transformActive ?? false),
			isTransforming: () => false,
			isDraggingElement: () => false,
		},
	}

	const manager = new HoverManager({ canvas: canvas as never }) as unknown as HoverManagerPrivate
	const target = new Konva.Rect({ id: "element-1" })
	return { emit, manager, requestLayerDraw, target }
}

describe("HoverManager", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("coalesces mousemove handling into a single frame", () => {
		const raf = installRafMock()
		const { manager, requestLayerDraw, target } = createHoverManager()

		manager.handleMouseMove({ target })
		manager.handleMouseMove({ target })

		expect(raf.count()).toBe(1)
		expect(requestLayerDraw).not.toHaveBeenCalled()

		raf.flush()

		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		expect(manager.hoveredElementId).toBe("element-1")
		manager.destroy()
	})

	it("reuses the default hover node for the same element", () => {
		const raf = installRafMock()
		const { manager, requestLayerDraw, target } = createHoverManager()

		manager.handleMouseMove({ target })
		raf.flush()
		const firstHoverNode = manager.hoverNode
		manager.handleMouseMove({ target })
		raf.flush()

		expect(manager.hoverNode).toBe(firstHoverNode)
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		manager.destroy()
	})

	it("clears hover while transform interaction is active", () => {
		const raf = installRafMock()
		let transformActive = false
		const { manager, requestLayerDraw, target } = createHoverManager()

		manager.handleMouseMove({ target })
		raf.flush()
		expect(manager.hoveredElementId).toBe("element-1")

		const active = createHoverManager({ transformActive: () => transformActive })
		active.manager.handleMouseMove({ target })
		raf.flush()
		expect(active.manager.hoveredElementId).toBe("element-1")

		transformActive = true
		active.manager.handleMouseMove({ target })
		raf.flush()

		expect(active.manager.hoveredElementId).toBeNull()
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		expect(active.requestLayerDraw).toHaveBeenCalledTimes(2)
		manager.destroy()
		active.manager.destroy()
	})
})
