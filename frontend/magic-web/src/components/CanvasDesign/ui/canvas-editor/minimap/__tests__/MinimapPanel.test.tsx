import { StrictMode } from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MinimapPanel from "../MinimapPanel"

const mocks = vi.hoisted(() => ({
	canvas: null as {
		eventEmitter: {
			on: (eventName: string, callback: (event: { data: unknown }) => void) => () => void
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

describe("MinimapPanel", () => {
	beforeEach(() => {
		mocks.canvas = null
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
	})

	afterEach(() => {
		cleanup()
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
})
