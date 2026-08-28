import Konva from "konva"

export interface Rect {
	x: number
	y: number
	width: number
	height: number
}

/**
 * 计算 sourceNode 的本地坐标系相对于 targetParent 的完整变换。
 *
 * 不能直接复制 sourceNode.x/y/scale/rotation：当 sourceNode 位于 Frame 等
 * 变换容器中，而 targetParent 位于 Stage 的其他 Layer 时，节点属性属于不同坐标系。
 */
export function getNodeTransformRelativeTo(
	sourceNode: Konva.Node,
	targetParent: Konva.Container,
): Konva.Transform {
	return targetParent
		.getAbsoluteTransform()
		.copy()
		.invert()
		.multiply(sourceNode.getAbsoluteTransform())
}

/** 将 targetNode 对齐到 sourceNode 在 targetParent 中的视觉变换。 */
export function syncNodeTransformRelativeTo(
	sourceNode: Konva.Node,
	targetNode: Konva.Node,
	targetParent: Konva.Container,
): void {
	targetNode.setAttrs({
		...getNodeTransformRelativeTo(sourceNode, targetParent).decompose(),
		offsetX: 0,
		offsetY: 0,
	})
}

/** 将 sourceNode 本地矩形转换为 targetParent 坐标系下的轴对齐外接框。 */
export function getLocalRectRelativeTo(
	sourceNode: Konva.Node,
	targetParent: Konva.Container,
	rect: Rect,
): Rect {
	const transform = getNodeTransformRelativeTo(sourceNode, targetParent)
	const corners = [
		transform.point({ x: rect.x, y: rect.y }),
		transform.point({ x: rect.x + rect.width, y: rect.y }),
		transform.point({ x: rect.x, y: rect.y + rect.height }),
		transform.point({ x: rect.x + rect.width, y: rect.y + rect.height }),
	]
	const xs = corners.map((point) => point.x)
	const ys = corners.map((point) => point.y)
	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	const maxX = Math.max(...xs)
	const maxY = Math.max(...ys)

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}
