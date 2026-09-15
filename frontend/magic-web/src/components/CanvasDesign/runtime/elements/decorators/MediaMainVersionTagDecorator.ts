import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import { getContents, getMainContent } from "../../document/elementContent"
import type { ImageElement, VideoElement } from "../../document/types"
import {
	COLORS,
	IMAGE_CONFIG,
	LAYOUT,
	resolveImageControlCanvasOffset,
} from "../image/ImageElement.config"

type VersionedMediaElement = ImageElement | VideoElement

interface MediaMainVersionTagDecoratorConfig {
	canvas: Canvas
	width: number
	height: number
	data: VersionedMediaElement
}

/** 媒体主版本标识：仅展示当前内容是否为主版本，不提供版本操作。 */
export class MediaMainVersionTagDecorator {
	private tag?: Konva.Group
	private viewportHandler?: () => void
	private transformHandler?: () => void
	private permissionChangedHandler?: () => void

	constructor(
		private readonly elementGroup: Konva.Group,
		private config: MediaMainVersionTagDecoratorConfig,
	) {}

	public create(): void {
		this.destroyTag()
		if (!this.shouldDisplay()) return

		const label = this.config.canvas.t
			? this.config.canvas.t("elementBottomToolbar.mainVersion", {
					defaultValue: "主版本",
				})
			: "主版本"
		const labelProbe = new Konva.Text({
			text: label,
			fontSize: LAYOUT.TEXT_FONT_SIZE,
			fontFamily: LAYOUT.TEXT_FONT_FAMILY,
		})
		const width = Math.ceil(labelProbe.getTextWidth() + LAYOUT.TEXT_PADDING_X * 2)
		labelProbe.destroy()

		this.tag = new Konva.Group({
			width,
			height: IMAGE_CONFIG.INFO_BUTTON_SIZE,
			name: "decorator-media-main-version-tag",
			listening: false,
		})
		this.tag.add(
			new Konva.Rect({
				width,
				height: IMAGE_CONFIG.INFO_BUTTON_SIZE,
				cornerRadius: IMAGE_CONFIG.CORNER_RADIUS,
				fill: COLORS.BUTTON_BG,
				listening: false,
			}),
			new Konva.Text({
				width,
				height: IMAGE_CONFIG.INFO_BUTTON_SIZE,
				text: label,
				fontSize: LAYOUT.TEXT_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				align: "center",
				verticalAlign: "middle",
				fill: "#FFFFFF",
				listening: false,
			}),
		)

		this.elementGroup.add(this.tag)
		this.tag.moveToTop()
		this.updateLayout()
		this.setupListeners()
	}

	public updateConfig(config: Partial<MediaMainVersionTagDecoratorConfig>): void {
		this.config = { ...this.config, ...config }
		this.create()
	}

	public refreshLayout(): void {
		this.updateLayout()
	}

	public destroy(): void {
		this.destroyTag()
		if (this.viewportHandler) {
			this.config.canvas.eventEmitter.off("viewport:scale", this.viewportHandler)
			this.viewportHandler = undefined
		}
		if (this.transformHandler) {
			this.elementGroup.off("transform", this.transformHandler)
			this.transformHandler = undefined
		}
		if (this.permissionChangedHandler) {
			this.config.canvas.eventEmitter.off("permission:changed", this.permissionChangedHandler)
			this.permissionChangedHandler = undefined
		}
	}

	private shouldDisplay(): boolean {
		const contents = getContents(this.config.data)
		const activeContent = this.config.canvas.getEffectiveContent(this.config.data.id)
		const mainContent = getMainContent(this.config.data)
		return (
			contents.length > 1 &&
			activeContent?.contentId !== undefined &&
			activeContent.contentId === mainContent?.contentId
		)
	}

	private updateLayout(): void {
		if (!this.tag) return
		const stage = this.elementGroup.getStage()
		if (!stage) return
		const viewportScale = stage.scaleX()
		const elementScaleX = this.elementGroup.scaleX()
		const elementScaleY = this.elementGroup.scaleY()
		const totalScaleX = viewportScale * elementScaleX
		const totalScaleY = viewportScale * elementScaleY
		if (!Number.isFinite(totalScaleX) || !Number.isFinite(totalScaleY)) return
		if (!totalScaleX || !totalScaleY) return

		const offsetX = resolveImageControlCanvasOffset(totalScaleX)
		const offsetY = resolveImageControlCanvasOffset(totalScaleY)
		const elementScreenWidth = Math.abs(this.config.width * totalScaleX)
		const elementScreenHeight = Math.abs(this.config.height * totalScaleY)
		const offsetScreenX = offsetX * totalScaleX
		const offsetScreenY = offsetY * totalScaleY
		const tagScreenWidth = this.tag.width()
		const tagScreenHeight = this.tag.height()

		this.tag.scale({ x: 1 / totalScaleX, y: 1 / totalScaleY })
		this.tag.position({ x: offsetX, y: offsetY })
		this.tag.visible(
			elementScreenWidth >= tagScreenWidth + offsetScreenX * 2 &&
				elementScreenHeight >= tagScreenHeight + offsetScreenY * 2,
		)
		this.tag.opacity(this.config.canvas.permissionManager.can("document.write") ? 1 : 0.55)
		this.tag.moveToTop()
		this.tag.getLayer()?.batchDraw()
	}

	private setupListeners(): void {
		if (!this.viewportHandler) {
			this.viewportHandler = () => this.updateLayout()
			this.config.canvas.eventEmitter.on("viewport:scale", this.viewportHandler)
		}
		if (!this.transformHandler) {
			this.transformHandler = () => this.updateLayout()
			this.elementGroup.on("transform", this.transformHandler)
		}
		if (!this.permissionChangedHandler) {
			this.permissionChangedHandler = () => this.updateLayout()
			this.config.canvas.eventEmitter.on("permission:changed", this.permissionChangedHandler)
		}
	}

	private destroyTag(): void {
		this.tag?.destroy()
		this.tag = undefined
	}
}
