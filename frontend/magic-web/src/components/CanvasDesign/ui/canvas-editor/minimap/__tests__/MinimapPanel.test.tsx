import { StrictMode } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MinimapPanel from "../MinimapPanel"

const mocks = vi.hoisted(() => ({
	canvas: null as {
		eventEmitter: {
			on: (eventName: string, callback: (event: { data: unknown }) => void) => () => void
			emit: ReturnType<typeof vi.fn>
		}
		geometryCacheManager: {
			getElementsBounds: ReturnType<typeof vi.fn>
		}
		selectionManager: {
			getSelectedIds: () => string[]
		}
		cropManager: {
			getCroppingElementId: () => string | null
		}
		extendManager: {
			getExtendingElementId: () => string | null
		}
		eraserManager: {
			getErasingElementId: () => string | null
		}
		stage: {
			position: () => { x: number; y: number }
		}
		viewportController: {
			getScale: () => number
			panByWheelDelta: ReturnType<typeof vi.fn>
			setPosition: ReturnType<typeof vi.fn>
			zoomByWheelDeltaAtViewportCenter: ReturnType<typeof vi.fn>
		}
	} | null,
	collectMinimapScene: vi.fn(),
	getMinimapSceneSubtreeIds: vi.fn((_scene: unknown, rootIds: readonly string[]) => [...rootIds]),
	getMinimapSceneStationaryBounds: vi.fn(() => null),
	refreshMinimapSceneItems: vi.fn(),
	translateMinimapSceneItems: vi.fn(),
	drawMinimap: vi.fn(),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}))

vi.mock("../../../../runtime/shared/placement/elementUtils", () => ({
	getViewportCanvasRect: () => ({ x: 0, y: 0, width: 100, height: 80 }),
}))

vi.mock("../minimapRenderer", () => ({
	drawMinimap: mocks.drawMinimap,
}))

vi.mock("../minimapScene", () => ({
	collectMinimapScene: mocks.collectMinimapScene,
	getMinimapSceneSubtreeIds: mocks.getMinimapSceneSubtreeIds,
	getMinimapSceneStationaryBounds: mocks.getMinimapSceneStationaryBounds,
	refreshMinimapSceneItems: mocks.refreshMinimapSceneItems,
	translateMinimapSceneItems: mocks.translateMinimapSceneItems,
}))

function createAnimationFrameHarness() {
	let nextFrameId = 0
	const callbacks = new Map<number, FrameRequestCallback>()
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		nextFrameId += 1
		callbacks.set(nextFrameId, callback)
		return nextFrameId
	})
	const cancelAnimationFrame = vi.fn((frameId: number) => {
		callbacks.delete(frameId)
	})
	const flush = () => {
		const queued = Array.from(callbacks.values())
		callbacks.clear()
		queued.forEach((callback) => callback(0))
	}

	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame)
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame)

	return { requestAnimationFrame, cancelAnimationFrame, flush }
}

function createCanvasMock() {
	const listeners = new Map<string, Set<(event: { data: unknown }) => void>>()
	const getElementsBounds = vi.fn(() => ({ x: 10, y: 20, width: 40, height: 30 }))
	let selectedIds: string[] = []
	const specialEditingElementIds = {
		crop: null as string | null,
		extend: null as string | null,
		eraser: null as string | null,
	}
	let stagePosition = { x: 10, y: 20 }
	const setPosition = vi.fn((position: { x: number; y: number }) => {
		stagePosition = position
	})
	const panByWheelDelta = vi.fn()
	const zoomByWheelDeltaAtViewportCenter = vi.fn()
	const canvasEventEmit = vi.fn((event: { type: string; data: unknown }) => {
		listeners.get(event.type)?.forEach((callback) => callback({ data: event.data }))
	})
	return {
		canvas: {
			eventEmitter: {
				on: (eventName: string, callback: (event: { data: unknown }) => void) => {
					let eventListeners = listeners.get(eventName)
					if (!eventListeners) {
						eventListeners = new Set()
						listeners.set(eventName, eventListeners)
					}
					eventListeners.add(callback)
					return () => eventListeners?.delete(callback)
				},
				emit: canvasEventEmit,
			},
			geometryCacheManager: { getElementsBounds },
			selectionManager: {
				getSelectedIds: () => selectedIds,
			},
			cropManager: {
				getCroppingElementId: () => specialEditingElementIds.crop,
			},
			extendManager: {
				getExtendingElementId: () => specialEditingElementIds.extend,
			},
			eraserManager: {
				getErasingElementId: () => specialEditingElementIds.eraser,
			},
			stage: {
				position: () => ({ ...stagePosition }),
			},
			viewportController: {
				getScale: () => 2,
				panByWheelDelta,
				setPosition,
				zoomByWheelDeltaAtViewportCenter,
			},
		},
		canvasEventEmit,
		panByWheelDelta,
		setPosition,
		zoomByWheelDeltaAtViewportCenter,
		setStagePosition: (position: { x: number; y: number }) => {
			stagePosition = position
		},
		setSelectedIds: (elementIds: string[]) => {
			selectedIds = elementIds
		},
		setSpecialEditingElementId: (
			mode: "crop" | "extend" | "eraser",
			elementId: string | null,
		) => {
			specialEditingElementIds[mode] = elementId
		},
		emit: (eventName: string, data: unknown) => {
			listeners.get(eventName)?.forEach((callback) => callback({ data }))
		},
	}
}

function mockMinimapPanelBounds(panel: HTMLElement) {
	vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: 200,
		bottom: 150,
		width: 200,
		height: 150,
		toJSON: () => undefined,
	})
}

describe("MinimapPanel", () => {
	beforeEach(() => {
		mocks.canvas = null
		vi.stubGlobal("PointerEvent", MouseEvent)
		vi.stubGlobal(
			"ResizeObserver",
			class ResizeObserver {
				observe() {}
				disconnect() {}
			},
		)
		mocks.collectMinimapScene.mockReturnValue({
			items: [],
			itemsById: new Map(),
			childrenById: new Map(),
			contentBounds: null,
		})
		mocks.getMinimapSceneSubtreeIds.mockImplementation((_scene, rootIds: readonly string[]) => [
			...rootIds,
		])
		mocks.drawMinimap.mockReturnValue({
			transform: { scale: 1, offsetX: 0, offsetY: 0 },
			projectedViewportRect: { x: 50, y: 35, width: 100, height: 80 },
		})
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
		vi.clearAllMocks()
	})

	it("queues a new draw after StrictMode cancels the first animation frame", () => {
		const { requestAnimationFrame, cancelAnimationFrame } = createAnimationFrameHarness()

		render(
			<StrictMode>
				<MinimapPanel id="minimap-panel" />
			</StrictMode>,
		)

		expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
		expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
	})

	it("updates drag geometry incrementally and fully reconciles after drag end", () => {
		const { canvas, emit } = createCanvasMock()
		mocks.canvas = canvas
		const { flush } = createAnimationFrameHarness()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)

		render(<MinimapPanel id="minimap-panel" />)
		flush()
		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(1)

		emit("elements:transform:dragstart", { elementIds: ["frame"] })
		emit("element:change", { elementIds: ["frame"], phase: "transient" })
		emit("elements:transform:dragmove", {
			elementIds: ["frame"],
			boundingRect: { x: 25, y: 35, width: 40, height: 30 },
		})
		flush()

		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(1)
		expect(mocks.translateMinimapSceneItems).toHaveBeenCalledWith(
			expect.anything(),
			["frame"],
			15,
			15,
			null,
		)
		expect(mocks.refreshMinimapSceneItems).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			["frame"],
			undefined,
		)

		emit("elements:transform:dragend", { elementIds: ["frame"] })
		flush()

		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(2)
	})

	it("expands selected containers without rebuilding the scene", () => {
		const { canvas, emit, setSelectedIds } = createCanvasMock()
		mocks.canvas = canvas
		mocks.getMinimapSceneSubtreeIds.mockImplementation((_scene, rootIds: readonly string[]) =>
			rootIds.includes("frame") ? ["frame", "group", "image"] : [...rootIds],
		)
		const { flush } = createAnimationFrameHarness()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)

		render(<MinimapPanel id="minimap-panel" />)
		flush()

		setSelectedIds(["frame"])
		emit("element:select", { elementIds: ["frame"] })
		flush()

		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(1)
		expect(mocks.drawMinimap).toHaveBeenLastCalledWith(
			expect.objectContaining({
				selectedElementIds: new Set(["frame", "group", "image"]),
			}),
		)

		setSelectedIds([])
		emit("element:deselect", { elementIds: ["frame"] })
		flush()

		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(1)
		expect(mocks.drawMinimap).toHaveBeenLastCalledWith(
			expect.objectContaining({ selectedElementIds: new Set() }),
		)
	})

	it("keeps crop, extend, and eraser targets selected", () => {
		const { canvas, emit, setSpecialEditingElementId } = createCanvasMock()
		setSpecialEditingElementId("extend", "initial-image")
		mocks.canvas = canvas
		const { flush } = createAnimationFrameHarness()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)

		render(<MinimapPanel id="minimap-panel" />)
		flush()
		expect(mocks.drawMinimap).toHaveBeenLastCalledWith(
			expect.objectContaining({ selectedElementIds: new Set(["initial-image"]) }),
		)

		setSpecialEditingElementId("extend", null)
		emit("extend:exit", { elementId: "initial-image", restored: true })
		flush()

		for (const mode of ["crop", "extend", "eraser"] as const) {
			emit(`${mode}:enter`, { elementId: `${mode}-image` })
			flush()
			expect(mocks.drawMinimap).toHaveBeenLastCalledWith(
				expect.objectContaining({
					selectedElementIds: new Set([`${mode}-image`]),
				}),
			)

			emit(`${mode}:exit`, { elementId: `${mode}-image`, restored: true })
			flush()
			expect(mocks.drawMinimap).toHaveBeenLastCalledWith(
				expect.objectContaining({ selectedElementIds: new Set() }),
			)
		}

		expect(mocks.collectMinimapScene).toHaveBeenCalledTimes(1)
	})

	it("centers the viewport on click and drags the viewport rectangle", () => {
		const { canvas, canvasEventEmit, setPosition, setStagePosition } = createCanvasMock()
		mocks.canvas = canvas
		const parentPointerDown = vi.fn()
		const parentClick = vi.fn()
		const { flush } = createAnimationFrameHarness()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)

		const { getByRole } = render(
			<div onPointerDown={parentPointerDown} onClick={parentClick}>
				<MinimapPanel id="minimap-panel" />
			</div>,
		)
		flush()
		const panel = getByRole("region", { name: "小地图" })
		mockMinimapPanelBounds(panel)

		fireEvent.pointerDown(panel, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
		expect(setPosition).toHaveBeenLastCalledWith({ x: 70, y: 60 })
		expect(canvasEventEmit).toHaveBeenNthCalledWith(1, {
			type: "viewport:gesture",
			data: { active: true, source: "minimap", pointerCount: 1 },
		})
		expect(canvasEventEmit).toHaveBeenNthCalledWith(2, {
			type: "viewport:gesture",
			data: { active: false, source: "minimap" },
		})
		expect(parentPointerDown).not.toHaveBeenCalled()
		fireEvent.click(panel)
		expect(parentClick).not.toHaveBeenCalled()

		canvasEventEmit.mockClear()
		setPosition.mockClear()
		setStagePosition({ x: 10, y: 20 })
		fireEvent.pointerDown(panel, { button: 0, pointerId: 2, clientX: 60, clientY: 50 })
		expect(setPosition).not.toHaveBeenCalled()
		fireEvent.pointerUp(panel, { pointerId: 2, clientX: 60, clientY: 50 })
		expect(setPosition).toHaveBeenLastCalledWith({ x: -10, y: 0 })
		expect(canvasEventEmit).toHaveBeenNthCalledWith(1, {
			type: "viewport:gesture",
			data: { active: true, source: "minimap", pointerCount: 1 },
		})
		expect(canvasEventEmit).toHaveBeenNthCalledWith(2, {
			type: "viewport:gesture",
			data: { active: false, source: "minimap" },
		})

		canvasEventEmit.mockClear()
		setPosition.mockClear()
		setStagePosition({ x: 10, y: 20 })
		fireEvent.pointerDown(panel, { button: 0, pointerId: 3, clientX: 60, clientY: 50 })
		fireEvent.pointerMove(panel, { pointerId: 3, clientX: 62, clientY: 52 })
		expect(setPosition).not.toHaveBeenCalled()
		expect(canvasEventEmit).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "viewport:gesture" }),
		)
		expect(panel).toHaveClass("cursor-pointer")

		fireEvent.pointerMove(panel, { pointerId: 3, clientX: 80, clientY: 70 })
		expect(setPosition).toHaveBeenLastCalledWith({ x: -30, y: -20 })
		expect(canvasEventEmit).toHaveBeenCalledWith({
			type: "viewport:gesture",
			data: { active: true, source: "minimap", pointerCount: 1 },
		})
		expect(panel).toHaveClass("cursor-grabbing")

		fireEvent.pointerUp(panel, { pointerId: 3, clientX: 80, clientY: 70 })
		expect(canvasEventEmit).toHaveBeenLastCalledWith({
			type: "viewport:gesture",
			data: { active: false, source: "minimap" },
		})
		expect(panel).toHaveClass("cursor-pointer")
	})

	it("pans without Mod and reverses in-place zoom with Mod", () => {
		vi.useFakeTimers()
		const { canvas, canvasEventEmit, panByWheelDelta, zoomByWheelDeltaAtViewportCenter } =
			createCanvasMock()
		mocks.canvas = canvas
		const parentWheel = vi.fn()
		const { flush } = createAnimationFrameHarness()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)

		const { getByRole } = render(
			<div onWheel={parentWheel}>
				<MinimapPanel id="minimap-panel" />
			</div>,
		)
		flush()
		const panel = getByRole("region", { name: "小地图" })
		mockMinimapPanelBounds(panel)

		const firstWheelHandled = fireEvent.wheel(panel, {
			clientX: 40,
			clientY: 30,
			deltaX: 12,
			deltaY: 24,
		})
		fireEvent.wheel(panel, {
			clientX: 80,
			clientY: 60,
			deltaY: -120,
			ctrlKey: true,
		})
		fireEvent.wheel(panel, {
			clientX: 100,
			clientY: 70,
			deltaY: -40,
			ctrlKey: true,
		})

		expect(firstWheelHandled).toBe(false)
		expect(parentWheel).not.toHaveBeenCalled()
		expect(panByWheelDelta).toHaveBeenCalledWith(12, 24, "minimap")
		expect(zoomByWheelDeltaAtViewportCenter).toHaveBeenNthCalledWith(1, 120, "minimap")
		expect(zoomByWheelDeltaAtViewportCenter).toHaveBeenNthCalledWith(2, 40, "minimap")
		expect(canvasEventEmit).toHaveBeenCalledTimes(1)
		expect(canvasEventEmit).toHaveBeenLastCalledWith({
			type: "viewport:gesture",
			data: { active: true, source: "minimap", pointerCount: 1 },
		})

		vi.advanceTimersByTime(119)
		expect(canvasEventEmit).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(1)
		expect(canvasEventEmit).toHaveBeenLastCalledWith({
			type: "viewport:gesture",
			data: { active: false, source: "minimap" },
		})
	})
})
