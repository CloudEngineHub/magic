import Konva from "konva"
import {
	ElementTypeEnum,
	type LayerElement,
	type StoryboardElement as StoryboardElementData,
	type StoryboardGenerationConfig,
	type StoryboardShot,
} from "../../document/types"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type {
	StoryboardControlAction,
	StoryboardControlState,
	StoryboardSelectPresentation,
} from "../../interaction/storyboard/StoryboardInteractionManager"
import { generateUUID } from "../../shared/ids"
import { RenderUtils } from "../../shared/render/RenderUtils"
import {
	BaseElement,
	type ElementTransformConstraints,
	type TransformContext,
} from "../core/BaseElement"
import { STORYBOARD_CONFIG } from "./StoryboardElement.config"
import {
	resolveStoryboardElementLayout,
	resolveStoryboardRequiredHeight,
	type StoryboardElementLayout,
	type StoryboardParameterLayout,
	type StoryboardShotLayout,
} from "./StoryboardElement.layout"

type StoryboardControlKind =
	"parameter" | "duration" | "description" | "delete" | "add" | "generate"

interface StoryboardControlMetadata {
	action: StoryboardControlAction
	kind: StoryboardControlKind
	visualNode: Konva.Group
	overlayAnchorNode?: Konva.Node
	selectPresentation?: StoryboardSelectPresentation
	baseBounds: { x: number; y: number; width: number; height: number }
}

type CreatedStoryboardElementData = StoryboardElementData & { shots: StoryboardShot[] }

function formatModelName(modelId?: string): string {
	if (!modelId) return "-"
	return modelId
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => {
			const normalized = part.toLowerCase()
			if (normalized === "gpt") return "GPT"
			if (/^\d+$/.test(part)) return part
			return `${part.charAt(0).toUpperCase()}${part.slice(1)}`
		})
		.join(" ")
}

function resolveAspectRatio(config?: StoryboardGenerationConfig): string {
	const configured = config?.image_generation_config?.aspect_ratio
	if (configured) return configured
	const match = config?.size?.match(/^(\d+)x(\d+)$/i)
	if (!match) return "-"
	const width = Number(match[1])
	const height = Number(match[2])
	if (!width || !height) return "-"

	const greatestCommonDivisor = (left: number, right: number): number =>
		right === 0 ? left : greatestCommonDivisor(right, left % right)
	const divisor = greatestCommonDivisor(width, height)
	return `${width / divisor}:${height / divisor}`
}

/**
 * 分镜函数节点。
 *
 * 节点只呈现持久化 DSL 状态；当前 CanvasDesignMethods 尚无分镜生成契约，
 * 因此生成按钮保持为信息性控件，避免在画布层伪造模型任务或任务状态。
 */
export class StoryboardElement extends BaseElement<StoryboardElementData> {
	private interactionCleanups: Array<() => void> = []
	private interactionEventUnsubscribers: Array<() => void> = []
	public static getDefaultConfig() {
		return {
			width: STORYBOARD_CONFIG.DEFAULT_WIDTH,
			height: STORYBOARD_CONFIG.DEFAULT_HEIGHT,
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public static createElementData(options: {
		id: string
		x: number
		y: number
		zIndex?: number
		name?: string
		width?: number
		height?: number
		generationConfig?: StoryboardGenerationConfig
		shots?: StoryboardShot[]
	}): CreatedStoryboardElementData {
		const width = options.width ?? STORYBOARD_CONFIG.DEFAULT_WIDTH
		const shots = options.shots ?? [
			{
				id: generateUUID(),
				durationSeconds: 3,
				description: "",
			},
		]
		const requiredHeight = resolveStoryboardRequiredHeight(width, shots.length)
		return {
			id: options.id,
			type: ElementTypeEnum.Storyboard,
			x: options.x,
			y: options.y,
			width,
			height: Math.max(options.height ?? STORYBOARD_CONFIG.DEFAULT_HEIGHT, requiredHeight),
			zIndex: options.zIndex ?? 0,
			name: options.name,
			generationConfig: options.generationConfig,
			shots,
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public getRenderName(): string {
		return this.getText("storyboard.defaultName", "分镜生成")
	}

	public render(): Konva.Group {
		const width = Math.max(this.data.width ?? STORYBOARD_CONFIG.DEFAULT_WIDTH, 1)
		const height = Math.max(this.data.height ?? STORYBOARD_CONFIG.DEFAULT_HEIGHT, 1)
		const layout = resolveStoryboardElementLayout(width, height, this.data.shots?.length ?? 0)
		const group = new Konva.Group({
			width,
			height,
			// 外部 DSL 可能带入早期或异常尺寸。Transformer 会约束后续缩放，
			// 这里仍需裁剪内容，保证首次加载时子节点不会污染相邻画布区域。
			clipFunc: (context) => context.rect(0, 0, width, height),
		})
		RenderUtils.createHitNode(group, width, height)
		group.add(
			new Konva.Rect({
				width,
				height,
				fill: STORYBOARD_CONFIG.BACKGROUND,
				stroke: STORYBOARD_CONFIG.BORDER,
				strokeWidth: Math.max(1, 1.5 * layout.scale),
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-background",
			}),
		)

		this.renderParameters(group, layout)
		this.renderShotList(group, layout)
		this.renderFooter(group, layout)

		this.finalizeNode(group)
		return group
	}

	public update(newData: StoryboardElementData): boolean {
		const previousData = this.data
		this.data = newData
		const needsRerender =
			previousData.width !== newData.width ||
			previousData.height !== newData.height ||
			previousData.generationConfig !== newData.generationConfig ||
			previousData.shots !== newData.shots

		if (!needsRerender && this.node) {
			this.updateBaseProps(this.node, newData)
		}
		return needsRerender
	}

	public override onMounted(): void {
		this.syncInteractionHitTargets()
	}

	protected override setupNodeListeners(node: Konva.Node): void {
		super.setupNodeListeners(node)
		if (!(node instanceof Konva.Group)) return

		const manager = this.canvas.storyboardInteractionManager
		if (manager) {
			node.find(".storyboard-control-hit").forEach((candidate) => {
				if (!(candidate instanceof Konva.Rect)) return
				const metadata = candidate.getAttr("storyboardControlMetadata") as
					StoryboardControlMetadata | undefined
				if (!metadata) return
				this.interactionCleanups.push(
					manager.bindControl({
						elementId: this.data.id,
						node: candidate,
						overlayAnchorNode: metadata.overlayAnchorNode,
						selectPresentation: metadata.selectPresentation,
						action: metadata.action,
						applyState: (state) => this.applyControlState(metadata, state),
					}),
				)
			})
		}

		const syncHitTargets = () => this.syncInteractionHitTargets()
		if (this.canvas.eventEmitter) {
			this.interactionEventUnsubscribers.push(
				this.canvas.eventEmitter.on("viewport:scale", syncHitTargets),
				this.canvas.eventEmitter.on("canvas:devicechange", syncHitTargets),
			)
		}
		this.syncInteractionHitTargets()
	}

	protected override cleanupNodeListeners(node: Konva.Node): void {
		this.interactionCleanups.forEach((cleanup) => cleanup())
		this.interactionCleanups = []
		this.interactionEventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.interactionEventUnsubscribers = []
		super.cleanupNodeListeners(node)
	}

	public override getTransformBehavior(): TransformBehavior {
		return TransformBehavior.APPLY_TO_SIZE
	}

	public override getTransformConstraints(): ElementTransformConstraints {
		return {
			enabledAnchors: [],
			minWidth: STORYBOARD_CONFIG.MIN_WIDTH,
			minHeight: STORYBOARD_CONFIG.MIN_HEIGHT,
		}
	}

	public override applyTransform(
		updates: Partial<LayerElement>,
		context: TransformContext,
	): Partial<LayerElement> {
		if (context.isScaling) {
			return {
				x: updates.x,
				y: updates.y,
				width: this.data.width ?? STORYBOARD_CONFIG.DEFAULT_WIDTH,
				height: this.data.height ?? STORYBOARD_CONFIG.DEFAULT_HEIGHT,
				scaleX: 1,
				scaleY: 1,
			}
		}
		return { x: updates.x, y: updates.y }
	}

	protected override setupCustomBoundingRect(node: Konva.Group): void {
		const originalGetClientRect = node.getClientRect.bind(node)
		node.getClientRect = (config?: Parameters<Konva.Node["getClientRect"]>[0]) => {
			const background = node.findOne(".storyboard-background") as Konva.Rect | undefined
			return background?.getClientRect(config) ?? originalGetClientRect(config)
		}
	}

	private renderParameters(group: Konva.Group, layout: StoryboardElementLayout): void {
		const settingsGroup = new Konva.Group({
			name: "storyboard-settings-region",
			clipX: layout.contentRect.x,
			clipY: layout.contentRect.y,
			clipWidth: layout.contentRect.width,
			clipHeight: layout.settingsRect.height,
		})
		group.add(settingsGroup)
		const config = this.data.generationConfig

		this.renderParameterRow(settingsGroup, layout.parameterRows.model, {
			label: this.getText("storyboard.imageModel", "图片模型"),
			value: formatModelName(config?.model_id),
			iconUrl: this.canvas.storyboardInteractionManager?.getModelIcon(config?.model_id),
			action: { type: "select-model" },
		})
		this.renderParameterRow(settingsGroup, layout.parameterRows.aspectRatio, {
			label: this.getText("storyboard.aspectRatio", "画面比例"),
			value: resolveAspectRatio(config),
			action: { type: "select-aspect-ratio" },
		})
		this.renderParameterRow(settingsGroup, layout.parameterRows.resolution, {
			label: this.getText("storyboard.resolution", "分辨率"),
			value: config?.resolution || "-",
			action: { type: "select-resolution" },
		})

		settingsGroup.add(
			new Konva.Line({
				points: [
					layout.contentRect.x,
					layout.dividerY,
					layout.contentRect.x + layout.contentRect.width,
					layout.dividerY,
				],
				stroke: STORYBOARD_CONFIG.BORDER_SUBTLE,
				strokeWidth: Math.max(1, layout.scale),
				listening: false,
				perfectDrawEnabled: false,
			}),
		)

		if (!layout.showShotListTitle) return
		settingsGroup.add(
			new Konva.Text({
				...layout.titleRect,
				text: this.getText("storyboard.shotList", "分镜列表"),
				fontFamily: layout.fontFamily,
				fontSize: layout.titleFontSize,
				fontStyle: "bold",
				fill: STORYBOARD_CONFIG.PRIMARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-list-title",
			}),
		)
	}

	private renderParameterRow(
		group: Konva.Group,
		row: StoryboardParameterLayout,
		options: {
			label: string
			value: string
			iconUrl?: string
			action: StoryboardControlAction
		},
	): void {
		const { label, value, iconUrl, action } = options
		const visual = new Konva.Group({ listening: false })
		const background = new Konva.Rect({
			...row.backgroundRect,
			fill: "rgba(255, 255, 255, 0)",
			cornerRadius: row.cornerRadius,
			listening: false,
			perfectDrawEnabled: false,
			name: "storyboard-control-background",
		})
		visual.add(background)
		if (row.showLabel) {
			visual.add(
				new Konva.Text({
					...row.labelRect,
					text: `${label}：`,
					verticalAlign: "middle",
					fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
					fontSize: row.labelFontSize,
					fill: STORYBOARD_CONFIG.SECONDARY_TEXT,
					listening: false,
					perfectDrawEnabled: false,
					name: "storyboard-control-label",
				}),
			)
		}
		visual.add(
			new Konva.Text({
				...row.valueTextRect,
				text: value,
				align: "left",
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: row.fontSize,
				fill: STORYBOARD_CONFIG.PRIMARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				ellipsis: true,
				wrap: "none",
				name: "storyboard-control-text",
			}),
			this.createSelectSuffix(row),
		)
		const overlayAnchor = new Konva.Rect({
			...row.triggerRect,
			listening: false,
		})
		visual.add(overlayAnchor)
		group.add(visual)
		if (iconUrl && row.modelIconRect && typeof Image !== "undefined") {
			const iconImage = new Image()
			iconImage.crossOrigin = "anonymous"
			iconImage.onload = () => {
				if (!visual.getParent() || visual.findOne(".storyboard-model-icon")) return
				visual.add(
					new Konva.Image({
						image: iconImage,
						...row.modelIconRect,
						listening: false,
						perfectDrawEnabled: false,
						name: "storyboard-model-icon",
					}),
				)
				visual.getLayer()?.batchDraw()
			}
			iconImage.src = iconUrl
		}
		this.addControlHit(group, {
			action,
			kind: "parameter",
			visualNode: visual,
			overlayAnchorNode: overlayAnchor,
			selectPresentation: {
				fontSize: row.fontSize,
				horizontalPadding: row.horizontalPadding,
				suffixGap: row.suffixGap,
				suffixIconSize: row.suffixIconSize,
				modelIconUrl: iconUrl,
				modelIconSize: row.modelIconRect?.width,
				modelIconGap: row.modelIconGap,
			},
			baseBounds: row.rect,
		})
	}

	private createSelectSuffix(row: StoryboardParameterLayout): Konva.Line {
		const strokeWidth = Math.max(1.5, row.suffixIconSize * 0.14)
		const inset = row.suffixIconSize * 0.22
		const centerX = row.suffixRect.x + row.suffixRect.width / 2
		const centerY = row.suffixRect.y + row.suffixRect.height / 2
		const halfWidth = Math.max(1, row.suffixRect.width / 2 - inset)
		const halfHeight = Math.max(1, row.suffixRect.height * 0.18)

		return new Konva.Line({
			points: [
				centerX - halfWidth,
				centerY - halfHeight,
				centerX,
				centerY + halfHeight,
				centerX + halfWidth,
				centerY - halfHeight,
			],
			stroke: STORYBOARD_CONFIG.PRIMARY_TEXT,
			strokeWidth,
			lineCap: "round",
			lineJoin: "round",
			listening: false,
			perfectDrawEnabled: false,
			name: "storyboard-control-suffix",
		})
	}

	private renderShotList(group: Konva.Group, layout: StoryboardElementLayout): void {
		const shotListGroup = new Konva.Group({
			name: "storyboard-shot-list-region",
			clipX: layout.shotListRect.x,
			clipY: layout.shotListRect.y,
			clipWidth: layout.shotListRect.width,
			clipHeight: layout.shotListRect.height,
		})
		group.add(shotListGroup)
		const shots = this.data.shots ?? []
		if (shots.length === 0) {
			shotListGroup.add(
				new Konva.Rect({
					...layout.shotListRect,
					fill: STORYBOARD_CONFIG.SURFACE,
					stroke: STORYBOARD_CONFIG.BORDER_SUBTLE,
					strokeWidth: Math.max(1, layout.scale),
					dash: [8 * layout.scale, 8 * layout.scale],
					cornerRadius: STORYBOARD_CONFIG.SHOT_RADIUS * layout.scale,
					listening: false,
					perfectDrawEnabled: false,
				}),
				new Konva.Text({
					...layout.shotListRect,
					text: this.getText("storyboard.empty", "暂无分镜"),
					align: "center",
					verticalAlign: "middle",
					fontFamily: layout.fontFamily,
					fontSize: layout.shotFontSize,
					fill: STORYBOARD_CONFIG.SECONDARY_TEXT,
					listening: false,
					perfectDrawEnabled: false,
				}),
			)
			return
		}

		shots.slice(0, layout.visibleShotCount).forEach((shot, index) => {
			const shotLayout = layout.shotLayouts[index]
			if (!shotLayout) return
			this.renderShot(shotListGroup, shotLayout, shot, index)
		})
	}

	private hasOutputImageElement(shot: StoryboardShot): boolean {
		const outputImageElementId = shot.outputImageElementId
		if (!outputImageElementId) return false
		const getElementData = this.canvas.elementManager?.getElementData
		if (typeof getElementData !== "function") return false
		return (
			getElementData.call(this.canvas.elementManager, outputImageElementId)?.type ===
			ElementTypeEnum.Image
		)
	}

	private renderShot(
		group: Konva.Group,
		layout: StoryboardShotLayout,
		shot: StoryboardShot,
		index: number,
	): void {
		const { rect, titleRect, statusRect, descriptionRect, descriptionTextRect } = layout
		const controls = layout.controls
		group.add(
			new Konva.Rect({
				...rect,
				fill: STORYBOARD_CONFIG.SURFACE,
				stroke: STORYBOARD_CONFIG.BORDER,
				strokeWidth: layout.strokeWidth,
				cornerRadius: layout.cornerRadius,
				listening: false,
				perfectDrawEnabled: false,
				name: `storyboard-shot-${shot.id}`,
			}),
		)

		const shotLabel = this.getText("storyboard.shotWithIndex", "分镜 {{index}}").replace(
			"{{index}}",
			String(index + 1),
		)
		group.add(
			new Konva.Text({
				...titleRect,
				text: shotLabel,
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: Math.min(layout.titleRect.height, 20 * controls.scale),
				fontStyle: "bold",
				fill: STORYBOARD_CONFIG.ACCENT,
				listening: false,
				perfectDrawEnabled: false,
			}),
		)

		const generated = this.hasOutputImageElement(shot)
		if (statusRect.width > 0) {
			group.add(
				new Konva.Text({
					...statusRect,
					text: generated
						? this.getText("storyboard.generated", "已生成")
						: this.getText("storyboard.notGenerated", "未生成"),
					fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
					fontSize: Math.min(statusRect.height, 16 * controls.scale),
					fill: generated ? STORYBOARD_CONFIG.ACCENT : STORYBOARD_CONFIG.SECONDARY_TEXT,
					listening: false,
					perfectDrawEnabled: false,
				}),
			)
		}

		const durationVisual = new Konva.Group({ listening: false })
		const durationBackground = new Konva.Rect({
			...controls.durationRect,
			fill: STORYBOARD_CONFIG.BACKGROUND,
			stroke: STORYBOARD_CONFIG.BORDER,
			strokeWidth: Math.max(1, controls.scale),
			cornerRadius: 8 * controls.scale,
			listening: false,
			perfectDrawEnabled: false,
			name: "storyboard-control-background",
		})
		durationVisual.add(
			durationBackground,
			new Konva.Text({
				...controls.durationRect,
				text: `${shot.durationSeconds}  ${this.getText("storyboard.seconds", "秒")}`,
				align: "center",
				verticalAlign: "middle",
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: 16 * controls.scale,
				fill: STORYBOARD_CONFIG.PRIMARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-text",
			}),
		)
		group.add(durationVisual)
		this.addControlHit(group, {
			action: { type: "edit-duration", shotId: shot.id },
			kind: "duration",
			visualNode: durationVisual,
			overlayAnchorNode: durationBackground,
			baseBounds: controls.durationRect,
		})

		const generateVisual = new Konva.Group({ listening: false })
		generateVisual.add(
			new Konva.Rect({
				...controls.generateRect,
				fill: STORYBOARD_CONFIG.DISABLED_BACKGROUND,
				cornerRadius: 8 * controls.scale,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-background",
			}),
			new Konva.Text({
				...controls.generateRect,
				text: generated
					? `↻ ${this.getText("storyboard.regenerate", "重新生成")}`
					: this.getText("storyboard.generate", "生成"),
				align: "center",
				verticalAlign: "middle",
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: 16 * controls.scale,
				fontStyle: "bold",
				fill: STORYBOARD_CONFIG.DISABLED_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-text",
			}),
		)
		group.add(generateVisual)
		this.addControlHit(group, {
			action: { type: "generate-shot", shotId: shot.id, disabled: true },
			kind: "generate",
			visualNode: generateVisual,
			baseBounds: controls.generateRect,
		})

		const deleteVisual = new Konva.Group({ listening: false })
		const deleteCenterX = controls.deleteRect.x + controls.deleteRect.width / 2
		const deleteCenterY = controls.deleteRect.y + controls.deleteRect.height / 2
		const closeHalfSize = 5 * controls.scale
		deleteVisual.add(
			new Konva.Circle({
				x: deleteCenterX,
				y: deleteCenterY,
				radius: controls.deleteRect.width / 2,
				fill: STORYBOARD_CONFIG.SECONDARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-background",
			}),
			new Konva.Line({
				points: [
					deleteCenterX - closeHalfSize,
					deleteCenterY - closeHalfSize,
					deleteCenterX + closeHalfSize,
					deleteCenterY + closeHalfSize,
				],
				stroke: STORYBOARD_CONFIG.BACKGROUND,
				strokeWidth: Math.max(1.5, 1.8 * controls.scale),
				lineCap: "round",
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-icon",
			}),
			new Konva.Line({
				points: [
					deleteCenterX + closeHalfSize,
					deleteCenterY - closeHalfSize,
					deleteCenterX - closeHalfSize,
					deleteCenterY + closeHalfSize,
				],
				stroke: STORYBOARD_CONFIG.BACKGROUND,
				strokeWidth: Math.max(1.5, 1.8 * controls.scale),
				lineCap: "round",
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-icon",
			}),
		)
		group.add(deleteVisual)
		this.addControlHit(group, {
			action: { type: "delete-shot", shotId: shot.id },
			kind: "delete",
			visualNode: deleteVisual,
			baseBounds: controls.deleteRect,
		})

		const descriptionVisual = new Konva.Group({ listening: false })
		const descriptionBackground = new Konva.Rect({
			...descriptionRect,
			fill: STORYBOARD_CONFIG.BACKGROUND,
			stroke: STORYBOARD_CONFIG.BORDER_SUBTLE,
			strokeWidth: layout.strokeWidth,
			cornerRadius: 9 * controls.scale,
			listening: false,
			perfectDrawEnabled: false,
			name: "storyboard-control-background",
		})
		descriptionVisual.add(
			descriptionBackground,
			new Konva.Text({
				...descriptionTextRect,
				text:
					shot.description ||
					this.getText("storyboard.descriptionPlaceholder", "请输入分镜画面描述"),
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: 16 * controls.scale,
				lineHeight: 1.45,
				fill: shot.description
					? STORYBOARD_CONFIG.PRIMARY_TEXT
					: STORYBOARD_CONFIG.SECONDARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				ellipsis: true,
				wrap: "word",
				name: "storyboard-control-text",
			}),
		)
		group.add(descriptionVisual)
		this.addControlHit(group, {
			action: { type: "edit-description", shotId: shot.id },
			kind: "description",
			visualNode: descriptionVisual,
			overlayAnchorNode: descriptionBackground,
			baseBounds: descriptionRect,
		})
	}

	private renderFooter(group: Konva.Group, layout: StoryboardElementLayout): void {
		const footer = layout.footer
		const footerGroup = new Konva.Group({
			name: "storyboard-footer-region",
			clipX: footer.rect.x,
			clipY: footer.rect.y,
			clipWidth: footer.rect.width,
			clipHeight: footer.rect.height,
		})
		group.add(footerGroup)
		const addVisual = new Konva.Group({ listening: false })
		addVisual.add(
			new Konva.Rect({
				...footer.addShotRect,
				fill: STORYBOARD_CONFIG.BACKGROUND,
				stroke: STORYBOARD_CONFIG.BORDER,
				strokeWidth: footer.strokeWidth,
				dash: [7 * layout.scale, 7 * layout.scale],
				cornerRadius: 10 * layout.scale,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-background",
			}),
			new Konva.Text({
				...footer.addShotRect,
				text: `＋ ${this.getText("storyboard.addShot", "添加分镜")}`,
				align: "center",
				verticalAlign: "middle",
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: layout.valueFontSize,
				fontStyle: "bold",
				fill: STORYBOARD_CONFIG.SECONDARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-text",
			}),
		)
		footerGroup.add(addVisual)
		this.addControlHit(footerGroup, {
			action: { type: "add-shot" },
			kind: "add",
			visualNode: addVisual,
			baseBounds: footer.addShotRect,
		})

		footerGroup.add(
			new Konva.Line({
				points: [
					footer.rect.x,
					footer.separatorY,
					footer.rect.x + footer.rect.width,
					footer.separatorY,
				],
				stroke: STORYBOARD_CONFIG.BORDER_SUBTLE,
				strokeWidth: footer.strokeWidth,
				listening: false,
				perfectDrawEnabled: false,
			}),
		)
		// TODO: 接入图片生成积分计算接口后，在这里注入批量生成的实际 points。
		// 当前没有可靠的计费接口，不能用分镜数量或其他字段伪造积分，因此暂不渲染。
		const pointsCost: number | null = null
		if (pointsCost !== null) {
			footerGroup.add(
				new Konva.Text({
					x: footer.actionsRect.x,
					y: footer.actionsRect.y,
					width: Math.max(
						0,
						footer.generateAllRect.x - footer.actionsRect.x - 20 * layout.scale,
					),
					height: footer.actionsRect.height,
					text: this.getText("storyboard.pointsCost", "消耗 {{count}} 点").replace(
						"{{count}}",
						String(pointsCost),
					),
					align: "right",
					verticalAlign: "middle",
					fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
					fontSize: layout.shotSmallFontSize,
					fill: STORYBOARD_CONFIG.SECONDARY_TEXT,
					listening: false,
					perfectDrawEnabled: false,
					name: "storyboard-points-cost",
				}),
			)
		}
		const generateAllVisual = new Konva.Group({ listening: false })
		generateAllVisual.add(
			new Konva.Rect({
				...footer.generateAllRect,
				fill: STORYBOARD_CONFIG.ACCENT,
				cornerRadius: footer.cornerRadius,
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-generate-all",
			}),
			new Konva.Text({
				...footer.generateAllRect,
				text: this.getText("storyboard.generateAll", "全部生成"),
				align: "center",
				verticalAlign: "middle",
				fontFamily: STORYBOARD_CONFIG.FONT_FAMILY,
				fontSize: 20 * footer.generateAllScale,
				fontStyle: "bold",
				fill: "#FFFFFF",
				listening: false,
				perfectDrawEnabled: false,
				name: "storyboard-control-text",
			}),
		)
		footerGroup.add(generateAllVisual)
		this.addControlHit(footerGroup, {
			action: { type: "generate-all" },
			kind: "generate",
			visualNode: generateAllVisual,
			baseBounds: footer.generateAllRect,
		})
	}

	private addControlHit(group: Konva.Group, metadata: StoryboardControlMetadata): void {
		const hit = new Konva.Rect({
			...metadata.baseBounds,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
			perfectDrawEnabled: false,
			name: "storyboard-control-hit",
		})
		hit.setAttr("storyboardControlMetadata", metadata)
		hit.setAttr("storyboardBaseHitBounds", metadata.baseBounds)
		group.add(hit)
	}

	private syncInteractionHitTargets(): void {
		if (!(this.node instanceof Konva.Group)) return
		const coarsePointer = this.canvas.deviceInfo?.input?.coarsePointer ?? false
		const minimumScreenSize = coarsePointer
			? STORYBOARD_CONFIG.COARSE_POINTER_MIN_HIT_SIZE
			: STORYBOARD_CONFIG.DESKTOP_MIN_HIT_SIZE

		this.node.find(".storyboard-control-hit").forEach((candidate) => {
			if (!(candidate instanceof Konva.Rect)) return
			const baseBounds = candidate.getAttr("storyboardBaseHitBounds") as
				{ x: number; y: number; width: number; height: number } | undefined
			if (!baseBounds) return
			const absoluteScale = candidate.getAbsoluteScale()
			const scaleX = Math.max(0.0001, Math.abs(absoluteScale.x))
			const scaleY = Math.max(0.0001, Math.abs(absoluteScale.y))
			const width = Math.max(baseBounds.width, minimumScreenSize / scaleX)
			const height = Math.max(baseBounds.height, minimumScreenSize / scaleY)
			candidate.setAttrs({
				x: baseBounds.x - (width - baseBounds.width) / 2,
				y: baseBounds.y - (height - baseBounds.height) / 2,
				width,
				height,
			})
		})
	}

	private applyControlState(
		metadata: StoryboardControlMetadata,
		state: StoryboardControlState,
	): void {
		const background = metadata.visualNode.findOne(".storyboard-control-background") as
			Konva.Shape | undefined
		const text = metadata.visualNode.findOne(".storyboard-control-text") as
			Konva.Text | undefined
		const suffix = metadata.visualNode.findOne(".storyboard-control-suffix") as
			Konva.Shape | undefined
		if (!background) return

		switch (metadata.kind) {
			case "parameter": {
				if (state === "disabled") {
					background.fill(STORYBOARD_CONFIG.DISABLED_BACKGROUND)
					text?.fill(STORYBOARD_CONFIG.DISABLED_TEXT)
					if (suffix instanceof Konva.Line) suffix.stroke(STORYBOARD_CONFIG.DISABLED_TEXT)
					else suffix?.fill(STORYBOARD_CONFIG.DISABLED_TEXT)
					break
				}

				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.SURFACE_PRESSED
						: state === "hover" || state === "editing"
							? STORYBOARD_CONFIG.SURFACE_STRONG
							: "rgba(255, 255, 255, 0)",
				)
				const foreground =
					state === "hover" || state === "pressed" || state === "editing"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.PRIMARY_TEXT
				text?.fill(foreground)
				if (suffix instanceof Konva.Line) suffix.stroke(foreground)
				else suffix?.fill(foreground)
				break
			}
			case "duration":
				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.SURFACE_PRESSED
						: state === "hover" || state === "editing"
							? STORYBOARD_CONFIG.SURFACE_STRONG
							: STORYBOARD_CONFIG.BACKGROUND,
				)
				background.stroke(
					state === "hover" || state === "pressed" || state === "editing"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.BORDER,
				)
				text?.fill(
					state === "hover" || state === "pressed" || state === "editing"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.PRIMARY_TEXT,
				)
				break
			case "description":
				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.SURFACE_PRESSED
						: state === "hover" || state === "editing"
							? STORYBOARD_CONFIG.SURFACE_STRONG
							: STORYBOARD_CONFIG.BACKGROUND,
				)
				background.stroke(
					state === "hover" || state === "pressed" || state === "editing"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.BORDER_SUBTLE,
				)
				break
			case "delete":
				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.DANGER_PRESSED
						: state === "hover"
							? STORYBOARD_CONFIG.DANGER_HOVER
							: STORYBOARD_CONFIG.SECONDARY_TEXT,
				)
				break
			case "add":
				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.ACCENT_SOFT
						: state === "hover"
							? STORYBOARD_CONFIG.SURFACE_STRONG
							: STORYBOARD_CONFIG.BACKGROUND,
				)
				background.stroke(
					state === "hover" || state === "pressed"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.BORDER,
				)
				text?.fill(
					state === "hover" || state === "pressed"
						? STORYBOARD_CONFIG.ACCENT
						: STORYBOARD_CONFIG.SECONDARY_TEXT,
				)
				break
			case "generate":
				if ("disabled" in metadata.action && metadata.action.disabled) {
					background.fill(STORYBOARD_CONFIG.DISABLED_BACKGROUND)
					text?.fill(STORYBOARD_CONFIG.DISABLED_TEXT)
					break
				}
				background.fill(
					state === "pressed"
						? STORYBOARD_CONFIG.DANGER_PRESSED
						: state === "hover"
							? STORYBOARD_CONFIG.ACCENT
							: STORYBOARD_CONFIG.ACCENT,
				)
				text?.fill("#FFFFFF")
				break
		}
	}
}
