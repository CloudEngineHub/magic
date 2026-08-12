import Konva from "konva"
import { getDownstreamContent, updateContent } from "../../document/elementContent"
import {
	ElementTypeEnum,
	type AudioElement,
	type AudioElementContent,
	type LayerElement,
	type VideoEditElement as VideoEditElementData,
	type VideoEditElementContent,
	type VideoElement,
	type VideoElementContent,
} from "../../document/types"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type {
	VideoEditControlAction,
	VideoEditControlState,
} from "../../interaction/video-edit/VideoEditInteractionManager"
import type { AudioPlaybackSnapshot } from "../../resources/audio/AudioPlaybackManager"
import type { AudioWaveformSnapshot } from "../../resources/audio/AudioWaveformManager"
import {
	VIDEO_EDIT_ASPECT_RATIOS,
	VIDEO_EDIT_FORMATS,
	VIDEO_EDIT_RESOLUTIONS,
	type VideoCompositionSnapshot,
	type VideoCompositionStatus,
} from "../../resources/video-composition/VideoCompositionManager"
import { getCanvasResourceFileName } from "../../shared/path/canvasResourcePath"
import { RenderUtils } from "../../shared/render/RenderUtils"
import {
	BaseElement,
	type ElementTransformConstraints,
	type TransformContext,
} from "../core/BaseElement"
import { VIDEO_EDIT_CONFIG } from "./VideoEditElement.config"
import {
	resolveVideoEditElementLayout,
	type VideoEditElementLayout,
	type VideoEditFooterParameterLayout,
} from "./VideoEditElement.layout"

interface VideoEditControlMetadata {
	action: VideoEditControlAction
	kind: "parameter" | "play" | "merge"
	visualNode: Konva.Group
	overlayAnchorNode?: Konva.Node
	selectPresentation?: {
		fontSize: number
		horizontalPadding: number
		suffixGap: number
		suffixIconSize: number
	}
	baseBounds: { x: number; y: number; width: number; height: number }
	idleFill?: string
	idleStroke?: string
}

const NODE_NAMES = {
	background: "video-edit-background",
	videoTitle: "video-edit-video-title",
	videoCount: "video-edit-video-count",
	videoViewport: "video-edit-video-viewport",
	videoTrack: "video-edit-video-track",
	videoCard: "video-edit-video-card",
	videoScrollbarThumb: "video-edit-video-scrollbar-thumb",
	audioTitle: "video-edit-audio-title",
	audioCount: "video-edit-audio-count",
	audioRow: "video-edit-audio-row",
	audioPlayButton: "video-edit-audio-play-button",
	audioPlayTriangle: "video-edit-audio-play-triangle",
	audioPauseBars: "video-edit-audio-pause-bars",
	audioWaveform: "video-edit-audio-waveform",
	audioName: "video-edit-audio-name",
	audioDuration: "video-edit-audio-duration",
	footerOutput: "video-edit-footer-output",
	footerAspectRatio: "video-edit-footer-aspect-ratio",
	footerResolution: "video-edit-footer-resolution",
	footerFormat: "video-edit-footer-format",
	mergeButton: "video-edit-merge-button",
} as const

const EMPTY_PLAYBACK_SNAPSHOT: AudioPlaybackSnapshot = {
	duration: 0,
	currentTime: 0,
	paused: true,
	ended: false,
	preparing: false,
	loading: false,
	error: false,
}

const EMPTY_WAVEFORM_SNAPSHOT: AudioWaveformSnapshot = {
	status: "idle",
	peaks: null,
}

const VIDEO_CARD_GRADIENTS = [
	["#273451", "#7C6DA3", "#D89A79"],
	["#253547", "#5E7A8E", "#D3AE83"],
	["#20283E", "#555F93", "#947198"],
	["#36435B", "#7B789F", "#D69B78"],
] as const

interface VideoInputView {
	name: string
	duration: number | null
}

interface AudioInputView {
	id: string
	name: string
	src?: string
}

const EMPTY_COMPOSITION_SNAPSHOT: VideoCompositionSnapshot = {
	status: "idle",
	progress: 0,
	issues: [],
}

function isCompositionBusy(status: VideoCompositionStatus): boolean {
	return ["checking", "preparing", "encoding", "finalizing", "uploading"].includes(status)
}

function areCompositionSnapshotsEqual(
	a: VideoCompositionSnapshot,
	b: VideoCompositionSnapshot,
): boolean {
	if (
		a.status !== b.status ||
		a.progress !== b.progress ||
		a.phase !== b.phase ||
		a.errorMessage !== b.errorMessage ||
		a.resultElementId !== b.resultElementId ||
		a.issues.length !== b.issues.length
	) {
		return false
	}
	return a.issues.every(
		(issue, index) =>
			issue.code === b.issues[index]?.code &&
			issue.elementId === b.issues[index]?.elementId &&
			issue.message === b.issues[index]?.message,
	)
}

function formatDuration(seconds: number | null | undefined): string {
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "--:--"
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	const wholeSeconds = Math.floor(seconds)
	const minutes = Math.floor(wholeSeconds / 60)
	const remainingSeconds = wholeSeconds % 60
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function stripFileExtension(value: string): string {
	return value.replace(/\.[^/.]+$/, "")
}

function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
	if (fromIndex === toIndex) return [...items]
	const next = [...items]
	const [moved] = next.splice(fromIndex, 1)
	if (moved === undefined) return next
	next.splice(toIndex, 0, moved)
	return next
}

/**
 * 视频编辑节点：展示有序视频输入、单条音频输入与输出规格。
 * 视频轨道滚动、拖拽态和音频播放状态属于运行态；只有调整后的顺序写回 DSL。
 */
export class VideoEditElement extends BaseElement<VideoEditElementData> {
	private videoScrollOffset = 0
	private videoScrollMax = 0
	private videoTrackGroup?: Konva.Group
	private videoScrollbarThumb?: Konva.Rect
	private videoScrollbarTrackWidth = 0
	private videoScrollbarThumbWidth = 0
	private rootWasDraggableBeforeCardDrag = false
	private playbackSnapshot: AudioPlaybackSnapshot = EMPTY_PLAYBACK_SNAPSHOT
	private waveformSnapshot: AudioWaveformSnapshot = EMPTY_WAVEFORM_SNAPSHOT
	private boundAudioElementId?: string
	private boundAudioPath?: string
	private playbackUnsubscribe: () => void = () => undefined
	private waveformUnsubscribe: () => void = () => undefined
	private sourceElementUpdatedUnsubscribe?: () => void
	private compositionUnsubscribe: () => void = () => undefined
	private compositionSnapshot: VideoCompositionSnapshot = EMPTY_COMPOSITION_SNAPSHOT
	private previewCanvases = new Map<string, HTMLCanvasElement>()
	private previewControllers = new Map<string, AbortController>()
	private previewTokens = new Map<string, number>()
	private interactionCleanups: Array<() => void> = []
	private interactionEventUnsubscribers: Array<() => void> = []

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
		output?: VideoEditElementContent["output"]
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
			activeContentId: `${options.id}-content-1`,
			mainContentId: `${options.id}-content-1`,
			contents: [
				{
					contentId: `${options.id}-content-1`,
					videoSequence: [...(options.videoSequence ?? [])],
					audioSequence: [...(options.audioSequence ?? [])],
					output: options.output ? { ...options.output } : undefined,
				},
			],
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public getRenderName(): string {
		return this.getText("videoEditNode.defaultName", "视频编辑")
	}

	public render(): Konva.Group {
		const content = this.getActiveContent<VideoEditElementContent>()
		const width = Math.max(this.data.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH, 1)
		const height = Math.max(this.data.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT, 1)
		const layout = resolveVideoEditElementLayout(width, height)
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (context) => context.rect(0, 0, width, height),
		})

		RenderUtils.createHitNode(group, width, height)
		group.add(
			new Konva.Rect({
				...layout.bounds,
				fill: VIDEO_EDIT_CONFIG.BACKGROUND,
				stroke: VIDEO_EDIT_CONFIG.BORDER,
				strokeWidth: Math.max(1, layout.scale),
				cornerRadius: VIDEO_EDIT_CONFIG.CORNER_RADIUS,
				listening: false,
				perfectDrawEnabled: false,
				name: NODE_NAMES.background,
			}),
		)

		this.renderVideoSection(group, layout, content?.videoSequence ?? [])
		this.renderAudioSection(group, layout, content?.audioSequence[0])
		this.renderFooter(group, layout, content)

		this.finalizeNode(group)
		return group
	}

	public update(newData: VideoEditElementData): boolean {
		const previousData = this.data
		const previousContent = this.getActiveContent<VideoEditElementContent>()
		const previousAudioElementId = previousContent?.audioSequence[0]
		this.data = newData
		const nextContent = this.getActiveContent<VideoEditElementContent>()
		const nextAudioElementId = nextContent?.audioSequence[0]
		if (previousAudioElementId !== nextAudioElementId) this.bindAudioRuntime()

		const needsRerender =
			previousData.width !== newData.width ||
			previousData.height !== newData.height ||
			previousContent?.videoSequence !== nextContent?.videoSequence ||
			previousContent?.audioSequence !== nextContent?.audioSequence ||
			previousContent?.output !== nextContent?.output
		if (previousContent?.videoSequence !== nextContent?.videoSequence) this.loadVideoPreviews()

		if (!needsRerender && this.node) {
			this.updateBaseProps(this.node, newData)
		}
		return needsRerender
	}

	public override onMounted(): void {
		super.onMounted()
		this.syncInteractionHitTargets()
		this.bindAudioRuntime()
		this.bindCompositionRuntime()
		this.loadVideoPreviews()
		if (!this.sourceElementUpdatedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.sourceElementUpdatedUnsubscribe = this.canvas.eventEmitter.on(
				"element:updated",
				({ data }) => {
					if (data.elementId === this.data.id) return
					const content = this.getActiveContent<VideoEditElementContent>()
					if (
						!content?.videoSequence.includes(data.elementId) &&
						content?.audioSequence[0] !== data.elementId
					) {
						return
					}
					if (content.videoSequence.includes(data.elementId)) {
						this.loadVideoPreview(data.elementId, true)
					}
					if (content.audioSequence[0] === data.elementId) this.bindAudioRuntime(true)
					this.rerenderWhenTransformIdle()
				},
			)
		}
	}

	public override onResourceReferenceResolverChanged(): void {
		this.bindAudioRuntime(true)
		this.loadVideoPreviews(true)
		this.rerenderWhenTransformIdle()
	}

	public override destroy(): void {
		this.playbackUnsubscribe()
		this.waveformUnsubscribe()
		this.compositionUnsubscribe()
		this.previewControllers.forEach((controller) => controller.abort())
		this.previewControllers.clear()
		this.previewTokens.clear()
		this.previewCanvases.clear()
		this.sourceElementUpdatedUnsubscribe?.()
		this.sourceElementUpdatedUnsubscribe = undefined
		this.interactionEventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.interactionEventUnsubscribers = []
		this.canvas.cursorManager?.restoreToolCursor()
		super.destroy()
	}

	protected override setupNodeListeners(node: Konva.Node): void {
		super.setupNodeListeners(node)
		if (!(node instanceof Konva.Group)) return

		const controlHits = node.find(".video-edit-control-hit")
		// 参数 hit 必须压在全尺寸 hit-area 之上，否则事件会落到可拖拽根节点上。
		controlHits.forEach((candidate) => candidate.moveToTop())

		const manager = this.canvas.videoEditInteractionManager
		if (manager) {
			controlHits.forEach((candidate) => {
				if (!(candidate instanceof Konva.Rect)) return
				const metadata = candidate.getAttr("videoEditControlMetadata") as
					VideoEditControlMetadata | undefined
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

		const syncHitTargets = () => this.syncInteractionHitTargets(node)
		if (this.canvas.eventEmitter) {
			this.interactionEventUnsubscribers.push(
				this.canvas.eventEmitter.on("viewport:scale", syncHitTargets),
				this.canvas.eventEmitter.on("canvas:devicechange", syncHitTargets),
			)
		}
		this.syncInteractionHitTargets(node)
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

	private renderVideoSection(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		videoSequence: string[],
	): void {
		group.add(
			new Konva.Text({
				...layout.videoTitle,
				text: this.getText("videoEditNode.usedVideos", "使用视频"),
				fontSize: layout.fonts.title,
				fontStyle: "500",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				verticalAlign: "middle",
				listening: false,
				name: NODE_NAMES.videoTitle,
			}),
			new Konva.Text({
				...layout.videoCount,
				text: this.getText("videoEditNode.videoCount", "{{count}} 个视频").replace(
					"{{count}}",
					String(videoSequence.length),
				),
				align: "right",
				verticalAlign: "middle",
				fontSize: layout.fonts.count,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
				listening: false,
				name: NODE_NAMES.videoCount,
			}),
		)

		const viewport = new Konva.Group({
			x: layout.videoCardViewport.x,
			y: layout.videoCardViewport.y,
			width: layout.videoCardViewport.width,
			height: layout.videoCardViewport.height,
			clip: {
				x: 0,
				y: 0,
				width: layout.videoCardViewport.width,
				height: layout.videoCardViewport.height,
			},
			name: NODE_NAMES.videoViewport,
		})
		viewport.add(
			new Konva.Rect({
				width: layout.videoCardViewport.width,
				height: layout.videoCardViewport.height,
				fill: "rgba(255, 255, 255, 0.001)",
				listening: true,
			}),
		)

		if (videoSequence.length === 0) {
			viewport.add(
				new Konva.Rect({
					width: layout.videoCardViewport.width,
					height: layout.videoCardViewport.height,
					fill: VIDEO_EDIT_CONFIG.SURFACE,
					stroke: VIDEO_EDIT_CONFIG.BORDER,
					strokeWidth: Math.max(1, layout.scale),
					dash: [8 * layout.scale, 8 * layout.scale],
					listening: false,
				}),
				new Konva.Text({
					width: layout.videoCardViewport.width,
					height: layout.videoCardViewport.height,
					text: this.getText("videoEditNode.emptyVideos", "暂无关联视频"),
					align: "center",
					verticalAlign: "middle",
					fontSize: layout.fonts.title,
					fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
					fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
					listening: false,
				}),
			)
			this.videoScrollOffset = 0
			this.videoScrollMax = 0
			this.videoTrackGroup = undefined
			this.videoScrollbarThumb = undefined
			group.add(viewport)
			return
		}

		const cardPitch = layout.videoCard.width + layout.videoCard.gap
		const contentWidth =
			videoSequence.length * layout.videoCard.width +
			Math.max(0, videoSequence.length - 1) * layout.videoCard.gap
		this.videoScrollMax = Math.max(0, contentWidth - layout.videoCardViewport.width)
		this.videoScrollOffset = Math.max(0, Math.min(this.videoScrollOffset, this.videoScrollMax))
		const cardY = Math.max(0, (layout.videoCardViewport.height - layout.videoCard.height) / 2)
		const track = new Konva.Group({
			x: -this.videoScrollOffset,
			y: cardY,
			width: contentWidth,
			height: layout.videoCard.height,
			name: NODE_NAMES.videoTrack,
		})
		this.videoTrackGroup = track
		videoSequence.forEach((videoElementId, index) => {
			track.add(
				this.createVideoCard({
					root: group,
					layout,
					videoSequence,
					videoElementId,
					index,
					x: index * cardPitch,
					y: 0,
				}),
			)
		})
		viewport.add(track)
		viewport.on("wheel", (event: Konva.KonvaEventObject<WheelEvent>) => {
			if (this.videoScrollMax <= 0) return
			event.cancelBubble = true
			event.evt.preventDefault()
			const delta =
				Math.abs(event.evt.deltaX) > Math.abs(event.evt.deltaY)
					? event.evt.deltaX
					: event.evt.deltaY
			this.setVideoScrollOffset(this.videoScrollOffset + delta)
		})
		group.add(viewport)

		group.add(
			new Konva.Rect({
				...layout.videoScrollbar,
				fill: VIDEO_EDIT_CONFIG.SCROLLBAR_TRACK,
				listening: false,
			}),
		)
		const visibleRatio = Math.min(1, layout.videoCardViewport.width / contentWidth)
		this.videoScrollbarTrackWidth = layout.videoScrollbar.width
		this.videoScrollbarThumbWidth = Math.max(
			44 * layout.scale,
			layout.videoScrollbar.width * visibleRatio,
		)
		const thumb = new Konva.Rect({
			x: this.resolveScrollbarThumbX(layout),
			y: layout.videoScrollbar.y,
			width: this.videoScrollbarThumbWidth,
			height: layout.videoScrollbar.height,
			fill: VIDEO_EDIT_CONFIG.SCROLLBAR_THUMB,
			visible: this.videoScrollMax > 0,
			listening: false,
			name: NODE_NAMES.videoScrollbarThumb,
		})
		thumb.setAttr("trackStartX", layout.videoScrollbar.x)
		this.videoScrollbarThumb = thumb
		group.add(thumb)
	}

	private createVideoCard(options: {
		root: Konva.Group
		layout: VideoEditElementLayout
		videoSequence: string[]
		videoElementId: string
		index: number
		x: number
		y: number
	}): Konva.Group {
		const { root, layout, videoSequence, videoElementId, index, x, y } = options
		const video = this.resolveVideoInput(videoElementId)
		this.loadVideoPreview(videoElementId)
		const issue = this.compositionSnapshot.issues.find(
			(item) => item.elementId === videoElementId,
		)
		const card = new Konva.Group({
			x,
			y,
			width: layout.videoCard.width,
			height: layout.videoCard.height,
			draggable: !isCompositionBusy(this.compositionSnapshot.status),
			name: NODE_NAMES.videoCard,
		})
		card.setAttr("videoEditSequenceIndex", index)
		const border = new Konva.Rect({
			width: layout.videoCard.width,
			height: layout.videoCard.height,
			fill: VIDEO_EDIT_CONFIG.BACKGROUND,
			stroke: VIDEO_EDIT_CONFIG.BORDER,
			strokeWidth: Math.max(1, layout.scale),
			listening: false,
		})
		const previewHeight = Math.max(0, layout.videoCard.height - layout.videoCard.infoHeight)
		const gradient = VIDEO_CARD_GRADIENTS[index % VIDEO_CARD_GRADIENTS.length]
		card.add(
			border,
			this.previewCanvases.has(videoElementId)
				? (() => {
						const image = new Konva.Image({
							image: this.previewCanvases.get(videoElementId),
							width: layout.videoCard.width,
							height: previewHeight,
							listening: false,
						})
						RenderUtils.updateBackgroundImageLayout(
							image,
							layout.videoCard.width,
							previewHeight,
						)
						return image
					})()
				: new Konva.Rect({
						width: layout.videoCard.width,
						height: previewHeight,
						fill: VIDEO_EDIT_CONFIG.VIDEO_PREVIEW_BACKGROUND,
						fillLinearGradientStartPoint: { x: 0, y: 0 },
						fillLinearGradientEndPoint: {
							x: layout.videoCard.width,
							y: previewHeight,
						},
						fillLinearGradientColorStops: [
							0,
							gradient?.[0] ?? VIDEO_EDIT_CONFIG.VIDEO_PREVIEW_BACKGROUND,
							0.56,
							gradient?.[1] ?? VIDEO_EDIT_CONFIG.VIDEO_PREVIEW_BACKGROUND,
							1,
							gradient?.[2] ?? VIDEO_EDIT_CONFIG.VIDEO_PREVIEW_BACKGROUND,
						],
						listening: false,
					}),
		)
		if (issue) {
			card.add(
				new Konva.Rect({
					x: 0,
					y: previewHeight - Math.max(20 * layout.scale, 16),
					width: layout.videoCard.width,
					height: Math.max(20 * layout.scale, 16),
					fill: "rgba(160, 44, 52, 0.86)",
					listening: false,
				}),
				new Konva.Text({
					x: layout.videoCard.padding,
					y: previewHeight - Math.max(20 * layout.scale, 16),
					width: Math.max(0, layout.videoCard.width - layout.videoCard.padding * 2),
					height: Math.max(20 * layout.scale, 16),
					text: issue.message,
					fontSize: Math.max(9 * layout.scale, 8),
					fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
					fill: "#FFFFFF",
					verticalAlign: "middle",
					wrap: "none",
					ellipsis: true,
					listening: false,
				}),
			)
		}
		this.renderGrip(card, layout)

		const durationText = formatDuration(video.duration)
		const durationWidth = Math.max(layout.fonts.cardDuration * 4.4, 34 * layout.scale)
		const infoY = previewHeight
		card.add(
			new Konva.Text({
				x: layout.videoCard.padding,
				y: infoY,
				width: Math.max(
					0,
					layout.videoCard.width - layout.videoCard.padding * 3 - durationWidth,
				),
				height: layout.videoCard.infoHeight,
				text: video.name,
				fontSize: layout.fonts.cardName,
				fontStyle: "500",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				verticalAlign: "middle",
				wrap: "none",
				ellipsis: true,
				listening: false,
			}),
			new Konva.Text({
				x: layout.videoCard.width - layout.videoCard.padding - durationWidth,
				y: infoY,
				width: durationWidth,
				height: layout.videoCard.infoHeight,
				text: durationText,
				align: "right",
				verticalAlign: "middle",
				fontSize: layout.fonts.cardDuration,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
				listening: false,
			}),
		)

		const originalX = x
		card.on("mouseenter", () => {
			border.stroke(VIDEO_EDIT_CONFIG.ACCENT)
			this.canvas.cursorManager?.setTemporary("grab")
			border.getLayer()?.batchDraw()
		})
		card.on("mouseleave", () => {
			if (!card.isDragging()) border.stroke(VIDEO_EDIT_CONFIG.BORDER)
			this.canvas.cursorManager?.restoreToolCursor()
			border.getLayer()?.batchDraw()
		})
		card.on("dragstart", (event) => {
			if (isCompositionBusy(this.compositionSnapshot.status)) {
				event.cancelBubble = true
				return
			}
			event.cancelBubble = true
			this.rootWasDraggableBeforeCardDrag = root.draggable()
			root.draggable(false)
			card.opacity(0.55)
			card.moveToTop()
			this.canvas.cursorManager?.setTemporary("grabbing")
		})
		card.on("dragmove", (event) => {
			event.cancelBubble = true
			card.y(y)
			this.autoScrollVideoTrack(card)
		})
		card.on("dragend", (event) => {
			event.cancelBubble = true
			root.draggable(this.rootWasDraggableBeforeCardDrag)
			card.opacity(1)
			this.canvas.cursorManager?.restoreToolCursor()
			const cardPitch = layout.videoCard.width + layout.videoCard.gap
			const targetIndex = Math.max(
				0,
				Math.min(videoSequence.length - 1, Math.round(card.x() / cardPitch)),
			)
			if (targetIndex === index) {
				card.x(originalX)
				border.stroke(VIDEO_EDIT_CONFIG.BORDER)
				card.getLayer()?.batchDraw()
				return
			}
			this.persistVideoSequence(moveItem(videoSequence, index, targetIndex))
		})
		return card
	}

	private renderGrip(card: Konva.Group, layout: VideoEditElementLayout): void {
		const size = layout.videoCard.gripSize
		const grip = new Konva.Group({
			x: layout.videoCard.padding * 0.7,
			y: layout.videoCard.padding * 0.7,
			width: size,
			height: size,
			listening: false,
		})
		grip.add(
			new Konva.Rect({
				width: size,
				height: size,
				fill: "rgba(22, 24, 34, 0.68)",
				listening: false,
			}),
		)
		const radius = Math.max(1, layout.scale)
		const centerX = size / 2
		const centerY = size / 2
		const gapX = size * 0.19
		const gapY = size * 0.2
		for (const offsetX of [-gapX, gapX]) {
			for (const offsetY of [-gapY, 0, gapY]) {
				grip.add(
					new Konva.Circle({
						x: centerX + offsetX,
						y: centerY + offsetY,
						radius,
						fill: "rgba(255, 255, 255, 0.86)",
						listening: false,
					}),
				)
			}
		}
		card.add(grip)
	}

	private renderAudioSection(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		audioElementId?: string,
	): void {
		const audio = audioElementId ? this.resolveAudioInput(audioElementId) : undefined
		group.add(
			new Konva.Rect({
				...layout.audioSection,
				fill: VIDEO_EDIT_CONFIG.SURFACE,
				listening: false,
			}),
			new Konva.Line({
				points: [
					layout.audioSection.x,
					layout.audioSection.y,
					layout.audioSection.x + layout.audioSection.width,
					layout.audioSection.y,
				],
				stroke: VIDEO_EDIT_CONFIG.BORDER_SUBTLE,
				strokeWidth: Math.max(1, layout.scale),
				listening: false,
			}),
			new Konva.Text({
				...layout.audioTitle,
				text: this.getText("videoEditNode.usedAudio", "使用音频"),
				fontSize: layout.fonts.title,
				fontStyle: "500",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				verticalAlign: "middle",
				listening: false,
				name: NODE_NAMES.audioTitle,
			}),
			new Konva.Text({
				...layout.audioCount,
				text: audio?.name || this.getText("videoEditNode.unused", "未使用"),
				align: audio ? "left" : "right",
				verticalAlign: "middle",
				fontSize: audio ? layout.fonts.audioName : layout.fonts.count,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
				wrap: "none",
				ellipsis: true,
				listening: false,
				name: audio ? NODE_NAMES.audioName : NODE_NAMES.audioCount,
			}),
		)

		if (!audio) {
			group.add(
				new Konva.Rect({
					...layout.audioRow,
					fill: VIDEO_EDIT_CONFIG.BACKGROUND,
					stroke: VIDEO_EDIT_CONFIG.BORDER,
					strokeWidth: Math.max(1, layout.scale),
					dash: [8 * layout.scale, 8 * layout.scale],
					listening: false,
				}),
				new Konva.Text({
					...layout.audioRow,
					text: this.getText("videoEditNode.emptyAudio", "未关联音频"),
					align: "center",
					verticalAlign: "middle",
					fontSize: layout.fonts.count,
					fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
					fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
					listening: false,
				}),
			)
			return
		}

		group.add(
			new Konva.Rect({
				...layout.audioRow,
				fill: VIDEO_EDIT_CONFIG.AUDIO_BACKGROUND,
				stroke: VIDEO_EDIT_CONFIG.AUDIO_BORDER,
				strokeWidth: Math.max(1, layout.scale),
				listening: false,
				name: NODE_NAMES.audioRow,
			}),
		)
		this.renderAudioPlayButton(group, layout, audio)
		this.renderAudioWaveform(group, layout)
		const audioIssue = this.compositionSnapshot.issues.find(
			(item) => item.elementId === audioElementId,
		)
		if (audioIssue) {
			const issueHeight = Math.max(18 * layout.scale, 15)
			const issuePadding = Math.min(14 * layout.scale, layout.audioRow.width / 4)
			group.add(
				new Konva.Rect({
					x: layout.audioRow.x,
					y: layout.audioRow.y + layout.audioRow.height - issueHeight,
					width: layout.audioRow.width,
					height: issueHeight,
					fill: "rgba(160, 44, 52, 0.86)",
					listening: false,
				}),
				new Konva.Text({
					x: layout.audioRow.x + issuePadding,
					y: layout.audioRow.y + layout.audioRow.height - issueHeight,
					width: Math.max(0, layout.audioRow.width - issuePadding * 2),
					height: issueHeight,
					text: audioIssue.message,
					fontSize: Math.max(9 * layout.scale, 8),
					fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
					fill: "#FFFFFF",
					verticalAlign: "middle",
					wrap: "none",
					ellipsis: true,
					listening: false,
				}),
			)
		}

		group.add(
			new Konva.Text({
				...layout.audioInfo,
				text: formatDuration(this.playbackSnapshot.duration),
				align: "right",
				verticalAlign: "middle",
				fontSize: layout.fonts.audioDuration,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.AUDIO_SECONDARY_TEXT,
				listening: false,
				name: NODE_NAMES.audioDuration,
			}),
		)
	}

	private renderAudioPlayButton(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		audio: AudioInputView,
	): void {
		const isPlaying = !this.playbackSnapshot.paused && !this.playbackSnapshot.ended
		const { x, y, width, height } = layout.audioPlayButton
		const radius = Math.min(width, height) / 2
		const visual = new Konva.Group({
			listening: false,
			name: NODE_NAMES.audioPlayButton,
		})
		const background = new Konva.Circle({
			x: x + width / 2,
			y: y + height / 2,
			radius,
			fill: VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON,
			listening: false,
			perfectDrawEnabled: false,
			name: "video-edit-control-background",
		})
		visual.add(background)
		this.renderAudioPlayState(visual, layout, isPlaying)
		group.add(visual)
		if (!audio.src) return
		this.addControlHit(group, {
			action: { type: "toggle-audio-playback" },
			kind: "play",
			visualNode: visual,
			baseBounds: { ...layout.audioPlayButton },
			idleFill: VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON,
		})
	}

	private renderAudioPlayState(
		button: Konva.Group,
		layout: VideoEditElementLayout,
		isPlaying: boolean,
	): void {
		const { x, y, width, height } = layout.audioPlayButton
		const centerX = x + width / 2
		const centerY = y + height / 2
		const iconFill = VIDEO_EDIT_CONFIG.AUDIO_PLAY_ICON
		const pauseBars = new Konva.Group({
			visible: isPlaying,
			listening: false,
			name: NODE_NAMES.audioPauseBars,
		})
		const barWidth = width * 0.12
		const barHeight = height * 0.34
		const barGap = width * 0.1
		pauseBars.add(
			new Konva.Rect({
				x: centerX - barGap / 2 - barWidth,
				y: centerY - barHeight / 2,
				width: barWidth,
				height: barHeight,
				fill: iconFill,
				cornerRadius: Math.max(1, barWidth * 0.35),
				listening: false,
			}),
			new Konva.Rect({
				x: centerX + barGap / 2,
				y: centerY - barHeight / 2,
				width: barWidth,
				height: barHeight,
				fill: iconFill,
				cornerRadius: Math.max(1, barWidth * 0.35),
				listening: false,
			}),
		)
		button.add(
			new Konva.Line({
				points: [
					centerX - width * 0.08,
					centerY - height * 0.18,
					centerX - width * 0.08,
					centerY + height * 0.18,
					centerX + width * 0.2,
					centerY,
				],
				closed: true,
				fill: iconFill,
				visible: !isPlaying,
				listening: false,
				name: NODE_NAMES.audioPlayTriangle,
			}),
			pauseBars,
		)
	}

	private renderAudioWaveform(group: Konva.Group, layout: VideoEditElementLayout): void {
		const waveform = new Konva.Group({
			x: layout.audioWaveform.x,
			y: layout.audioWaveform.y,
			width: layout.audioWaveform.width,
			height: layout.audioWaveform.height,
			clip: {
				x: 0,
				y: 0,
				width: layout.audioWaveform.width,
				height: layout.audioWaveform.height,
			},
			listening: false,
			name: NODE_NAMES.audioWaveform,
		})
		const barPitch = Math.max(4 * layout.scale, 2)
		const barWidth = Math.max(2 * layout.scale, 1)
		const barCount = Math.max(1, Math.floor(layout.audioWaveform.width / barPitch))
		const peaks = this.waveformSnapshot.status === "ready" ? this.waveformSnapshot.peaks : null
		for (let index = 0; index < barCount; index += 1) {
			const peakIndex = peaks?.length
				? Math.min(peaks.length - 1, Math.floor((index / barCount) * peaks.length))
				: -1
			const fallback = 0.24 + ((index * 17) % 11) / 16
			const amplitude = peakIndex >= 0 ? Math.max(0.12, peaks?.[peakIndex] ?? 0) : fallback
			const barHeight = Math.min(
				layout.audioWaveform.height,
				Math.max(2 * layout.scale, layout.audioWaveform.height * amplitude),
			)
			waveform.add(
				new Konva.Rect({
					x: index * barPitch,
					y: (layout.audioWaveform.height - barHeight) / 2,
					width: barWidth,
					height: barHeight,
					fill: VIDEO_EDIT_CONFIG.AUDIO_WAVEFORM,
					listening: false,
				}),
			)
		}
		group.add(waveform)
	}

	private renderFooter(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		content?: VideoEditElementContent,
	): void {
		const videoCount = content?.videoSequence.length ?? 0
		const outputAspect = VIDEO_EDIT_ASPECT_RATIOS.includes(
			content?.output?.aspectRatio as (typeof VIDEO_EDIT_ASPECT_RATIOS)[number],
		)
			? (content?.output?.aspectRatio ?? "16:9")
			: this.resolveDefaultAspectRatio(content?.videoSequence[0])
		const outputResolution = content?.output?.resolution === "720P" ? "720P" : "1080P"
		group.add(
			new Konva.Line({
				points: [
					layout.footer.x,
					layout.footer.y,
					layout.footer.x + layout.footer.width,
					layout.footer.y,
				],
				stroke: VIDEO_EDIT_CONFIG.BORDER_SUBTLE,
				strokeWidth: Math.max(1, layout.scale),
				listening: false,
			}),
		)
		// 合并按钮先渲染，参数行 hit 后渲染，避免按钮层挡住下拉点击。
		this.renderMergeButton(group, layout, videoCount)
		this.renderOutputControls(group, layout, content, outputAspect, outputResolution)
	}

	private renderOutputControls(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		content: VideoEditElementContent | undefined,
		aspectRatio: string,
		resolution: string,
	): void {
		const outputFormat =
			content?.output?.format &&
			VIDEO_EDIT_FORMATS.includes(
				content.output.format as (typeof VIDEO_EDIT_FORMATS)[number],
			)
				? content.output.format
				: VIDEO_EDIT_FORMATS[0]
		this.renderOutputParameterRow(group, layout.footerParameterRows.aspectRatio, {
			label: this.getText("storyboard.aspectRatio", "画面比例"),
			value: aspectRatio,
			action: { type: "select-aspect-ratio" },
			name: NODE_NAMES.footerAspectRatio,
		})
		this.renderOutputParameterRow(group, layout.footerParameterRows.resolution, {
			label: this.getText("storyboard.resolution", "分辨率"),
			value: resolution,
			action: { type: "select-resolution" },
			name: NODE_NAMES.footerResolution,
		})
		this.renderOutputParameterRow(group, layout.footerParameterRows.format, {
			label: this.getText("videoEditNode.format", "格式"),
			value: outputFormat.toUpperCase(),
			action: { type: "select-format" },
			name: NODE_NAMES.footerFormat,
		})
		void content
	}

	private renderOutputParameterRow(
		group: Konva.Group,
		row: VideoEditFooterParameterLayout,
		options: {
			label: string
			value: string
			action: VideoEditControlAction
			name: string
		},
	): void {
		const { label, value, action, name } = options
		const visual = new Konva.Group({ listening: false, name })
		const background = new Konva.Rect({
			...row.backgroundRect,
			fill: "rgba(255, 255, 255, 0)",
			cornerRadius: row.cornerRadius,
			listening: false,
			perfectDrawEnabled: false,
			name: "video-edit-control-background",
		})
		visual.add(background)
		if (row.showLabel) {
			visual.add(
				new Konva.Text({
					...row.labelRect,
					text: `${label}：`,
					verticalAlign: "middle",
					fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
					fontSize: row.labelFontSize,
					fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
					listening: false,
					perfectDrawEnabled: false,
					name: "video-edit-control-label",
				}),
			)
		}
		visual.add(
			new Konva.Text({
				...row.valueTextRect,
				text: value,
				align: "left",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fontSize: row.fontSize,
				fill: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
				listening: false,
				perfectDrawEnabled: false,
				ellipsis: true,
				wrap: "none",
				name: "video-edit-control-text",
			}),
			this.createSelectSuffix(row),
		)
		const overlayAnchor = new Konva.Rect({
			...row.triggerRect,
			listening: false,
		})
		visual.add(overlayAnchor)
		group.add(visual)
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
			},
			baseBounds: row.rect,
		})
	}

	private createSelectSuffix(row: VideoEditFooterParameterLayout): Konva.Line {
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
			stroke: VIDEO_EDIT_CONFIG.PRIMARY_TEXT,
			strokeWidth,
			lineCap: "round",
			lineJoin: "round",
			listening: false,
			perfectDrawEnabled: false,
			name: "video-edit-control-suffix",
		})
	}

	private addControlHit(group: Konva.Group, metadata: VideoEditControlMetadata): void {
		// 与分镜/音频交互 hit 保持一致：使用极低透明度填充，确保 HitCanvas 稳定绘制命中区。
		const hit = new Konva.Rect({
			...metadata.baseBounds,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
			perfectDrawEnabled: false,
			name: "video-edit-control-hit",
		})
		hit.setAttr("videoEditControlMetadata", metadata)
		hit.setAttr("videoEditBaseHitBounds", { ...metadata.baseBounds })
		group.add(hit)
	}

	private syncInteractionHitTargets(root?: Konva.Node): void {
		const group =
			root instanceof Konva.Group ? root : this.node instanceof Konva.Group ? this.node : null
		if (!group) return
		const coarsePointer = this.canvas.deviceInfo?.input?.coarsePointer ?? false
		const minimumScreenSize = coarsePointer
			? VIDEO_EDIT_CONFIG.COARSE_POINTER_MIN_HIT_SIZE
			: VIDEO_EDIT_CONFIG.DESKTOP_MIN_HIT_SIZE

		group.find(".video-edit-control-hit").forEach((candidate) => {
			if (!(candidate instanceof Konva.Rect)) return
			const baseBounds = candidate.getAttr("videoEditBaseHitBounds") as
				{ x: number; y: number; width: number; height: number } | undefined
			if (
				!baseBounds ||
				!Number.isFinite(baseBounds.x) ||
				!Number.isFinite(baseBounds.y) ||
				!Number.isFinite(baseBounds.width) ||
				!Number.isFinite(baseBounds.height)
			) {
				return
			}
			const absoluteScale = candidate.getAbsoluteScale()
			const scaleX = Number.isFinite(absoluteScale.x)
				? Math.max(0.0001, Math.abs(absoluteScale.x))
				: 1
			const scaleY = Number.isFinite(absoluteScale.y)
				? Math.max(0.0001, Math.abs(absoluteScale.y))
				: 1
			const width = Math.max(baseBounds.width, minimumScreenSize / scaleX)
			const height = Math.max(baseBounds.height, minimumScreenSize / scaleY)
			if (!Number.isFinite(width) || !Number.isFinite(height)) {
				candidate.setAttrs({ ...baseBounds })
				candidate.moveToTop()
				return
			}
			candidate.setAttrs({
				x: baseBounds.x - (width - baseBounds.width) / 2,
				y: baseBounds.y - (height - baseBounds.height) / 2,
				width,
				height,
			})
			candidate.moveToTop()
		})
		this.canvas.videoEditInteractionManager?.refreshOutputControlStates(this.data.id)
	}

	private applyControlState(
		metadata: VideoEditControlMetadata,
		state: VideoEditControlState,
	): void {
		const background = metadata.visualNode.findOne(".video-edit-control-background") as
			Konva.Shape | undefined
		const text = metadata.visualNode.findOne(".video-edit-control-text") as
			Konva.Text | undefined
		const suffix = metadata.visualNode.findOne(".video-edit-control-suffix") as
			Konva.Shape | undefined
		if (!background) return

		if (metadata.kind === "play") {
			if (state === "disabled") {
				background.fill(VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON_DISABLED)
				background.opacity(1)
				return
			}
			background.fill(
				state === "pressed"
					? VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON_ACTIVE
					: state === "hover"
						? VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON_HOVER
						: VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON,
			)
			background.opacity(1)
			return
		}

		if (metadata.kind === "merge") {
			const idleFill = metadata.idleFill ?? VIDEO_EDIT_CONFIG.ACCENT
			if (
				state === "disabled" ||
				(metadata.action.type === "merge-videos" && metadata.action.disabled)
			) {
				background.fill("#C9CDD6")
				text?.fill("#FFFFFF")
				return
			}
			background.fill(state === "pressed" ? VIDEO_EDIT_CONFIG.SURFACE_PRESSED : idleFill)
			background.opacity(state === "hover" || state === "pressed" ? 0.92 : 1)
			text?.fill("#FFFFFF")
			return
		}

		if (state === "disabled") {
			background.fill(VIDEO_EDIT_CONFIG.DISABLED_BACKGROUND)
			text?.fill(VIDEO_EDIT_CONFIG.DISABLED_TEXT)
			if (suffix instanceof Konva.Line) suffix.stroke(VIDEO_EDIT_CONFIG.DISABLED_TEXT)
			else suffix?.fill(VIDEO_EDIT_CONFIG.DISABLED_TEXT)
			return
		}

		background.fill(
			state === "pressed"
				? VIDEO_EDIT_CONFIG.SURFACE_PRESSED
				: state === "hover" || state === "editing"
					? VIDEO_EDIT_CONFIG.SURFACE_STRONG
					: "rgba(255, 255, 255, 0)",
		)
		const foreground =
			state === "hover" || state === "pressed" || state === "editing"
				? VIDEO_EDIT_CONFIG.ACCENT
				: VIDEO_EDIT_CONFIG.PRIMARY_TEXT
		text?.fill(foreground)
		if (suffix instanceof Konva.Line) suffix.stroke(foreground)
		else suffix?.fill(foreground)
	}

	private renderMergeButton(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		videoCount: number,
	): void {
		const status = this.compositionSnapshot.status
		const cancellable = ["checking", "preparing", "encoding"].includes(status)
		const enabled = videoCount > 0 && !["finalizing", "uploading"].includes(status)
		const label = cancellable
			? this.getText("videoEditNode.cancelMerge", "取消")
			: status === "completed"
				? this.getText("videoEditNode.mergeAgain", "再次合并")
				: status === "error"
					? this.getText("videoEditNode.retry", "重试")
					: status === "uploading"
						? this.getText("videoEditNode.uploading", "上传中")
						: this.getText("videoEditNode.mergeVideos", "合并视频")
		const idleFill = enabled
			? cancellable
				? VIDEO_EDIT_CONFIG.DANGER_ACTION
				: VIDEO_EDIT_CONFIG.ACCENT
			: "#C9CDD6"
		const visual = new Konva.Group({
			listening: false,
			name: NODE_NAMES.mergeButton,
		})
		visual.add(
			new Konva.Rect({
				...layout.mergeButton,
				fill: idleFill,
				listening: false,
				name: "video-edit-control-background",
			}),
			new Konva.Text({
				...layout.mergeButton,
				text: label,
				align: "center",
				verticalAlign: "middle",
				fontSize: layout.fonts.button,
				fontStyle: "500",
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: "#FFFFFF",
				listening: false,
				name: "video-edit-control-text",
			}),
		)
		group.add(visual)
		this.addControlHit(group, {
			action: { type: "merge-videos", disabled: !enabled },
			kind: "merge",
			visualNode: visual,
			baseBounds: { ...layout.mergeButton },
			idleFill,
		})
	}

	private bindCompositionRuntime(): void {
		this.compositionUnsubscribe()
		const manager = this.canvas.videoCompositionManager
		if (!manager?.subscribe) return
		this.compositionUnsubscribe = manager.subscribe(this.data.id, (snapshot) => {
			const changed = !areCompositionSnapshotsEqual(this.compositionSnapshot, snapshot)
			this.compositionSnapshot = snapshot
			this.canvas.videoEditInteractionManager?.refreshOutputControlStates(this.data.id)
			if (changed && this.node) this.rerenderWhenTransformIdle()
		})
	}

	private loadVideoPreviews(force = false): void {
		const videoSequence = this.getActiveContent<VideoEditElementContent>()?.videoSequence ?? []
		videoSequence.forEach((elementId) => this.loadVideoPreview(elementId, force))
	}

	private loadVideoPreview(elementId: string, force = false): void {
		const source = this.getSourceElement(elementId)
		const path =
			source?.type === ElementTypeEnum.Video
				? getDownstreamContent<VideoElementContent>(source)?.src
				: undefined
		const manager = this.canvas.videoResourceManager
		if (!path || !manager?.getPreviewResource) return
		if (!force && this.previewCanvases.has(elementId) && !manager.needsResourceReload?.(path)) {
			return
		}
		if (!force && this.previewControllers.has(elementId)) return
		if (force) this.previewCanvases.delete(elementId)
		this.previewControllers.get(elementId)?.abort()
		const controller = new AbortController()
		this.previewControllers.set(elementId, controller)
		const token = (this.previewTokens.get(elementId) ?? 0) + 1
		this.previewTokens.set(elementId, token)
		void manager
			.getPreviewResource(path, { priority: "visible", signal: controller.signal })
			.then((loaded) => {
				if (controller.signal.aborted || this.previewTokens.get(elementId) !== token) return
				const currentSource = this.getSourceElement(elementId)
				const currentPath =
					currentSource?.type === ElementTypeEnum.Video
						? getDownstreamContent<VideoElementContent>(currentSource)?.src
						: undefined
				if (currentPath !== path || !loaded) return
				this.previewCanvases.set(elementId, loaded.poster)
				if (this.node) this.rerenderWhenTransformIdle()
			})
			.catch(() => undefined)
			.finally(() => {
				if (this.previewControllers.get(elementId) === controller) {
					this.previewControllers.delete(elementId)
				}
			})
	}

	private resolveDefaultAspectRatio(
		elementId?: string,
	): (typeof VIDEO_EDIT_ASPECT_RATIOS)[number] {
		const source = elementId ? this.getSourceElement(elementId) : undefined
		const content =
			source?.type === ElementTypeEnum.Video
				? getDownstreamContent<VideoElementContent>(source)
				: undefined
		const metadata = content?.src
			? this.canvas.videoResourceManager?.getCachedMetadata?.(content.src)
			: undefined
		const ratio =
			metadata && metadata.videoHeight > 0
				? metadata.videoWidth / metadata.videoHeight
				: source && source.height && source.height > 0
					? (source.width ?? 16) / source.height
					: 16 / 9
		return VIDEO_EDIT_ASPECT_RATIOS.reduce(
			(nearest, candidate) => {
				const [width, height] = candidate.split(":").map(Number)
				const nearestValue = Number(nearest.split(":")[0]) / Number(nearest.split(":")[1])
				return Math.abs(width / height - ratio) < Math.abs(nearestValue - ratio)
					? candidate
					: nearest
			},
			"16:9" as (typeof VIDEO_EDIT_ASPECT_RATIOS)[number],
		)
	}

	private resolveVideoInput(elementId: string): VideoInputView {
		const element = this.getSourceElement(elementId)
		if (element?.type !== ElementTypeEnum.Video) {
			return {
				name: this.getText("video.defaultName", "视频"),
				duration: null,
			}
		}
		const content = getDownstreamContent<VideoElementContent>(element)
		const fileName = getCanvasResourceFileName(content?.src)
		const name =
			element.name ||
			stripFileExtension(fileName) ||
			this.getText("video.defaultName", "视频")
		const duration = content?.src
			? (this.canvas.videoResourceManager?.getCachedMetadata?.(content.src)?.duration ?? null)
			: null
		return { name, duration }
	}

	private resolveAudioInput(elementId: string): AudioInputView | undefined {
		const element = this.getSourceElement(elementId)
		if (element?.type !== ElementTypeEnum.Audio) return undefined
		const content = getDownstreamContent<AudioElementContent>(element)
		const fileName = getCanvasResourceFileName(content?.src)
		return {
			id: elementId,
			name: fileName || element.name || this.getText("audio.defaultName", "音频"),
			src: content?.src,
		}
	}

	private getSourceElement(elementId: string): VideoElement | AudioElement | undefined {
		const getElementData = this.canvas.elementManager?.getElementData
		if (typeof getElementData !== "function") return undefined
		const element = getElementData.call(this.canvas.elementManager, elementId)
		return element?.type === ElementTypeEnum.Video || element?.type === ElementTypeEnum.Audio
			? element
			: undefined
	}

	private persistVideoSequence(videoSequence: string[]): void {
		const next = updateContent(this.data, this.data.activeContentId, { videoSequence })
		if (next === this.data) return
		this.canvas.elementManager.update(
			this.data.id,
			{ contents: next.contents },
			{ silent: false },
		)
	}

	private autoScrollVideoTrack(draggedCard: Konva.Group): void {
		if (!this.videoTrackGroup || this.videoScrollMax <= 0) return
		const viewport = this.videoTrackGroup.getParent()
		if (!(viewport instanceof Konva.Group)) return
		const pointer = viewport.getRelativePointerPosition()
		if (!pointer) return
		const edge = Math.min(48, viewport.width() * 0.12)
		const step = Math.max(8, viewport.width() * 0.018)
		if (pointer.x < edge) {
			this.setVideoScrollOffset(this.videoScrollOffset - step, draggedCard)
		} else if (pointer.x > viewport.width() - edge) {
			this.setVideoScrollOffset(this.videoScrollOffset + step, draggedCard)
		}
	}

	private setVideoScrollOffset(offset: number, draggedCard?: Konva.Group): void {
		const next = Math.max(0, Math.min(offset, this.videoScrollMax))
		if (Math.abs(next - this.videoScrollOffset) < 0.01) return
		const delta = next - this.videoScrollOffset
		this.videoScrollOffset = next
		this.videoTrackGroup?.x(-next)
		if (draggedCard) draggedCard.x(draggedCard.x() + delta)
		if (this.videoScrollbarThumb) {
			const available = Math.max(
				0,
				this.videoScrollbarTrackWidth - this.videoScrollbarThumbWidth,
			)
			const progress = this.videoScrollMax > 0 ? next / this.videoScrollMax : 0
			this.videoScrollbarThumb.x(
				((this.videoScrollbarThumb.getAttr("trackStartX") as number | undefined) ?? 0) +
					available * progress,
			)
		}
		this.videoTrackGroup?.getLayer()?.batchDraw()
	}

	private resolveScrollbarThumbX(layout: VideoEditElementLayout): number {
		const available = Math.max(0, layout.videoScrollbar.width - this.videoScrollbarThumbWidth)
		const progress = this.videoScrollMax > 0 ? this.videoScrollOffset / this.videoScrollMax : 0
		return layout.videoScrollbar.x + available * progress
	}

	private bindAudioRuntime(force = false): void {
		const audioElementId = this.getActiveContent<VideoEditElementContent>()?.audioSequence[0]
		const audio = audioElementId ? this.resolveAudioInput(audioElementId) : undefined
		const nextId = audio?.id
		const nextPath = audio?.src
		if (!force && nextId === this.boundAudioElementId && nextPath === this.boundAudioPath)
			return

		this.playbackUnsubscribe()
		this.waveformUnsubscribe()
		this.playbackUnsubscribe = () => undefined
		this.waveformUnsubscribe = () => undefined
		this.boundAudioElementId = nextId
		this.boundAudioPath = nextPath
		this.playbackSnapshot = EMPTY_PLAYBACK_SNAPSHOT
		this.waveformSnapshot = EMPTY_WAVEFORM_SNAPSHOT

		if (nextId && this.canvas.audioPlaybackManager?.subscribe) {
			this.playbackUnsubscribe = this.canvas.audioPlaybackManager.subscribe(
				nextId,
				(snapshot) => {
					this.playbackSnapshot = snapshot
					this.syncAudioPlaybackNodes()
				},
			)
		}
		if (nextPath && this.canvas.audioWaveformManager?.subscribe) {
			this.waveformUnsubscribe = this.canvas.audioWaveformManager.subscribe(
				nextPath,
				(snapshot) => {
					const changed =
						this.waveformSnapshot.status !== snapshot.status ||
						this.waveformSnapshot.peaks !== snapshot.peaks
					this.waveformSnapshot = snapshot
					if (changed && this.node) this.rerenderWhenTransformIdle()
				},
			)
		}
	}

	private syncAudioPlaybackNodes(): void {
		if (!(this.node instanceof Konva.Group)) return
		const isPlaying = !this.playbackSnapshot.paused && !this.playbackSnapshot.ended
		const button = this.node.findOne(`.${NODE_NAMES.audioPlayButton}`) as
			Konva.Group | undefined
		const background = button?.findOne(".video-edit-control-background") as
			Konva.Shape | undefined
		if (background) {
			background.fill(VIDEO_EDIT_CONFIG.AUDIO_PLAY_BUTTON)
			background.opacity(1)
		}
		const playTriangle = this.node.findOne(`.${NODE_NAMES.audioPlayTriangle}`)
		const pauseBars = this.node.findOne(`.${NODE_NAMES.audioPauseBars}`)
		playTriangle?.visible(!isPlaying)
		pauseBars?.visible(isPlaying)
		const duration = this.node.findOne(`.${NODE_NAMES.audioDuration}`) as Konva.Text | undefined
		duration?.text(formatDuration(this.playbackSnapshot.duration))
		button?.getLayer()?.batchDraw()
	}
}
