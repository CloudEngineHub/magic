import { describe, expect, it, vi } from "vitest"
import Konva from "konva"
import type { LayerElement } from "../../document/types"
import { TransformManager } from "../transform/TransformManager"

interface TransformElementStub {
	applyTransform: (
		updates: Partial<LayerElement>,
		options: {
			isRealtime: boolean
			isScaling: boolean
			shouldKeepRatio: boolean
			initialAspectRatio?: number
		},
	) => Partial<LayerElement>
	shouldKeepRatio: () => boolean
	shouldSyncTransformDataInRealtime?: () => boolean
}

interface TransformManagerPrivate {
	canvas: {
		readonly?: boolean
		eventEmitter?: {
			emit: ReturnType<typeof vi.fn>
		}
		runtimeScheduler: {
			requestLayerDraw: ReturnType<typeof vi.fn>
		}
		isKeepRatioModifierPressed: () => boolean
		historyManager?: {
			disable: ReturnType<typeof vi.fn>
			enable: ReturnType<typeof vi.fn>
			recordHistoryImmediate: ReturnType<typeof vi.fn>
		}
		elementManager: {
			getElementInstance: (elementId: string) => TransformElementStub | undefined
			update: ReturnType<typeof vi.fn>
			getNodeAdapter?: () => {
				getElementsBounds: ReturnType<typeof vi.fn>
			}
		}
	}
	transformer?: {
		getActiveAnchor: ReturnType<typeof vi.fn>
		nodes?: ReturnType<typeof vi.fn>
		forceUpdate?: ReturnType<typeof vi.fn>
	}
	multiSelectionProxy: {
		x: () => number
		y: () => number
		width: () => number
		height: () => number
		scaleX: () => number
		scaleY: () => number
	} | null
	proxyInitialBounds: { x: number; y: number; width: number; height: number }
	proxyInitialNodeStates: Map<
		string,
		{
			node: { x: ReturnType<typeof vi.fn>; y: ReturnType<typeof vi.fn> }
			element: TransformElementStub
			x: number
			y: number
			scaleX: number
			scaleY: number
			width?: number
			height?: number
			shouldKeepRatio: boolean
			initialAspectRatio?: number
		}
	>
	transformSessionElementStates: Map<
		string,
		{
			element: TransformElementStub
			shouldKeepRatio: boolean
			initialAspectRatio?: number
		}
	>
	initialElementAspectRatios: Map<string, number>
	initialAspectRatio: number | null
	isAnchorTransformActive: boolean
	isProxyInteractionActive: boolean
	isTransformIntentActive: boolean
	pendingTransformerElementIds: string[] | null
	pendingTransformerUpdateRafId: number | null
	transformingElementIds: Set<string>
	captureProxyState: (elementIds: string[]) => void
	handleTransformerTransformstart: () => void
	handleTransformerTransformend: () => void
	isTransformInteractionActive: () => boolean
	handleTransformerDragmove: () => void
	syncSelectionProxyToElements: (options: { isRealtime: boolean; isScaling: boolean }) => void
	rebaseActiveDragNodePositions: (elementIds: readonly string[]) => void
	isTransforming: (elementId: string) => boolean
	isElementInActiveTransformInteraction: (elementId: string) => boolean
}

function createSingleDragMoveManager() {
	const emit = vi.fn()
	const update = vi.fn()
	const applyTransform = vi.fn((updates: Partial<LayerElement>) => updates)
	const element = {
		applyTransform,
		shouldKeepRatio: () => false,
		shouldSyncTransformDataInRealtime: () => false,
	}
	const node = new Konva.Group({ id: "element-1", x: 10, y: 20, width: 100, height: 100 })
	const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate

	manager.canvas = {
		readonly: false,
		eventEmitter: { emit },
		runtimeScheduler: { requestLayerDraw: vi.fn() },
		isKeepRatioModifierPressed: () => false,
		elementManager: {
			getElementInstance: () => element,
			update,
			getNodeAdapter: () => ({
				getElementsBounds: vi.fn(() => ({ x: 10, y: 20, width: 100, height: 100 })),
			}),
		},
	}
	manager.transformer = {
		getActiveAnchor: vi.fn(() => null),
		nodes: vi.fn(() => [node]),
		forceUpdate: vi.fn(),
	}
	manager.multiSelectionProxy = null
	manager.transformSessionElementStates = new Map([
		["element-1", { element, shouldKeepRatio: false }],
	])
	manager.initialElementAspectRatios = new Map()
	manager.initialAspectRatio = null
	manager.transformingElementIds = new Set(["element-1"])

	return { emit, manager, update }
}

function createProxySyncManager() {
	const emit = vi.fn()
	const update = vi.fn()
	const requestLayerDraw = vi.fn()
	const applyTransform = vi.fn((updates: Partial<LayerElement>) => updates)
	const element = {
		applyTransform,
		shouldKeepRatio: () => false,
		shouldSyncTransformDataInRealtime: () => false,
	}
	const node = {
		x: vi.fn(),
		y: vi.fn(),
	}
	const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate

	manager.canvas = {
		readonly: false,
		eventEmitter: { emit },
		runtimeScheduler: { requestLayerDraw },
		isKeepRatioModifierPressed: () => false,
		elementManager: {
			getElementInstance: () => element,
			update,
		},
	}
	manager.multiSelectionProxy = {
		x: () => 10,
		y: () => 20,
		width: () => 100,
		height: () => 100,
		scaleX: () => 1,
		scaleY: () => 1,
	}
	manager.proxyInitialBounds = { x: 0, y: 0, width: 100, height: 100 }
	manager.proxyInitialNodeStates = new Map([
		[
			"element-1",
			{
				node,
				element,
				x: 5,
				y: 6,
				scaleX: 1,
				scaleY: 1,
				width: 20,
				height: 30,
				shouldKeepRatio: false,
			},
		],
	])
	manager.transformSessionElementStates = new Map([
		["element-1", { element, shouldKeepRatio: false }],
	])
	manager.initialElementAspectRatios = new Map()
	manager.initialAspectRatio = null
	manager.transformingElementIds = new Set(["element-1"])

	return { applyTransform, element, emit, manager, node, requestLayerDraw, update }
}

describe("TransformManager multi-selection proxy sync", () => {
	it("rebases proxy node coordinates after nodes move to the content layer", () => {
		const node = {
			x: vi.fn(() => 105),
			y: vi.fn(() => 206),
		}
		const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate
		manager.multiSelectionProxy = {} as TransformManagerPrivate["multiSelectionProxy"]
		manager.isProxyInteractionActive = true
		manager.proxyInitialNodeStates = new Map([
			[
				"element-1",
				{
					node,
					element: {} as TransformElementStub,
					x: 5,
					y: 6,
					scaleX: 1,
					scaleY: 1,
					shouldKeepRatio: false,
				},
			],
		])

		manager.rebaseActiveDragNodePositions(["element-1"])

		expect(manager.proxyInitialNodeStates.get("element-1")).toEqual(
			expect.objectContaining({ x: 105, y: 206 }),
		)
	})

	it("captures node references for the realtime translation fast path", () => {
		const node = {
			id: () => "element-1",
			x: vi.fn(() => 5),
			y: vi.fn(() => 6),
			scaleX: vi.fn(() => 1),
			scaleY: vi.fn(() => 1),
		}
		const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate
		manager.canvas = {
			elementManager: {
				getNodeAdapter: () => ({
					getElementsBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getNodesForTransform: () => [node],
				}),
				getElementData: () => ({ id: "element-1", width: 100, height: 100 }),
				getElementInstance: () => ({
					applyTransform: vi.fn((updates: Partial<LayerElement>) => updates),
					shouldKeepRatio: () => false,
				}),
			},
		} as unknown as TransformManagerPrivate["canvas"]
		manager.proxyInitialNodeStates = new Map()
		manager.transformSessionElementStates = new Map()
		manager.initialElementAspectRatios = new Map()
		manager.initialAspectRatio = null

		manager.captureProxyState(["element-1"])

		expect(manager.proxyInitialNodeStates.get("element-1")?.node).toBe(node)
	})

	it("uses the translation fast path during realtime proxy movement", () => {
		const { applyTransform, manager, node, requestLayerDraw, update } = createProxySyncManager()

		manager.syncSelectionProxyToElements({ isRealtime: true, isScaling: false })

		expect(node.x).toHaveBeenCalledWith(15)
		expect(node.y).toHaveBeenCalledWith(26)
		expect(applyTransform).not.toHaveBeenCalled()
		expect(update).not.toHaveBeenCalled()
		expect(requestLayerDraw).toHaveBeenCalledWith(
			"content",
			expect.objectContaining({
				source: "TransformManager",
				reason: "selection-proxy-translation",
				priority: "input",
			}),
		)
	})

	it("commits data when proxy movement finishes", () => {
		const { manager, update } = createProxySyncManager()

		manager.syncSelectionProxyToElements({ isRealtime: false, isScaling: false })

		expect(update).toHaveBeenCalledTimes(2)
		expect(update).toHaveBeenNthCalledWith(
			1,
			"element-1",
			expect.any(Object),
			expect.objectContaining({ mode: "node-only" }),
		)
		expect(update).toHaveBeenNthCalledWith(
			2,
			"element-1",
			expect.any(Object),
			expect.objectContaining({ mode: "data-only", silent: true }),
		)
	})

	it("syncs data in realtime for elements that rebuild their internal render nodes", () => {
		const { element, manager, update } = createProxySyncManager()
		element.shouldSyncTransformDataInRealtime = () => true
		manager.multiSelectionProxy = {
			x: () => 10,
			y: () => 20,
			width: () => 200,
			height: () => 150,
			scaleX: () => 1,
			scaleY: () => 1,
		}

		manager.syncSelectionProxyToElements({ isRealtime: true, isScaling: true })

		expect(update).toHaveBeenCalledTimes(2)
		expect(update).toHaveBeenNthCalledWith(
			1,
			"element-1",
			expect.any(Object),
			expect.objectContaining({ mode: "node-only" }),
		)
		expect(update).toHaveBeenNthCalledWith(
			2,
			"element-1",
			expect.any(Object),
			expect.objectContaining({ mode: "data-only", silent: true }),
		)
	})

	it("keeps the node-only fast path for ordinary elements during realtime scaling", () => {
		const { manager, update } = createProxySyncManager()
		manager.multiSelectionProxy = {
			x: () => 10,
			y: () => 20,
			width: () => 200,
			height: () => 150,
			scaleX: () => 1,
			scaleY: () => 1,
		}

		manager.syncSelectionProxyToElements({ isRealtime: true, isScaling: true })

		expect(update).toHaveBeenCalledTimes(1)
		expect(update).toHaveBeenCalledWith(
			"element-1",
			expect.any(Object),
			expect.objectContaining({ mode: "node-only" }),
		)
	})

	it("emits one batched dragmove with proxy bounds during realtime proxy movement", () => {
		const { emit, manager } = createProxySyncManager()

		manager.handleTransformerDragmove()

		expect(emit).toHaveBeenCalledTimes(1)
		expect(emit).toHaveBeenCalledWith({
			type: "elements:transform:dragmove",
			data: {
				elementIds: ["element-1"],
				boundingRect: { x: 10, y: 20, width: 100, height: 100 },
			},
		})
		expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "element:dragmove" }))
	})

	it("emits one batched dragmove with selection bounds during realtime single movement", () => {
		const { emit, manager, update } = createSingleDragMoveManager()

		manager.handleTransformerDragmove()

		expect(update).toHaveBeenCalledWith(
			"element-1",
			expect.objectContaining({ x: 10, y: 20 }),
			expect.objectContaining({
				mode: "node-only",
				skipGeometryInvalidate: true,
			}),
		)
		expect(emit).toHaveBeenCalledWith({
			type: "elements:transform:dragmove",
			data: {
				elementIds: ["element-1"],
				boundingRect: { x: 10, y: 20, width: 100, height: 100 },
			},
		})
		expect(emit).toHaveBeenCalledWith({
			type: "element:dragmove",
			data: { elementId: "element-1" },
		})
	})

	it("marks single-anchor scaling as an active transform", () => {
		const emit = vi.fn()
		const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate
		manager.canvas = {
			readonly: false,
			eventEmitter: { emit },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			isKeepRatioModifierPressed: () => false,
			elementManager: {
				getNodeAdapter: () => ({
					getElementsBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
					getElementBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
				}),
				getElementInstance: vi.fn(() => undefined),
				update: vi.fn(),
			},
		}
		manager.transformer = {
			getActiveAnchor: vi.fn(() => "top-left"),
			forceUpdate: vi.fn(),
		}
		manager.multiSelectionProxy = null
		manager.initialElementAspectRatios = new Map()
		manager.transformSessionElementStates = new Map()
		manager.initialAspectRatio = null
		manager.isAnchorTransformActive = false
		manager.isProxyInteractionActive = false
		manager.isTransformIntentActive = true
		manager.transformingElementIds = new Set(["element-1"])

		manager.handleTransformerTransformstart()

		expect(manager.isTransformInteractionActive()).toBe(true)
		expect(manager.isAnchorTransformActive).toBe(true)
		expect(manager.isTransformIntentActive).toBe(false)
		expect(emit).toHaveBeenCalledWith({
			type: "elements:transform:anchorDragStart",
			data: { elementIds: ["element-1"], activeAnchor: "top-left" },
		})
	})

	it("clears anchor transform active state after transformend", () => {
		const emit = vi.fn()
		const update = vi.fn()
		const applyTransform = vi.fn((updates: Partial<LayerElement>) => updates)
		const schedulePendingTransformerUpdate = vi.fn()
		const node = new Konva.Group({
			id: "element-1",
			x: 10,
			y: 20,
			width: 100,
			height: 50,
			scaleX: 1,
			scaleY: 1,
		})
		const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate
		manager.canvas = {
			readonly: false,
			eventEmitter: { emit },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			isKeepRatioModifierPressed: () => false,
			historyManager: {
				disable: vi.fn(),
				enable: vi.fn(),
				recordHistoryImmediate: vi.fn(),
			},
			elementManager: {
				getElementInstance: vi.fn(() => ({
					applyTransform,
					shouldKeepRatio: () => false,
				})),
				update,
			},
		}
		manager.transformer = {
			getActiveAnchor: vi.fn(() => "top-left"),
			nodes: vi.fn(() => [node]),
			forceUpdate: vi.fn(),
		}
		manager.multiSelectionProxy = null
		manager.initialElementAspectRatios = new Map([["element-1", 2]])
		manager.transformSessionElementStates = new Map()
		manager.initialAspectRatio = 2
		manager.isAnchorTransformActive = true
		manager.isProxyInteractionActive = false
		manager.isTransformIntentActive = false
		manager.pendingTransformerElementIds = null
		manager.pendingTransformerUpdateRafId = null
		manager.transformingElementIds = new Set(["element-1"])
		;(
			manager as unknown as {
				schedulePendingTransformerUpdate: ReturnType<typeof vi.fn>
			}
		).schedulePendingTransformerUpdate = schedulePendingTransformerUpdate

		manager.handleTransformerTransformend()

		expect(manager.isTransformInteractionActive()).toBe(false)
		expect(manager.isAnchorTransformActive).toBe(false)
		expect(schedulePendingTransformerUpdate).toHaveBeenCalledTimes(1)
		expect(emit).toHaveBeenCalledWith({
			type: "elements:transform:anchorDragend",
			data: { elementIds: ["element-1"], activeAnchor: "top-left" },
		})
		expect(update).toHaveBeenCalled()
	})

	it("distinguishes transformer attachment from active transform interaction", () => {
		const manager = Object.create(TransformManager.prototype) as TransformManagerPrivate
		manager.transformingElementIds = new Set(["element-1"])
		manager.isAnchorTransformActive = false
		manager.isProxyInteractionActive = false
		manager.isTransformIntentActive = false
		;(manager as unknown as { isDragging: boolean }).isDragging = false

		expect(manager.isTransforming("element-1")).toBe(true)
		expect(manager.isElementInActiveTransformInteraction("element-1")).toBe(false)

		manager.isAnchorTransformActive = true

		expect(manager.isElementInActiveTransformInteraction("element-1")).toBe(true)
		expect(manager.isElementInActiveTransformInteraction("element-2")).toBe(false)
	})
})
