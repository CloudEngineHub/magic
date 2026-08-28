import type Konva from "konva"
import type { Canvas } from "../../core/Canvas"

/**
 * 从事件目标沿父链查找第一个在 ElementManager 中存在的元素 id。
 * 用于视频/图片等根 Group 挂 id、内部子节点负责命中与交互的场景。
 */
export function resolveManagedElementIdFromKonvaNode(
	node: Konva.Node,
	canvas: Canvas,
): string | undefined {
	let current: Konva.Node | null = node
	while (current && current !== canvas.stage) {
		const id = current.id()
		if (id && canvas.elementManager.hasElement(id)) {
			return id
		}
		current = current.getParent()
	}
	return undefined
}

/**
 * 在 contentLayer 的 Konva hit graph 中按 stage 坐标解析最上层画布元素。
 *
 * controlsLayer 中的 Transformer / multi-selection-proxy 会拦截 Stage 命中，
 * 因此需要直接查询 contentLayer，避免通过隐藏代理或切换 listening 来实现穿透。
 * Layer 级命中会保留节点真实层级、旋转、clip 和自定义 hit area 语义。
 */
export function pickContentElementIdAtStagePointer(
	canvas: Canvas,
	pointerPos: { x: number; y: number },
): string | undefined {
	const hitNode = canvas.contentLayer.getIntersection(pointerPos)
	if (!hitNode) {
		return undefined
	}

	return resolveManagedElementIdFromKonvaNode(hitNode, canvas)
}

/**
 * 将 stage 指针坐标映射到 contentLayer 后，在「当前选中集合」里按几何命中解析元素 id。
 * 用于 multi-selection-proxy 在 controlsLayer 拦截命中、无法沿 Konva 父链解析 id 的场景。
 * 多个选中重叠时，优先取选中集合迭代序中较后的一项（通常更接近「后选中」）。
 */
export function pickSelectedElementIdAtStagePointer(
	canvas: Canvas,
	pointerPos: { x: number; y: number },
): string | undefined {
	const layerTransform = canvas.contentLayer.getAbsoluteTransform().copy().invert()
	const layerPos = layerTransform.point(pointerPos)
	const adapter = canvas.elementManager.getNodeAdapter()
	const selectedIds = canvas.selectionManager.getSelectedIds()

	for (let i = selectedIds.length - 1; i >= 0; i--) {
		const elementId = selectedIds[i]
		if (!elementId) {
			continue
		}

		const bounds = adapter.getElementBounds(elementId)
		if (!bounds) {
			continue
		}

		const inside =
			layerPos.x >= bounds.x &&
			layerPos.x <= bounds.x + bounds.width &&
			layerPos.y >= bounds.y &&
			layerPos.y <= bounds.y + bounds.height

		if (inside) {
			return elementId
		}
	}

	return undefined
}
