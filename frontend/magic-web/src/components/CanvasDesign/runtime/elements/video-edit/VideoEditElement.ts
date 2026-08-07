import Konva from "konva"
import {
	ElementTypeEnum,
	type LayerElement,
	type VideoEditElement as VideoEditElementData,
} from "../../document/types"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type {
	TransformContext,
	BaseElement,
	ElementTransformConstraints,
} from "../core/BaseElement"
import { RenderUtils } from "../../shared/render/RenderUtils"
import type { Canvas } from "../../core/Canvas"
import { VIDEO_EDIT_CONFIG } from "./VideoEditElement.config"

/**
 * 视频编辑节点的基础画布承载。
 * 这里只呈现 DSL 中已有的输入数量和输出规格，不启动合成任务或推断媒体运行态。
 */
export class VideoEditElement extends BaseElement<VideoEditElementData> {
	public static getDefaultConfig() {
		return {
			width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
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
		videoSequence?: string[]
		audioSequence?: string[]
		output?: VideoEditElementData["output"]
	}): VideoEditElementData {
		return {
			id: options.id,
			type: ElementTypeEnum.VideoEdit,
			x: options.x,
			y: options.y,
			width: options.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: options.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
			zIndex: options.zIndex ?? 0,
			name: options.name,
			videoSequence: [...(options.videoSequence ?? [])],
			audioSequence: [...(options.audioSequence ?? [])],
			output: options.output ? { ...options.output } : undefined,
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public getRenderName(): string {
		return this.getText("videoEditNode.defaultName", "视频编辑")
	}

	public render(): Konva.Group {
		const width = Math.max(this.data.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH, 1)
		const height = Math.max(this.data.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT, 1)
		const group = new Konva.Group({ width, height })
		const padding = Math.min(24, Math.max(16, width * 0.04))

		RenderUtils.createHitNode(group, width, height)
		group.add(
			new Konva.Rect({
				width,
				height,
				fill: VIDEO_EDIT_CONFIG.BACKGROUND,
				stroke: VIDEO_EDIT_CONFIG.BORDER,
				strokeWidth: 1,
				cornerRadius: 16,
				listening: false,
				perfectDrawEnabled: false,
				name: "video-edit-background",
			}),
		)
		group.add(
			new Konva.Text({
				x: padding,
				y: padding,
				text: this.getRenderName(),
				fontSize: 20,
				fontStyle: "bold",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				listening: false,
				name: "video-edit-title",
			}),
		)

		const videoCount = this.data.videoSequence.length
		const audioCount = this.data.audioSequence.length
		const output = this.data.output
		const outputSummary = [output?.aspectRatio, output?.resolution, output?.format]
			.filter(Boolean)
			.join(" · ")
		group.add(
			new Konva.Rect({
				x: padding,
				y: 68,
				width: width - padding * 2,
				height: Math.max(1, height - 136),
				fill: VIDEO_EDIT_CONFIG.SURFACE,
				cornerRadius: 12,
				listening: false,
				name: "video-edit-surface",
			}),
		)
		group.add(
			new Konva.Text({
				x: padding * 1.5,
				y: 92,
				width: width - padding * 3,
				text: `视频片段  ${videoCount} 个\n音频轨道  ${audioCount} 个`,
				fontSize: 18,
				lineHeight: 1.6,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				listening: false,
				name: "video-edit-input-summary",
			}),
		)
		group.add(
			new Konva.Text({
				x: padding * 1.5,
				y: Math.max(140, height - 112),
				width: width - padding * 3,
				text: outputSummary.length > 0 ? `输出规格  ${outputSummary}` : "输出规格  待设置",
				fontSize: 16,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
				listening: false,
				name: "video-edit-output-summary",
			}),
		)
		this.finalizeNode(group)
		return group
	}

	public update(newData: VideoEditElementData): boolean {
		const previousData = this.data
		this.data = newData
		const needsRerender =
			previousData.width !== newData.width ||
			previousData.height !== newData.height ||
			previousData.videoSequence !== newData.videoSequence ||
			previousData.audioSequence !== newData.audioSequence ||
			previousData.output !== newData.output

		if (!needsRerender && this.node) {
			this.updateBaseProps(this.node, newData)
		}
		return needsRerender
	}

	public override getTransformBehavior(): TransformBehavior {
		return TransformBehavior.APPLY_TO_SIZE
	}

	public override getTransformConstraints(): ElementTransformConstraints {
		return {
			enabledAnchors: [],
			minWidth: VIDEO_EDIT_CONFIG.MIN_WIDTH,
			minHeight: VIDEO_EDIT_CONFIG.MIN_HEIGHT,
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
				width: this.data.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
				height: this.data.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
				scaleX: 1,
				scaleY: 1,
			}
		}
		return { x: updates.x, y: updates.y }
	}
}
