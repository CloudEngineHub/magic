import Konva from "konva"
import type { CanvasAssetComplianceStatus } from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import { getActiveContent } from "../../document/elementContent"
import { ElementTypeEnum, type ImageElement, type VideoElement } from "../../document/types"
import { COLORS, LAYOUT, resolveImageControlCanvasOffset } from "../image/ImageElement.config"

type VersionedMediaElement = ImageElement | VideoElement

interface MediaComplianceFailedTagDecoratorConfig {
	canvas: Canvas
	width: number
	height: number
	data: VersionedMediaElement
}

interface ComplianceContent {
	contentId?: string
	assetId?: string
	complianceStatus?: CanvasAssetComplianceStatus
}

const TAG_PADDING_X = 10
const TAG_PADDING_Y = 8
const TAG_ICON_SIZE = 14
const TAG_ICON_GAP = 6
const TAG_TITLE_FONT_SIZE = 12
const TAG_HINT_FONT_SIZE = 11
const TAG_LINE_GAP = 2
const TAG_CORNER_RADIUS = 8

/**
 * 媒体合规失败标识：底部水平居中，参考告警卡片（图标 + 双行文案）。
 */
export class MediaComplianceFailedTagDecorator {
	private tag?: Konva.Group
	private tagLayoutWidth = 0
	private tagLayoutHeight = 0
	private viewportLayoutUnsubscribe?: () => void
	private transformHandler?: () => void
	private permissionChangedHandler?: () => void

	constructor(
		private readonly elementGroup: Konva.Group,
		private config: MediaComplianceFailedTagDecoratorConfig,
	) {}

	public create(): void {
		this.destroyTag()
		if (!this.shouldDisplay()) return

		const title = this.config.canvas.t
			? this.config.canvas.t("elementMediaCompliance.failedTag", {
					defaultValue: "合规校验未通过",
				})
			: "合规校验未通过"
		const isVideo = this.config.data.type === ElementTypeEnum.Video
		const hint = this.config.canvas.t
			? isVideo
				? this.config.canvas.t("elementMediaCompliance.failedHintVideo", {
						defaultValue: "请更换视频后重新认证",
					})
				: this.config.canvas.t("elementMediaCompliance.failedHint", {
						defaultValue: "请更换图片后重新认证",
					})
			: isVideo
				? "请更换视频后重新认证"
				: "请更换图片后重新认证"

		const titleProbe = new Konva.Text({
			text: title,
			fontSize: TAG_TITLE_FONT_SIZE,
			fontFamily: LAYOUT.TEXT_FONT_FAMILY,
			fontStyle: "600",
		})
		const hintProbe = new Konva.Text({
			text: hint,
			fontSize: TAG_HINT_FONT_SIZE,
			fontFamily: LAYOUT.TEXT_FONT_FAMILY,
		})
		const textBlockWidth = Math.ceil(
			Math.max(titleProbe.getTextWidth(), hintProbe.getTextWidth()),
		)
		const textBlockHeight = Math.ceil(TAG_TITLE_FONT_SIZE + TAG_LINE_GAP + TAG_HINT_FONT_SIZE)
		titleProbe.destroy()
		hintProbe.destroy()

		this.tagLayoutWidth = Math.ceil(
			TAG_PADDING_X * 2 + TAG_ICON_SIZE + TAG_ICON_GAP + textBlockWidth,
		)
		this.tagLayoutHeight = Math.ceil(
			TAG_PADDING_Y * 2 + Math.max(TAG_ICON_SIZE, textBlockHeight),
		)

		this.tag = new Konva.Group({
			width: this.tagLayoutWidth,
			height: this.tagLayoutHeight,
			name: "decorator-media-compliance-failed-tag",
			listening: false,
		})

		this.tag.add(
			new Konva.Rect({
				width: this.tagLayoutWidth,
				height: this.tagLayoutHeight,
				cornerRadius: TAG_CORNER_RADIUS,
				fill: COLORS.COMPLIANCE_FAILED_TAG_BG,
				stroke: COLORS.COMPLIANCE_FAILED_TAG_BORDER,
				strokeWidth: 1,
				listening: false,
			}),
		)

		const iconY = TAG_PADDING_Y + (this.tagLayoutHeight - TAG_PADDING_Y * 2 - TAG_ICON_SIZE) / 2
		const textX = TAG_PADDING_X + TAG_ICON_SIZE + TAG_ICON_GAP
		const textY =
			TAG_PADDING_Y + (this.tagLayoutHeight - TAG_PADDING_Y * 2 - textBlockHeight) / 2

		this.tag.add(this.createWarningIcon(TAG_PADDING_X, iconY))
		this.tag.add(
			new Konva.Text({
				x: textX,
				y: textY,
				text: title,
				fontSize: TAG_TITLE_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				fontStyle: "600",
				fill: COLORS.COMPLIANCE_FAILED_TAG_TEXT,
				listening: false,
				name: "decorator-media-compliance-failed-title",
			}),
			new Konva.Text({
				x: textX,
				y: textY + TAG_TITLE_FONT_SIZE + TAG_LINE_GAP,
				text: hint,
				fontSize: TAG_HINT_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				fill: COLORS.COMPLIANCE_FAILED_TAG_TEXT,
				listening: false,
				name: "decorator-media-compliance-failed-hint",
			}),
		)

		this.elementGroup.add(this.tag)
		this.tag.moveToTop()
		this.updateLayout()
		this.setupListeners()
	}

	public updateConfig(config: Partial<MediaComplianceFailedTagDecoratorConfig>): void {
		this.config = { ...this.config, ...config }
		this.create()
	}

	public refreshLayout(): void {
		this.updateLayout()
	}

	public destroy(): void {
		this.destroyTag()
		this.viewportLayoutUnsubscribe?.()
		this.viewportLayoutUnsubscribe = undefined
		if (this.transformHandler) {
			this.elementGroup.off("transform", this.transformHandler)
			this.transformHandler = undefined
		}
		if (this.permissionChangedHandler) {
			this.config.canvas.eventEmitter.off("permission:changed", this.permissionChangedHandler)
			this.permissionChangedHandler = undefined
		}
	}

	private createWarningIcon(x: number, y: number): Konva.Group {
		const icon = new Konva.Group({
			x,
			y,
			listening: false,
			name: "decorator-media-compliance-failed-icon",
		})
		icon.add(
			new Konva.Circle({
				x: TAG_ICON_SIZE / 2,
				y: TAG_ICON_SIZE / 2,
				radius: TAG_ICON_SIZE / 2,
				fill: COLORS.COMPLIANCE_FAILED_TAG_ICON,
				listening: false,
			}),
			new Konva.Text({
				x: 0,
				y: 0,
				width: TAG_ICON_SIZE,
				height: TAG_ICON_SIZE,
				text: "!",
				fontSize: 10,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				fontStyle: "700",
				align: "center",
				verticalAlign: "middle",
				fill: COLORS.COMPLIANCE_FAILED_TAG_ICON_MARK,
				listening: false,
			}),
		)
		return icon
	}

	private shouldDisplay(): boolean {
		if (!this.config.canvas.isSeedanceComplianceEnabled()) return false
		return this.resolveComplianceStatus() === "FAILED"
	}

	private resolveComplianceStatus(): CanvasAssetComplianceStatus | undefined {
		const content =
			(this.config.canvas.getEffectiveContent?.(this.config.data.id) as
				ComplianceContent | undefined) ??
			(getActiveContent(this.config.data) as ComplianceContent | undefined)
		const assetId = content?.assetId?.trim()
		if (assetId) {
			return (
				this.config.canvas.assetCompliancePollingManager.getState(assetId)?.status ??
				this.config.canvas.assetResourceManager.getCachedResource(assetId)
					?.complianceStatus ??
				content?.complianceStatus
			)
		}
		return content?.complianceStatus
	}

	private updateLayout(options?: { requestDraw?: boolean }): void {
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

		const offsetY = resolveImageControlCanvasOffset(totalScaleY)
		const elementScreenWidth = Math.abs(this.config.width * totalScaleX)
		const elementScreenHeight = Math.abs(this.config.height * totalScaleY)
		const offsetScreenY = offsetY * totalScaleY
		const horizontalMargin = resolveImageControlCanvasOffset(totalScaleX) * totalScaleX
		const tagFootprintX = this.tagLayoutWidth / totalScaleX
		const tagFootprintY = this.tagLayoutHeight / totalScaleY

		this.tag.offset({ x: 0, y: 0 })
		this.tag.scale({ x: 1 / totalScaleX, y: 1 / totalScaleY })
		this.tag.position({
			x: (this.config.width - tagFootprintX) / 2,
			y: this.config.height - tagFootprintY - offsetY,
		})
		this.tag.visible(
			elementScreenWidth >= this.tagLayoutWidth + horizontalMargin * 2 &&
				elementScreenHeight >= this.tagLayoutHeight + offsetScreenY * 2,
		)
		this.tag.opacity(this.config.canvas.permissionManager.can("document.write") ? 1 : 0.55)
		this.tag.moveToTop()
		if (options?.requestDraw !== false) {
			this.tag.getLayer()?.batchDraw()
		}
	}

	private setupListeners(): void {
		if (!this.viewportLayoutUnsubscribe) {
			this.viewportLayoutUnsubscribe =
				this.config.canvas.runtimeScheduler.registerViewportScaleLayout(
					this.config.data.id,
					() => this.updateLayout({ requestDraw: false }),
				)
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
		this.tagLayoutWidth = 0
		this.tagLayoutHeight = 0
	}
}
