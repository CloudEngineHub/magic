import Konva from "konva"
import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import type { LayerElement } from "../../../document/types"
import { FrameManager } from "../FrameManager"

describe("FrameManager drag stacking", () => {
	it("temporarily raises a root element above higher-level frames while dragging", () => {
		const element: LayerElement = {
			id: "element",
			type: "rectangle",
			x: 20,
			y: 30,
			width: 100,
			height: 80,
			zIndex: 1,
		}
		const contentLayer = new Konva.Group()
		const elementNode = new Konva.Group({ id: "element", x: 20, y: 30 })
		const frameNode = new Konva.Group({ id: "frame" })
		contentLayer.add(elementNode, frameNode)

		const canvas = {
			contentLayer,
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			transformManager: { rebaseActiveDragNodePositions: vi.fn() },
			permissionManager: { canReparentElement: vi.fn(() => true) },
			elementManager: {
				getElementData: vi.fn(() => element),
				findParentIdForElement: vi.fn(() => undefined),
				isTemporary: vi.fn(() => false),
				getNodeAdapter: vi.fn(() => ({
					getNodeForParenting: vi.fn(() => elementNode),
				})),
			},
		} as unknown as Canvas
		const manager = new FrameManager({ canvas })

		;(
			manager as unknown as { handleFrameDropDragStart: (ids: string[]) => void }
		).handleFrameDropDragStart(["element"])

		expect(contentLayer.getChildren().map((node) => node.id())).toEqual(["frame", "element"])
		expect(elementNode.position()).toEqual({ x: 20, y: 30 })
	})

	it("raises multiple same-parent elements while preserving their visual order", () => {
		const elements = new Map<string, LayerElement>([
			[
				"lower",
				{
					id: "lower",
					type: "rectangle",
					x: 20,
					y: 30,
					width: 100,
					height: 80,
					zIndex: 1,
				},
			],
			[
				"upper",
				{
					id: "upper",
					type: "rectangle",
					x: 80,
					y: 90,
					width: 100,
					height: 80,
					zIndex: 2,
				},
			],
		])
		const contentLayer = new Konva.Group()
		const lowerNode = new Konva.Group({ id: "lower", x: 20, y: 30 })
		const frameNode = new Konva.Group({ id: "frame" })
		const upperNode = new Konva.Group({ id: "upper", x: 80, y: 90 })
		contentLayer.add(lowerNode, frameNode, upperNode)
		const nodes = new Map([
			["lower", lowerNode],
			["upper", upperNode],
		])
		const rebaseActiveDragNodePositions = vi.fn()
		const canvas = {
			contentLayer,
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			transformManager: { rebaseActiveDragNodePositions },
			permissionManager: { canReparentElement: vi.fn(() => true) },
			elementManager: {
				getElementData: vi.fn((id: string) => elements.get(id)),
				findParentIdForElement: vi.fn(() => undefined),
				isTemporary: vi.fn(() => false),
				getNodeAdapter: vi.fn(() => ({
					getNodeForParenting: vi.fn((id: string) => nodes.get(id) ?? null),
				})),
			},
		} as unknown as Canvas
		const manager = new FrameManager({ canvas })

		;(
			manager as unknown as { handleFrameDropDragStart: (ids: string[]) => void }
		).handleFrameDropDragStart(["upper", "lower"])

		expect(contentLayer.getChildren().map((node) => node.id())).toEqual([
			"frame",
			"lower",
			"upper",
		])
		expect(rebaseActiveDragNodePositions).toHaveBeenCalledWith(["lower", "upper"])
	})

	it("does not start a reparent session when the selection contains a frame", () => {
		const rectangle: LayerElement = {
			id: "element",
			type: "rectangle",
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		}
		const frame: LayerElement = {
			id: "frame",
			type: "frame",
			x: 200,
			y: 100,
			width: 400,
			height: 300,
			children: [],
		}
		const contentLayer = new Konva.Group()
		const elementNode = new Konva.Group({ id: "element", x: 20, y: 30 })
		const frameNode = new Konva.Group({ id: "frame", x: 200, y: 100 })
		contentLayer.add(elementNode, frameNode)
		const rebaseActiveDragNodePositions = vi.fn()
		const canvas = {
			contentLayer,
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			transformManager: { rebaseActiveDragNodePositions },
			permissionManager: { canReparentElement: vi.fn(() => true) },
			elementManager: {
				getElementData: vi.fn((id: string) => (id === "frame" ? frame : rectangle)),
				findParentIdForElement: vi.fn(() => undefined),
				isTemporary: vi.fn(() => false),
				getNodeAdapter: vi.fn(() => ({
					getNodeForParenting: vi.fn((id: string) =>
						id === "frame" ? frameNode : elementNode,
					),
				})),
			},
		} as unknown as Canvas
		const manager = new FrameManager({ canvas })

		;(
			manager as unknown as { handleFrameDropDragStart: (ids: string[]) => void }
		).handleFrameDropDragStart(["element", "frame"])

		expect(contentLayer.getChildren().map((node) => node.id())).toEqual(["element", "frame"])
		expect(rebaseActiveDragNodePositions).not.toHaveBeenCalled()
	})

	it("keeps mixed-parent selections in their original containers", () => {
		const rootElement: LayerElement = {
			id: "root",
			type: "rectangle",
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		}
		const childElement: LayerElement = {
			id: "child",
			type: "rectangle",
			x: 40,
			y: 50,
			width: 100,
			height: 80,
		}
		const frame: LayerElement = {
			id: "frame",
			type: "frame",
			x: 200,
			y: 100,
			width: 400,
			height: 300,
			children: [childElement],
		}
		const contentLayer = new Konva.Group()
		const rootNode = new Konva.Group({ id: "root", x: 20, y: 30 })
		const frameNode = new Konva.Group({ id: "frame", x: 200, y: 100 })
		const childNode = new Konva.Group({ id: "child", x: 40, y: 50 })
		frameNode.add(childNode)
		contentLayer.add(rootNode, frameNode)
		const elements = new Map([
			["root", rootElement],
			["child", childElement],
			["frame", frame],
		])
		const nodes = new Map([
			["root", rootNode],
			["child", childNode],
			["frame", frameNode],
		])
		const rebaseActiveDragNodePositions = vi.fn()
		const canvas = {
			contentLayer,
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			transformManager: { rebaseActiveDragNodePositions },
			permissionManager: { canReparentElement: vi.fn(() => true) },
			elementManager: {
				getElementData: vi.fn((id: string) => elements.get(id)),
				findParentIdForElement: vi.fn((id: string) =>
					id === "child" ? "frame" : undefined,
				),
				isTemporary: vi.fn(() => false),
				getNodeAdapter: vi.fn(() => ({
					getNodeForParenting: vi.fn((id: string) => nodes.get(id) ?? null),
				})),
			},
		} as unknown as Canvas
		const manager = new FrameManager({ canvas })

		;(
			manager as unknown as { handleFrameDropDragStart: (ids: string[]) => void }
		).handleFrameDropDragStart(["root", "child"])

		expect(rootNode.getParent()).toBe(contentLayer)
		expect(childNode.getParent()).toBe(frameNode)
		expect(rebaseActiveDragNodePositions).not.toHaveBeenCalled()
	})
})
