import type Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import type { BaseElement } from "../../elements/core/BaseElement"

export type CanvasRenderVisibilityStrategy = "hidden" | "detached" | "destroyed"

interface CulledElementState {
	// The effective strategy can differ from the configured strategy; container nodes fall back
	// from destroyed to detached so their child element instances keep their Konva nodes.
	strategy: CanvasRenderVisibilityStrategy
	visible: boolean
	listening: boolean
	// Parent/index are needed for detached and destroyed strategies to restore draw order.
	parent: Konva.Container | null
	index: number
}

export interface CanvasRenderVisibilitySyncOptions {
	activeElementIds: Iterable<string>
	allElementIds: Iterable<string>
	allowCullFar: boolean
}

export interface CanvasRenderVisibilitySyncResult {
	hiddenCount: number
	restoredCount: number
	activeCount: number
	culledCount: number
}

export class CanvasRenderVisibilityController {
	private readonly canvas: Canvas
	private readonly strategy: CanvasRenderVisibilityStrategy
	private readonly culledElements = new Map<string, CulledElementState>()

	constructor(options: { canvas: Canvas; strategy?: CanvasRenderVisibilityStrategy }) {
		this.canvas = options.canvas
		this.strategy = options.strategy ?? "hidden"
	}

	public sync(options: CanvasRenderVisibilitySyncOptions): CanvasRenderVisibilitySyncResult {
		const activeElementIds = new Set(options.activeElementIds)
		const allElementIds = Array.from(options.allElementIds)
		let hiddenCount = 0
		let restoredCount = 0

		activeElementIds.forEach((elementId) => {
			if (this.restoreElement(elementId)) {
				restoredCount += 1
			}
		})

		if (options.allowCullFar) {
			allElementIds.forEach((elementId) => {
				if (activeElementIds.has(elementId)) return
				if (this.hideElement(elementId)) {
					hiddenCount += 1
				}
			})
		}

		if (hiddenCount > 0 || restoredCount > 0) {
			this.canvas.runtimeScheduler.requestLayerDraw("content", {
				source: "CanvasRenderVisibilityController",
				reason: "render-visibility-sync",
				priority: "normal",
			})
		}

		return {
			hiddenCount,
			restoredCount,
			activeCount: activeElementIds.size,
			culledCount: this.culledElements.size,
		}
	}

	public restoreAll(): void {
		const elementIds = Array.from(this.culledElements.keys())
		let restoredCount = 0
		elementIds.forEach((elementId) => {
			if (this.restoreElement(elementId)) {
				restoredCount += 1
			}
		})
		if (restoredCount > 0) {
			this.canvas.runtimeScheduler.requestLayerDraw("content", {
				source: "CanvasRenderVisibilityController",
				reason: "render-visibility-restore-all",
				priority: "normal",
			})
		}
	}

	public getCulledCount(): number {
		return this.culledElements.size
	}

	private hideElement(elementId: string): boolean {
		if (this.culledElements.has(elementId)) return false
		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return false
		const node = element?.getNode()
		if (!node) return false
		const strategy = this.getEffectiveStrategy(element, node)
		const state: CulledElementState = {
			strategy,
			visible: node.visible(),
			listening: node.listening(),
			parent: node.getParent(),
			index: this.getNodeIndex(node),
		}

		this.culledElements.set(elementId, state)
		if (strategy === "hidden") {
			node.visible(false)
			node.listening(false)
			return true
		}
		if (strategy === "detached") {
			// remove() detaches the node from drawing/hit graphs while keeping the node reusable.
			node.remove()
			return true
		}

		// destroyed is the most aggressive render-only strategy: drop the Konva node but keep
		// the BaseElement instance and media resources alive for a later render() restore.
		element.destroyRenderNodeForVisibilityCull()
		return true
	}

	private restoreElement(elementId: string): boolean {
		const state = this.culledElements.get(elementId)
		if (!state) return false
		this.culledElements.delete(elementId)

		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return false
		if (state.strategy === "destroyed") {
			return this.restoreDestroyedElement(element, state)
		}
		const node = element.getNode()
		if (!node) return false
		if (state.strategy === "detached" && state.parent && !node.getParent()) {
			state.parent.add(node)
			this.restoreNodeIndex(node, state)
		}
		node.visible(element.getData().visible ?? state.visible)
		node.listening(state.listening)
		return true
	}

	private restoreDestroyedElement(element: BaseElement, state: CulledElementState): boolean {
		if (!state.parent) return false
		const node = element.render()
		if (!node) return false
		state.parent.add(node)
		this.restoreNodeIndex(node, state)
		node.visible(element.getData().visible ?? state.visible)
		node.listening(state.listening)
		element.onMounted()
		this.canvas.eventEmitter.emit({
			type: "element:rerendered",
			data: { elementId: element.getId(), data: element.getData() },
		})
		return true
	}

	private getEffectiveStrategy(
		element: BaseElement,
		node: Konva.Node,
	): CanvasRenderVisibilityStrategy {
		if (this.strategy !== "destroyed") return this.strategy
		// Destroying a frame/group root would also destroy children nodes that still belong to
		// independent BaseElement instances, so containers use detachable culling instead.
		const data = element.getData()
		if ("children" in data && Array.isArray(data.children) && data.children.length > 0) {
			return "detached"
		}
		if (!node.getParent()) return "hidden"
		return "destroyed"
	}

	private getNodeIndex(node: Konva.Node): number {
		const parent = node.getParent()
		if (!parent) return -1
		return Array.from(parent.getChildren()).indexOf(node)
	}

	private restoreNodeIndex(node: Konva.Node, state: CulledElementState): void {
		if (state.index < 0) return
		const parent = node.getParent()
		if (!parent) return
		const maxIndex = Math.max(0, parent.getChildren().length - 1)
		node.zIndex(Math.min(state.index, maxIndex))
	}
}
