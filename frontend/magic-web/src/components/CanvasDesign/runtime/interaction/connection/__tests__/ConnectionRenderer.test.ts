import { beforeAll, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import type { Canvas } from "../../../core/Canvas"
import { ConnectionRenderer } from "../ConnectionRenderer"
import {
	CONNECTION_GROUP_NAME,
	CONNECTION_HIT_PATH_NAME,
	CONNECTION_VISUAL_PATH_NAME,
} from "../connectionNodeUtils"
import { ElementTypeEnum } from "../../../document/types"
import {
	CONNECTION_HOVER_LINE_STYLE,
	CONNECTION_LINE_STYLE,
	CONNECTION_SELECTED_LINE_STYLE,
} from "../connectionStyle"

beforeAll(() => {
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => ({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			fillText: vi.fn(),
			getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
			measureText: vi.fn(() => ({ width: 0 })),
		})),
	})
})

function createCanvasStub(
	boundsById: Map<string, { x: number; y: number; width: number; height: number }>,
	options: {
		parentById?: Map<string, string>
		elementNodes?: Map<string, Konva.Group>
	} = {},
) {
	const contentLayer = new Konva.Group()
	const connectionGroup = new Konva.Group({ name: "canvas-connections" })
	contentLayer.add(connectionGroup)
	const canvas = {
		contentLayer,
		connectionGroup,
		ensureConnectionGroup: vi.fn(() => connectionGroup),
		geometryCacheManager: {
			getElementBounds: vi.fn((elementId: string) => boundsById.get(elementId) ?? null),
		},
		elementManager: {
			getElementData: vi.fn((elementId: string) => ({
				id: elementId,
				type: ElementTypeEnum.Text,
				x: 0,
				y: 0,
				width: 100,
				height: 40,
			})),
			findParentIdForElement: vi.fn((elementId: string) =>
				options.parentById?.get(elementId),
			),
			getElementInstance: vi.fn((elementId: string) => {
				const node = options.elementNodes?.get(elementId)
				return node ? { getNode: () => node } : undefined
			}),
		},
		permissionManager: {
			canUseSelectionToolAffordance: vi.fn(() => true),
		},
		cursorManager: {
			setTemporary: vi.fn(),
			restoreToolCursor: vi.fn(),
		},
		connectionManager: {
			isConnectionSelected: vi.fn(() => false),
			selectConnection: vi.fn(),
		},
		runtimeScheduler: {
			requestLayerDraw: vi.fn(),
		},
		stage: {
			scaleX: () => 1,
		},
	} as unknown as Canvas

	return { canvas, connectionGroup, contentLayer }
}

function getConnectionNode(connectionGroup: Konva.Group): Konva.Group {
	const node = connectionGroup.findOne(`.${CONNECTION_GROUP_NAME}`)
	if (!(node instanceof Konva.Group)) {
		throw new Error("Expected connection node")
	}
	return node
}

function getVisualPath(node: Konva.Group): Konva.Path {
	const path = node.findOne(`.${CONNECTION_VISUAL_PATH_NAME}`)
	if (!(path instanceof Konva.Path)) {
		throw new Error("Expected visual path")
	}
	return path
}

function getHitPath(node: Konva.Group): Konva.Path {
	const path = node.findOne(`.${CONNECTION_HIT_PATH_NAME}`)
	if (!(path instanceof Konva.Path)) {
		throw new Error("Expected hit path")
	}
	return path
}

function getConnectionNodes(root: Konva.Container): Konva.Group[] {
	return root
		.find(`.${CONNECTION_GROUP_NAME}`)
		.filter((node): node is Konva.Group => node instanceof Konva.Group)
}

function installRafMock() {
	let nextId = 1
	const callbacks = new Map<number, FrameRequestCallback>()
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => {
			const id = nextId
			nextId += 1
			callbacks.set(id, callback)
			return id
		}),
	)
	vi.stubGlobal(
		"cancelAnimationFrame",
		vi.fn((id: number) => {
			callbacks.delete(id)
		}),
	)
	return {
		flush: () => {
			const next = callbacks.entries().next()
			if (next.done) return
			const [id, callback] = next.value
			callbacks.delete(id)
			callback(0)
		},
		count: () => callbacks.size,
	}
}

describe("ConnectionRenderer", () => {
	it("skips empty renders when no connection state exists", () => {
		const { canvas } = createCanvasStub(new Map())
		const renderer = new ConnectionRenderer({ canvas })

		renderer.render([])

		expect(canvas.ensureConnectionGroup).not.toHaveBeenCalled()
		expect(canvas.runtimeScheduler.requestLayerDraw).not.toHaveBeenCalled()
	})

	it("updates an existing connection node instead of recreating it", () => {
		const boundsById = new Map([
			["source", { x: 0, y: 0, width: 100, height: 40 }],
			["target", { x: 220, y: 0, width: 100, height: 40 }],
		])
		const { canvas, connectionGroup } = createCanvasStub(boundsById)
		const renderer = new ConnectionRenderer({ canvas })
		const connections = [{ id: "edge", sourceElementId: "source", targetElementId: "target" }]

		renderer.render(connections)
		const firstNode = getConnectionNode(connectionGroup)
		const firstPath = getVisualPath(firstNode)
		expect(firstPath.data()).toBe("M 100 20 C 160 20 160 20 220 20")

		boundsById.set("target", { x: 300, y: 80, width: 100, height: 40 })
		renderer.render(connections)

		const nextNode = getConnectionNode(connectionGroup)
		expect(nextNode).toBe(firstNode)
		expect(connectionGroup.find(`.${CONNECTION_GROUP_NAME}`)).toHaveLength(1)
		expect(getVisualPath(nextNode).data()).toBe("M 100 20 C 200 20 200 100 300 100")
	})

	it("destroys stale keyed nodes when connections disappear", () => {
		const boundsById = new Map([
			["source", { x: 0, y: 0, width: 100, height: 40 }],
			["target", { x: 220, y: 0, width: 100, height: 40 }],
			["other", { x: 420, y: 0, width: 100, height: 40 }],
		])
		const { canvas, connectionGroup } = createCanvasStub(boundsById)
		const renderer = new ConnectionRenderer({ canvas })

		renderer.render([
			{ id: "a", sourceElementId: "source", targetElementId: "target" },
			{ id: "b", sourceElementId: "target", targetElementId: "other" },
		])
		expect(connectionGroup.find(`.${CONNECTION_GROUP_NAME}`)).toHaveLength(2)

		renderer.render([{ id: "a", sourceElementId: "source", targetElementId: "target" }])

		const nodes = connectionGroup.find(`.${CONNECTION_GROUP_NAME}`)
		expect(nodes).toHaveLength(1)
		expect(nodes[0].getAttr("connectionId")).toBe("a")
	})

	it("renders highlighted connections with the selected visual style", () => {
		const raf = installRafMock()
		try {
			const boundsById = new Map([
				["source", { x: 0, y: 0, width: 100, height: 40 }],
				["target", { x: 220, y: 0, width: 100, height: 40 }],
			])
			const { canvas, connectionGroup } = createCanvasStub(boundsById)
			const renderer = new ConnectionRenderer({ canvas })
			const connections = [
				{ id: "edge", sourceElementId: "source", targetElementId: "target" },
			]

			renderer.render(connections, { highlightedConnectionIds: ["edge"] })

			const node = getConnectionNode(connectionGroup)
			const visualPath = getVisualPath(node)
			const hitPath = getHitPath(node)
			expect(visualPath.stroke()).toBe(CONNECTION_SELECTED_LINE_STYLE.stroke)
			expect(visualPath.opacity()).toBe(CONNECTION_SELECTED_LINE_STYLE.opacity)

			hitPath.fire("mouseenter")
			expect(visualPath.stroke()).toBe(CONNECTION_SELECTED_LINE_STYLE.stroke)

			hitPath.fire("mouseleave")
			raf.flush()
			expect(visualPath.stroke()).toBe(CONNECTION_SELECTED_LINE_STYLE.stroke)
		} finally {
			vi.unstubAllGlobals()
		}
	})

	it("syncs hover style across global and local copies of the same connection", () => {
		const raf = installRafMock()
		try {
			const boundsById = new Map([
				["source", { x: 20, y: 20, width: 100, height: 40 }],
				["target", { x: 260, y: 20, width: 100, height: 40 }],
			])
			const frameNode = new Konva.Group({ id: "frame" })
			frameNode.add(new Konva.Rect({ name: "background" }))
			const { canvas, connectionGroup, contentLayer } = createCanvasStub(boundsById, {
				parentById: new Map([["source", "frame"]]),
				elementNodes: new Map([["frame", frameNode]]),
			})
			contentLayer.add(frameNode)
			const renderer = new ConnectionRenderer({ canvas })

			renderer.render([{ id: "edge", sourceElementId: "source", targetElementId: "target" }])

			const globalNode = getConnectionNode(connectionGroup)
			const localNode = getConnectionNodes(frameNode)[0]
			expect(localNode).toBeInstanceOf(Konva.Group)

			getHitPath(localNode).fire("mouseenter")

			expect(getVisualPath(globalNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)
			expect(getVisualPath(localNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)

			getHitPath(localNode).fire("mouseleave")
			expect(getVisualPath(globalNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)
			expect(getVisualPath(localNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)

			getHitPath(globalNode).fire("mouseenter")
			expect(raf.count()).toBe(0)
			raf.flush()

			expect(getVisualPath(globalNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)
			expect(getVisualPath(localNode).stroke()).toBe(CONNECTION_HOVER_LINE_STYLE.stroke)

			getHitPath(globalNode).fire("mouseleave")
			raf.flush()

			expect(getVisualPath(globalNode).stroke()).toBe(CONNECTION_LINE_STYLE.stroke)
			expect(getVisualPath(localNode).stroke()).toBe(CONNECTION_LINE_STYLE.stroke)
		} finally {
			vi.unstubAllGlobals()
		}
	})
})
