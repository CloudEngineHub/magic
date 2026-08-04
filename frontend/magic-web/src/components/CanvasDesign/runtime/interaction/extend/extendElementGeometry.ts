import type Konva from "konva"
import type { Rect } from "../../shared/geometry/nodeTransform"

interface ResolveExtendedImageElementGeometryOptions {
	contentLayer: Konva.Container
	parentNode?: Konva.Node | null
	imageOriginInContent: { x: number; y: number }
	imageRect: Rect
}

/**
 * 将扩展代理的结果写回图片元素自身的坐标系。
 *
 * imageOriginInContent 是 contentLayer 局部坐标；Frame 子元素必须先完整转换到
 * Frame 局部坐标，不能把旋转后 AABB 的左上角直接当作元素原点。
 */
export function resolveExtendedImageElementGeometry(
	options: ResolveExtendedImageElementGeometryOptions,
): Rect {
	const { contentLayer, parentNode, imageOriginInContent, imageRect } = options
	const position = parentNode
		? parentNode
				.getAbsoluteTransform()
				.copy()
				.invert()
				.multiply(contentLayer.getAbsoluteTransform())
				.point(imageOriginInContent)
		: imageOriginInContent

	return {
		x: position.x,
		y: position.y,
		width: imageRect.width,
		height: imageRect.height,
	}
}

/**
 * 扩展结果是顶层元素：位置避开变换后的扩展框 AABB，尺寸仍使用扩展会话的逻辑尺寸。
 *
 * 旋转会增大 AABB；若把 AABB 宽高写入新图片，会改变生成结果本身的宽高比。
 */
export function resolveExpandedResultElementGeometry(
	frameBounds: Rect,
	resultSize: Pick<Rect, "width" | "height">,
): Rect {
	return {
		x: frameBounds.x + frameBounds.width,
		y: frameBounds.y,
		width: resultSize.width,
		height: resultSize.height,
	}
}
