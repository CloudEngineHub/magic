import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import { IMAGE_CONFIG } from "../image/ImageElement.config"

/** 废稿只改变画布预览；悬浮恢复原色，不改原图、透明度或资源缓存。 */
export class DiscardedImageDecorator {
	private hovered: boolean
	private readonly unsubscribe: () => void
	private readonly originalDraw: (
		this: Konva.Image,
		context: Konva.Context,
		shape: Konva.Shape,
	) => void

	constructor(
		private readonly imageNode: Konva.Image,
		canvas: Canvas,
		elementId: string,
	) {
		this.hovered = canvas.hoverManager.getHoveredElementId() === elementId
		this.originalDraw = imageNode.getSceneFunc()
		// 使用浏览器绘制滤镜，不为每张废稿额外缓存整张位图。沿用原 sceneFunc 的裁剪逻辑。
		imageNode.sceneFunc((context, shape) => {
			context.save()
			if (!this.hovered) context.setAttr("filter", IMAGE_CONFIG.DISCARDED_FILTER)
			try {
				this.originalDraw.call(imageNode, context, shape)
			} finally {
				context.restore()
			}
		})
		this.unsubscribe = canvas.eventEmitter.on("element:hover", ({ data }) => {
			const hovered = data.elementId === elementId
			if (hovered === this.hovered) return
			this.hovered = hovered
			canvas.runtimeScheduler.requestLayerDraw("content", {
				source: "DiscardedImageDecorator",
				reason: "draft-hover",
				priority: "input",
			})
		})
	}

	public destroy(): void {
		this.unsubscribe()
		this.imageNode.sceneFunc(this.originalDraw)
	}
}
