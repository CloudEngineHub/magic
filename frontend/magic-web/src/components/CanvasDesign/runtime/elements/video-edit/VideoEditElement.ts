import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
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
import { VideoEditPlaybackManager } from "../../interaction/video-edit/VideoEditPlaybackManager"
import {
	VIDEO_EDIT_ASPECT_RATIOS,
	VIDEO_EDIT_FORMATS,
	VIDEO_EDIT_RESOLUTIONS,
	type VideoCompositionSnapshot,
} from "../../resources/video-composition/VideoCompositionManager"
import { getCanvasResourceFileName } from "../../shared/path/canvasResourcePath"
import { RenderUtils } from "../../shared/render/RenderUtils"
import {
	BaseElement,
	type ElementTransformConstraints,
	type TransformContext,
} from "../core/BaseElement"
import { VIDEO_EDIT_CONFIG } from "./VideoEditElement.config"
import { collectConnectedVideoEditInputs } from "../../interaction/connection/connectedInputSources"
import {
	resolveVideoEditElementLayout,
	type VideoEditElementLayout,
	type VideoEditFooterParameterLayout,
} from "./VideoEditElement.layout"

/** 打开 / 更新时始终使用当前默认尺寸，忽略旧 DSL 持久化宽高。 */
function normalizeVideoEditDisplayDimensions(data: VideoEditElementData): VideoEditElementData {
	return {
		...data,
		width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
		height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
	}
}

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
	audioProgressTrack: "video-edit-audio-progress-track",
	audioProgressFill: "video-edit-audio-progress-fill",
	audioProgressThumb: "video-edit-audio-progress-thumb",
	audioProgressHit: "video-edit-audio-progress-hit",
	audioProgressThumbHit: "video-edit-audio-progress-thumb-hit",
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
	outputCapability: "idle",
	issues: [],
}

function areCompositionSnapshotsEqual(
	a: VideoCompositionSnapshot,
	b: VideoCompositionSnapshot,
): boolean {
	if (
		a.status !== b.status ||
		a.progress !== b.progress ||
		a.phase !== b.phase ||
		a.outputCapability !== b.outputCapability ||
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
	if (seconds < 60) {
		const rounded = Math.round(seconds * 10) / 10
		// 整数秒不带 .0，避免无意义小数占宽。
		if (Number.isInteger(rounded)) return `${rounded}s`
		return `${rounded.toFixed(1)}s`
	}
	const wholeSeconds = Math.floor(seconds)
	const minutes = Math.floor(wholeSeconds / 60)
	const remainingSeconds = wholeSeconds % 60
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function measureTextWidth(text: string, fontSize: number): number {
	const probe = new Konva.Text({
		text,
		fontSize,
		fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
		wrap: "none",
	})
	return Math.max(1, Math.ceil(probe.width()))
}

function formatPlaybackClock(seconds: number | null | undefined): string {
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "0:00"
	const wholeSeconds = Math.floor(seconds)
	const minutes = Math.floor(wholeSeconds / 60)
	const remainingSeconds = wholeSeconds % 60
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function resolvePlaybackProgress(snapshot: AudioPlaybackSnapshot): number {
	const { duration, currentTime, ended } = snapshot
	if (ended) return 1
	if (!Number.isFinite(duration) || duration <= 0) return 0
	if (!Number.isFinite(currentTime) || currentTime <= 0) return 0
	return Math.max(0, Math.min(1, currentTime / duration))
}

function clampProgress(progress: number): number {
	if (!Number.isFinite(progress)) return 0
	return Math.max(0, Math.min(1, progress))
}

function measureAudioTimeLabelWidth(label: string, fontSize: number): number {
	return measureTextWidth(label, fontSize)
}

interface AudioProgressRowLayout {
	timeLabel: string
	timeRect: { x: number; y: number; width: number; height: number }
	/** 轨道区域（已为滑块半径内缩，滑块端点不侵占左右 gap）。 */
	progressRect: { x: number; y: number; width: number; height: number }
	thumbRadius: number
	sideGap: number
}

function resolveAudioProgressRowLayout(
	layout: VideoEditElementLayout,
	snapshot: AudioPlaybackSnapshot,
	displayedProgress?: number,
): AudioProgressRowLayout {
	const progress =
		displayedProgress === undefined
			? resolvePlaybackProgress(snapshot)
			: clampProgress(displayedProgress)
	const currentTime =
		displayedProgress === undefined
			? snapshot.ended
				? snapshot.duration
				: snapshot.currentTime
			: snapshot.duration * progress
	const timeLabel = `${formatPlaybackClock(currentTime)} / ${formatPlaybackClock(snapshot.duration)}`
	// 用 duration 对称文案稳住列宽，避免播放过程中位数变化导致进度条左右跳动。
	const durationClock = formatPlaybackClock(snapshot.duration)
	const stableLabel = `${durationClock} / ${durationClock}`
	const measuredWidth = Math.max(
		measureAudioTimeLabelWidth(timeLabel, layout.fonts.audioDuration),
		measureAudioTimeLabelWidth(stableLabel, layout.fonts.audioDuration),
	)
	// 文案含空格，宽度再加 1px 避免 Konva 按词折行。
	const timeWidth = Math.min(layout.audioInfo.width, measuredWidth + 1)
	const timeRight = layout.audioInfo.x + layout.audioInfo.width
	const timeRect = {
		x: timeRight - timeWidth,
		y: layout.audioInfo.y,
		width: timeWidth,
		height: layout.audioInfo.height,
	}
	const sideGap =
		layout.audioProgress.x - (layout.audioPlayButton.x + layout.audioPlayButton.width)
	const thumbRadius = Math.max(layout.audioProgressThumbRadius, 3 * layout.scale)
	const progressStart =
		layout.audioPlayButton.x + layout.audioPlayButton.width + sideGap + thumbRadius
	const progressEnd = timeRect.x - sideGap - thumbRadius
	return {
		timeLabel,
		timeRect,
		progressRect: {
			x: progressStart,
			y: layout.audioProgress.y,
			width: Math.max(0, progressEnd - progressStart),
			height: layout.audioProgress.height,
		},
		thumbRadius,
		sideGap,
	}
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
 * 视频编辑节点：展示连接图中的视频输入、单条音频输入与输出规格。
 * 视频成员由连接图表达，处理顺序持久化在 active Content 的 videoSequence。
 */
export class VideoEditElement extends BaseElement<VideoEditElementData> {
	private videoScrollOffset = 0
	private videoScrollMax = 0
	private videoListHovered = false
	private videoTrackGroup?: Konva.Group
	private videoScrollbarTrack?: Konva.Rect
	private videoScrollbarThumb?: Konva.Rect
	private videoScrollbarTrackWidth = 0
	private videoScrollbarThumbWidth = 0
	private rootWasDraggableBeforeCardDrag = false
	private videoDropPlaceholder?: Konva.Rect
	private videoDropTargetIndex?: number
	private playbackSnapshot: AudioPlaybackSnapshot = EMPTY_PLAYBACK_SNAPSHOT
	private boundAudioElementId?: string
	private boundAudioPath?: string
	private playbackUnsubscribe: () => void = () => undefined
	private readonly playbackManager: VideoEditPlaybackManager
	private pendingScrubProgress: number | null = null
	private scrubStage?: Konva.Stage
	private scrubWindowCleanup?: () => void
	private scrubNodeWasDraggable = false
	private scrubStageWasDraggable = false
	private sourceElementUpdatedUnsubscribe?: () => void
	private connectionChangedUnsubscribe?: () => void
	private elementDeletedUnsubscribe?: () => void
	private batchElementsDeletedUnsubscribe?: () => void
	private documentRestoredUnsubscribe?: () => void
	private compositionUnsubscribe: () => void = () => undefined
	private compositionSnapshot: VideoCompositionSnapshot = EMPTY_COMPOSITION_SNAPSHOT
	private previewCanvases = new Map<string, HTMLCanvasElement>()
	private previewControllers = new Map<string, AbortController>()
	private previewTokens = new Map<string, number>()
	private interactionCleanups: Array<() => void> = []
	private interactionEventUnsubscribers: Array<() => void> = []
	private readonlyChangedUnsubscribe?: () => void

	constructor(data: VideoEditElementData, canvas: Canvas) {
		super(normalizeVideoEditDisplayDimensions(data), canvas)
		this.playbackManager =
			canvas.videoEditPlaybackManager ?? new VideoEditPlaybackManager({ canvas })
	}

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
		output?: VideoEditElementContent["output"]
	}): VideoEditElementData {
		return {
			id: options.id,
			type: ElementTypeEnum.VideoEdit,
			name: options.name ?? "视频合并",
			x: options.x,
			y: options.y,
			width: options.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: options.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
			zIndex: options.zIndex ?? 0,
			activeContentId: `${options.id}-content-1`,
			mainContentId: `${options.id}-content-1`,
			contents: [
				{
					contentId: `${options.id}-content-1`,
					...(options.videoSequence ? { videoSequence: [...options.videoSequence] } : {}),
					output: options.output ? { ...options.output } : undefined,
				},
			],
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public getRenderName(): string {
		return this.getText("videoEditNode.defaultName", "视频编辑")
	}

	private resolveElementLayout(width: number, height: number): VideoEditElementLayout {
		return resolveVideoEditElementLayout(width, height, {
			sectionTitles: [
				this.getText("videoEditNode.usedVideos", "使用视频"),
				this.getText("videoEditNode.usedAudio", "使用音频"),
			],
		})
	}

	public render(): Konva.Group {
		const content = this.getActiveContent<VideoEditElementContent>()
		const { videoSequence, audioElementId } = this.collectInputs()
		const width = Math.max(this.data.width ?? VIDEO_EDIT_CONFIG.DEFAULT_WIDTH, 1)
		const height = Math.max(this.data.height ?? VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT, 1)
		const layout = this.resolveElementLayout(width, height)
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

		this.renderVideoSection(group, layout, videoSequence)
		this.renderAudioSection(group, layout, audioElementId)
		this.renderFooter(group, layout, content)

		this.finalizeNode(group)
		return group
	}

	public update(newData: VideoEditElementData): boolean {
		const previousData = this.data
		const previousContent = this.getActiveContent<VideoEditElementContent>()
		const previousInputs = this.collectInputs(previousContent)
		const normalizedData = normalizeVideoEditDisplayDimensions(newData)
		this.data = normalizedData
		const nextContent = this.getActiveContent<VideoEditElementContent>()
		const nextInputs = this.collectInputs(nextContent)
		if (previousInputs.audioElementId !== nextInputs.audioElementId) this.bindAudioRuntime()
		const previousSequence = previousContent?.videoSequence ?? []
		const nextSequence = nextContent?.videoSequence ?? []
		const sequenceChanged =
			previousSequence.length !== nextSequence.length ||
			previousSequence.some((elementId, index) => elementId !== nextSequence[index])

		const needsRerender =
			previousData.width !== normalizedData.width ||
			previousData.height !== normalizedData.height ||
			previousContent?.output !== nextContent?.output ||
			sequenceChanged
		if (previousInputs.videoSequence.join(",") !== nextInputs.videoSequence.join(",")) {
			this.loadVideoPreviews()
		}
		if (
			previousContent?.output !== nextContent?.output ||
			previousInputs.videoSequence.join(",") !== nextInputs.videoSequence.join(",")
		) {
			if (this.canvas.videoCompositionManager?.checkOutputCapability) {
				this.canvas.videoCompositionManager.checkOutputCapability(this.data.id)
			}
		}

		if (!needsRerender && this.node) {
			this.updateBaseProps(this.node, normalizedData)
		}
		return needsRerender
	}

	public override onMounted(): void {
		super.onMounted()
		if (!this.readonlyChangedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.readonlyChangedUnsubscribe = this.canvas.eventEmitter.on("canvas:readonly", () => {
				this.rerenderWhenTransformIdle()
			})
		}
		this.syncInteractionHitTargets()
		this.bindAudioRuntime()
		this.bindCompositionRuntime()
		if (this.canvas.videoCompositionManager?.checkOutputCapability) {
			this.canvas.videoCompositionManager.checkOutputCapability(this.data.id)
		}
		this.loadVideoPreviews()
		if (!this.sourceElementUpdatedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.sourceElementUpdatedUnsubscribe = this.canvas.eventEmitter.on(
				"element:updated",
				({ data }) => {
					if (data.elementId === this.data.id) return
					const inputs = this.collectInputs()
					if (
						!inputs.videoSequence.includes(data.elementId) &&
						inputs.audioElementId !== data.elementId
					) {
						return
					}
					if (inputs.videoSequence.includes(data.elementId)) {
						this.loadVideoPreview(data.elementId, true)
					}
					if (inputs.audioElementId === data.elementId) this.bindAudioRuntime(true)
					if (this.canvas.videoCompositionManager?.checkOutputCapability) {
						this.canvas.videoCompositionManager.checkOutputCapability(this.data.id)
					}
					this.rerenderWhenTransformIdle()
				},
			)
		}
		if (!this.connectionChangedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.connectionChangedUnsubscribe = this.canvas.eventEmitter.on(
				"connection:change",
				() => this.refreshConnectedInputs(),
			)
		}
		if (!this.elementDeletedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.elementDeletedUnsubscribe = this.canvas.eventEmitter.on("element:deleted", () =>
				this.refreshConnectedInputs(),
			)
		}
		if (!this.batchElementsDeletedUnsubscribe && this.canvas.eventEmitter?.on) {
			this.batchElementsDeletedUnsubscribe = this.canvas.eventEmitter.on(
				"element:batchdeleted",
				() => this.refreshConnectedInputs(),
			)
		}
		if (!this.documentRestoredUnsubscribe && this.canvas.eventEmitter?.on) {
			this.documentRestoredUnsubscribe = this.canvas.eventEmitter.on(
				"document:restored",
				() => this.refreshConnectedInputs(),
			)
		}
	}

	private refreshConnectedInputs(): void {
		const connectedVideoIds = new Set(this.collectInputs().videoSequence)
		this.previewControllers.forEach((controller, elementId) => {
			if (connectedVideoIds.has(elementId)) return
			controller.abort()
			this.previewControllers.delete(elementId)
			this.previewTokens.delete(elementId)
		})
		this.previewCanvases.forEach((_poster, elementId) => {
			if (!connectedVideoIds.has(elementId)) this.previewCanvases.delete(elementId)
		})
		this.bindAudioRuntime(true)
		this.canvas.videoCompositionManager?.checkOutputCapability?.(this.data.id)
		this.loadVideoPreviews(true)
		this.rerenderWhenTransformIdle()
	}

	public override onResourceReferenceResolverChanged(): void {
		this.bindAudioRuntime(true)
		this.loadVideoPreviews(true)
		this.rerenderWhenTransformIdle()
	}

	public override destroy(): void {
		this.readonlyChangedUnsubscribe?.()
		this.readonlyChangedUnsubscribe = undefined
		this.finishAudioScrub()
		this.playbackUnsubscribe()
		this.playbackManager.release(this.data.id)
		this.compositionUnsubscribe()
		this.previewControllers.forEach((controller) => controller.abort())
		this.previewControllers.clear()
		this.previewTokens.clear()
		this.previewCanvases.clear()
		this.sourceElementUpdatedUnsubscribe?.()
		this.sourceElementUpdatedUnsubscribe = undefined
		this.connectionChangedUnsubscribe?.()
		this.connectionChangedUnsubscribe = undefined
		this.elementDeletedUnsubscribe?.()
		this.elementDeletedUnsubscribe = undefined
		this.batchElementsDeletedUnsubscribe?.()
		this.batchElementsDeletedUnsubscribe = undefined
		this.documentRestoredUnsubscribe?.()
		this.documentRestoredUnsubscribe = undefined
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
		node.find(`.${NODE_NAMES.audioProgressHit}, .${NODE_NAMES.audioProgressThumbHit}`).forEach(
			(candidate) => candidate.moveToTop(),
		)

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

	/**
	 * Transformer / hover 边界只应使用视频编辑卡片本身的尺寸。
	 * 默认实现会合并子节点包围盒，放大后的 control hit 会把选框撑大。
	 */
	protected override setupCustomBoundingRect(node: Konva.Group): void {
		if (!(node instanceof Konva.Group)) return

		node.getClientRect = (config?: Parameters<Konva.Node["getClientRect"]>[0]) => {
			const hitRect = node.findOne(".hit-area") as Konva.Rect | undefined
			if (hitRect) return hitRect.getClientRect(config)

			const width = node.width()
			const height = node.height()
			const scaleX = node.scaleX()
			const scaleY = node.scaleY()
			const position = config?.relativeTo ? node.getPosition() : node.getAbsolutePosition()
			return {
				x: position.x,
				y: position.y,
				width: width * scaleX,
				height: height * scaleY,
			}
		}
	}

	public override getBoundingRect(): {
		x: number
		y: number
		width: number
		height: number
	} | null {
		if (!this.node) return null
		const layer = this.node.getLayer()
		if (!layer) return null

		if (this.node instanceof Konva.Group) {
			const hitRect = this.node.findOne(".hit-area") as Konva.Rect | undefined
			if (hitRect) {
				const clientRect = hitRect.getClientRect({ relativeTo: layer })
				return {
					x: clientRect.x,
					y: clientRect.y,
					width: clientRect.width,
					height: clientRect.height,
				}
			}

			const position = this.node.getAbsolutePosition(layer)
			return {
				x: position.x,
				y: position.y,
				width: this.node.width() * this.node.scaleX(),
				height: this.node.height() * this.node.scaleY(),
			}
		}

		const clientRect = this.node.getClientRect({ relativeTo: layer })
		return {
			x: clientRect.x,
			y: clientRect.y,
			width: clientRect.width,
			height: clientRect.height,
		}
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
				wrap: "none",
				ellipsis: true,
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
				align: "left",
				verticalAlign: "middle",
				fontSize: layout.fonts.count,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.SECONDARY_TEXT,
				wrap: "none",
				ellipsis: true,
				listening: false,
				name: NODE_NAMES.videoCount,
			}),
		)

		const cardPitch = layout.videoCard.width + layout.videoCard.gap
		const contentWidth =
			videoSequence.length === 0
				? 0
				: videoSequence.length * layout.videoCard.width +
					Math.max(0, videoSequence.length - 1) * layout.videoCard.gap
		this.videoScrollMax = Math.max(0, contentWidth - layout.videoCardViewport.width)
		const canScroll = this.videoScrollMax > 0
		const cardViewport = layout.videoCardViewport
		const viewport = new Konva.Group({
			x: cardViewport.x,
			y: cardViewport.y,
			width: cardViewport.width,
			height: cardViewport.height,
			clip: {
				x: 0,
				y: 0,
				width: cardViewport.width,
				height: cardViewport.height,
			},
			name: NODE_NAMES.videoViewport,
		})
		viewport.add(
			new Konva.Rect({
				width: cardViewport.width,
				height: cardViewport.height,
				fill: "rgba(255, 255, 255, 0.001)",
				listening: true,
			}),
		)

		if (videoSequence.length === 0) {
			viewport.add(
				new Konva.Rect({
					width: cardViewport.width,
					height: cardViewport.height,
					fill: VIDEO_EDIT_CONFIG.SURFACE,
					stroke: VIDEO_EDIT_CONFIG.BORDER,
					strokeWidth: Math.max(1, layout.scale),
					dash: [8 * layout.scale, 8 * layout.scale],
					listening: false,
				}),
				new Konva.Text({
					width: cardViewport.width,
					height: cardViewport.height,
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
			this.videoListHovered = false
			this.videoTrackGroup = undefined
			this.clearVideoScrollbarNodes()
			group.add(viewport)
			return
		}

		this.videoScrollOffset = Math.max(0, Math.min(this.videoScrollOffset, this.videoScrollMax))
		const track = new Konva.Group({
			x: -this.videoScrollOffset,
			y: 0,
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
		viewport.on("mouseenter", () => {
			this.videoListHovered = true
			this.syncVideoScrollbarVisibility()
		})
		viewport.on("mouseleave", () => {
			this.videoListHovered = false
			this.syncVideoScrollbarVisibility()
		})
		group.add(viewport)

		if (!canScroll) {
			this.clearVideoScrollbarNodes()
			return
		}

		// 滚动条叠在列表下方（绝对定位）；仅在 hover 视频列表且内容溢出时显示。
		const scrollbarRadius = layout.videoScrollbar.height / 2
		const scrollbarVisible = this.videoListHovered
		const scrollbarTrack = new Konva.Rect({
			...layout.videoScrollbar,
			fill: VIDEO_EDIT_CONFIG.SCROLLBAR_TRACK,
			cornerRadius: scrollbarRadius,
			visible: scrollbarVisible,
			listening: false,
		})
		this.videoScrollbarTrack = scrollbarTrack
		group.add(scrollbarTrack)
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
			cornerRadius: scrollbarRadius,
			visible: scrollbarVisible,
			listening: false,
			name: NODE_NAMES.videoScrollbarThumb,
		})
		thumb.setAttr("trackStartX", layout.videoScrollbar.x)
		this.videoScrollbarThumb = thumb
		group.add(thumb)
	}

	private clearVideoScrollbarNodes(): void {
		this.videoScrollbarTrack = undefined
		this.videoScrollbarThumb = undefined
		this.videoScrollbarTrackWidth = 0
		this.videoScrollbarThumbWidth = 0
	}

	private syncVideoScrollbarVisibility(): void {
		const visible = this.videoListHovered && this.videoScrollMax > 0
		this.videoScrollbarTrack?.visible(visible)
		this.videoScrollbarThumb?.visible(visible)
		this.videoScrollbarTrack?.getLayer()?.batchDraw()
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
			draggable: false,
			name: NODE_NAMES.videoCard,
		})
		card.setAttr("videoEditSequenceIndex", index)
		const strokeWidth = Math.max(1, layout.scale)
		// 底填充与描边分层：描边最后绘制并内缩半线宽，避免被预览盖住或被视口 clip 裁切。
		const fill = new Konva.Rect({
			width: layout.videoCard.width,
			height: layout.videoCard.height,
			fill: VIDEO_EDIT_CONFIG.BACKGROUND,
			listening: false,
		})
		const border = new Konva.Rect({
			x: strokeWidth / 2,
			y: strokeWidth / 2,
			width: Math.max(0, layout.videoCard.width - strokeWidth),
			height: Math.max(0, layout.videoCard.height - strokeWidth),
			fillEnabled: false,
			stroke: VIDEO_EDIT_CONFIG.BORDER,
			strokeWidth,
			listening: false,
			perfectDrawEnabled: false,
		})
		// 整卡命中区：用于 hover 显示 drag handle；真正拖拽仅允许从 handle 开始。
		const cardHit = new Konva.Rect({
			width: layout.videoCard.width,
			height: layout.videoCard.height,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
			perfectDrawEnabled: false,
			name: "video-edit-video-card-hit",
		})
		const previewHeight = Math.max(0, layout.videoCard.height - layout.videoCard.infoHeight)
		const gradient = VIDEO_CARD_GRADIENTS[index % VIDEO_CARD_GRADIENTS.length]
		card.add(
			fill,
			cardHit,
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

		const durationText = formatDuration(video.duration)
		const durationWidth = measureTextWidth(durationText, layout.fonts.cardDuration)
		const infoY = previewHeight
		const nameDurationGap = layout.videoCard.padding
		const nameWidth = Math.max(
			0,
			layout.videoCard.width - layout.videoCard.padding * 2 - durationWidth - nameDurationGap,
		)
		card.add(
			new Konva.Text({
				x: layout.videoCard.padding,
				y: infoY,
				width: nameWidth,
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
			border,
		)

		const gripAndHandle = this.canvas.readonly ? null : this.renderGrip(card, layout)
		const grip = gripAndHandle?.grip
		const handle = gripAndHandle?.handle
		const setGripShown = (shown: boolean) => {
			grip?.visible(shown)
			grip?.listening(shown)
			handle?.listening(shown)
		}
		setGripShown(false)
		// 仅允许从 handle 启动拖拽，避免命中层/描边干扰。
		card.draggable(false)
		const beginCardDrag = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			if (
				this.canvas.readonly ||
				["checking", "preparing", "encoding", "finalizing", "uploading"].includes(
					this.compositionSnapshot.status,
				)
			)
				return
			event.cancelBubble = true
			event.evt.preventDefault()
			setGripShown(true)
			card.draggable(true)
			card.startDrag()
		}
		if (handle) {
			handle.on("mousedown", beginCardDrag)
			handle.on("touchstart", beginCardDrag)
			handle.on("mouseenter", () => {
				this.canvas.cursorManager?.setTemporary("grab")
			})
			handle.on("mouseleave", () => {
				if (card.isDragging()) return
				this.canvas.cursorManager?.restoreToolCursor()
			})
		}

		card.on("mouseenter", () => {
			border.stroke(VIDEO_EDIT_CONFIG.ACCENT)
			setGripShown(true)
			border.getLayer()?.batchDraw()
		})
		card.on("mouseleave", () => {
			if (card.isDragging()) return
			border.stroke(VIDEO_EDIT_CONFIG.BORDER)
			setGripShown(false)
			this.canvas.cursorManager?.restoreToolCursor()
			border.getLayer()?.batchDraw()
		})
		card.on("dragstart", (event) => {
			event.cancelBubble = true
			this.rootWasDraggableBeforeCardDrag = root.draggable()
			root.draggable(false)
			card.opacity(0.7)
			card.moveToTop()
			this.videoDropTargetIndex = index
			this.updateVideoDropPreview(card, index, index, layout)
			this.canvas.cursorManager?.setTemporary("grabbing")
		})
		card.on("dragmove", (event) => {
			event.cancelBubble = true
			card.y(y)
			this.autoScrollVideoTrack(card)
			const targetIndex = this.resolveVideoDropTargetIndex(card, videoSequence.length, layout)
			if (targetIndex !== this.videoDropTargetIndex) {
				this.videoDropTargetIndex = targetIndex
				this.updateVideoDropPreview(card, index, targetIndex, layout)
			}
		})
		card.on("dragend", (event) => {
			event.cancelBubble = true
			card.draggable(false)
			root.draggable(this.rootWasDraggableBeforeCardDrag)
			card.opacity(1)
			setGripShown(false)
			border.stroke(VIDEO_EDIT_CONFIG.BORDER)
			this.canvas.cursorManager?.restoreToolCursor()
			const targetIndex = this.resolveVideoDropTargetIndex(card, videoSequence.length, layout)
			this.videoDropTargetIndex = undefined
			if (targetIndex === index) {
				this.clearVideoDropPreview(layout, true)
				card.x(x)
				card.getLayer()?.batchDraw()
				return
			}
			this.clearVideoDropPreview(layout, false)
			card.position({
				x: targetIndex * (layout.videoCard.width + layout.videoCard.gap),
				y,
			})
			this.persistVideoSequence(moveItem(videoSequence, index, targetIndex))
		})
		return card
	}

	private renderGrip(
		card: Konva.Group,
		layout: VideoEditElementLayout,
	): { grip: Konva.Group; handle: Konva.Rect } {
		const size = layout.videoCard.gripSize
		const cornerRadius = Math.max(2 * layout.scale, size * 0.22)
		const grip = new Konva.Group({
			x: layout.videoCard.padding * 0.7,
			y: layout.videoCard.padding * 0.7,
			width: size,
			height: size,
			visible: false,
			listening: false,
			name: "video-edit-video-card-grip",
		})
		grip.add(
			new Konva.Rect({
				width: size,
				height: size,
				fill: "rgba(22, 24, 34, 0.68)",
				cornerRadius,
				listening: false,
			}),
		)
		const radius = Math.max(1.5, size * 0.08)
		const centerX = size / 2
		const centerY = size / 2
		const gapX = size * 0.2
		const gapY = size * 0.24
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
		const handle = new Konva.Rect({
			width: size,
			height: size,
			fill: "rgba(0, 0, 0, 0.001)",
			cornerRadius,
			listening: false,
			perfectDrawEnabled: false,
			name: "video-edit-video-card-drag-handle",
		})
		grip.add(handle)
		card.add(grip)
		grip.moveToTop()
		return { grip, handle }
	}

	private persistVideoSequence(videoSequence: string[]): void {
		const content = this.getActiveContent<VideoEditElementContent>()
		if (!content) return
		const next = updateContent(this.data, content.contentId, { videoSequence })
		if (next === this.data) return
		this.canvas.historyManager?.runTransaction(() => {
			this.canvas.elementManager.update(this.data.id, { contents: next.contents })
		})
	}

	private resolveVideoDropTargetIndex(
		draggedCard: Konva.Group,
		videoCount: number,
		layout: VideoEditElementLayout,
	): number {
		const cardPitch = layout.videoCard.width + layout.videoCard.gap
		return Math.max(0, Math.min(videoCount - 1, Math.round(draggedCard.x() / cardPitch)))
	}

	private updateVideoDropPreview(
		draggedCard: Konva.Group,
		sourceIndex: number,
		targetIndex: number,
		layout: VideoEditElementLayout,
	): void {
		const track = this.videoTrackGroup
		if (!track) return
		const cardPitch = layout.videoCard.width + layout.videoCard.gap
		if (!this.videoDropPlaceholder) {
			this.videoDropPlaceholder = new Konva.Rect({
				width: layout.videoCard.width,
				height: layout.videoCard.height,
				fill: VIDEO_EDIT_CONFIG.ACCENT_SOFT,
				stroke: VIDEO_EDIT_CONFIG.ACCENT,
				strokeWidth: Math.max(1, layout.scale),
				dash: [6 * layout.scale, 4 * layout.scale],
				cornerRadius: Math.max(4, 8 * layout.scale),
				listening: false,
				perfectDrawEnabled: false,
				name: "video-edit-video-drop-placeholder",
			})
			track.add(this.videoDropPlaceholder)
			this.videoDropPlaceholder.moveToBottom()
		}
		this.videoDropPlaceholder.x(targetIndex * cardPitch)
		track.find(`.${NODE_NAMES.videoCard}`).forEach((candidate) => {
			if (!(candidate instanceof Konva.Group) || candidate === draggedCard) return
			const originalIndex = candidate.getAttr("videoEditSequenceIndex") as number | undefined
			if (!Number.isInteger(originalIndex)) return
			let previewIndex = originalIndex
			if (
				sourceIndex < targetIndex &&
				originalIndex > sourceIndex &&
				originalIndex <= targetIndex
			) {
				previewIndex -= 1
			} else if (
				sourceIndex > targetIndex &&
				originalIndex >= targetIndex &&
				originalIndex < sourceIndex
			) {
				previewIndex += 1
			}
			this.moveVideoCardToPreviewPosition(candidate, previewIndex * cardPitch)
		})
		track.getLayer()?.batchDraw()
	}

	private clearVideoDropPreview(
		layout: VideoEditElementLayout,
		restoreOriginalPositions: boolean,
	): void {
		this.videoDropPlaceholder?.destroy()
		this.videoDropPlaceholder = undefined
		if (!restoreOriginalPositions || !this.videoTrackGroup) return
		const cardPitch = layout.videoCard.width + layout.videoCard.gap
		this.videoTrackGroup.find(`.${NODE_NAMES.videoCard}`).forEach((candidate) => {
			if (!(candidate instanceof Konva.Group)) return
			const originalIndex = candidate.getAttr("videoEditSequenceIndex") as number | undefined
			if (Number.isInteger(originalIndex)) {
				this.moveVideoCardToPreviewPosition(candidate, originalIndex * cardPitch)
			}
		})
		this.videoTrackGroup.getLayer()?.batchDraw()
	}

	private moveVideoCardToPreviewPosition(card: Konva.Group, x: number): void {
		if (!card.getLayer()) {
			card.x(x)
			return
		}
		card.to({ x, duration: 0.12 })
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
				wrap: "none",
				ellipsis: true,
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
				align: "left",
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
					...layout.audioPlaceholder,
					fill: VIDEO_EDIT_CONFIG.BACKGROUND,
					stroke: VIDEO_EDIT_CONFIG.BORDER,
					strokeWidth: Math.max(1, layout.scale),
					dash: [8 * layout.scale, 8 * layout.scale],
					listening: false,
				}),
				new Konva.Text({
					...layout.audioPlaceholder,
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

		// 音频行无底色，仅保留命名节点便于布局定位与测试。
		group.add(
			new Konva.Rect({
				...layout.audioRow,
				fillEnabled: false,
				strokeEnabled: false,
				listening: false,
				name: NODE_NAMES.audioRow,
			}),
		)
		this.renderAudioPlayButton(group, layout, audio)
		const audioProgressRow = resolveAudioProgressRowLayout(layout, this.playbackSnapshot)
		this.renderAudioProgress(group, audioProgressRow)
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
				...audioProgressRow.timeRect,
				text: audioProgressRow.timeLabel,
				align: "right",
				verticalAlign: "middle",
				fontSize: layout.fonts.audioDuration,
				fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
				fill: VIDEO_EDIT_CONFIG.AUDIO_SECONDARY_TEXT,
				wrap: "none",
				ellipsis: true,
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

	private renderAudioProgress(
		group: Konva.Group,
		audioProgressRow: AudioProgressRowLayout,
	): void {
		const { x, y, width, height } = audioProgressRow.progressRect
		const { thumbRadius } = audioProgressRow
		const cornerRadius = height / 2
		const progress = resolvePlaybackProgress(this.playbackSnapshot)
		const fillWidth = width * progress
		const thumbX = x + fillWidth
		const thumbY = y + height / 2
		const hitHeight = Math.max(height * 4, thumbRadius * 2.4, 24 * Math.max(1, height / 6))
		group.add(
			new Konva.Rect({
				x,
				y,
				width,
				height,
				fill: VIDEO_EDIT_CONFIG.AUDIO_TRACK,
				cornerRadius,
				listening: false,
				name: NODE_NAMES.audioProgressTrack,
			}),
			new Konva.Rect({
				x,
				y,
				width: fillWidth,
				height,
				fill: VIDEO_EDIT_CONFIG.AUDIO_PROGRESS,
				cornerRadius,
				listening: false,
				name: NODE_NAMES.audioProgressFill,
			}),
			new Konva.Circle({
				x: thumbX,
				y: thumbY,
				radius: thumbRadius,
				fill: VIDEO_EDIT_CONFIG.AUDIO_PROGRESS,
				listening: false,
				name: NODE_NAMES.audioProgressThumb,
			}),
		)

		const hit = new Konva.Rect({
			x: x - thumbRadius,
			y: thumbY - hitHeight / 2,
			width: width + thumbRadius * 2,
			height: hitHeight,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
			perfectDrawEnabled: false,
			name: NODE_NAMES.audioProgressHit,
		})
		const thumbHit = new Konva.Circle({
			x: thumbX,
			y: thumbY,
			radius: Math.max(thumbRadius, hitHeight / 2),
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
			perfectDrawEnabled: false,
			name: NODE_NAMES.audioProgressThumbHit,
		})
		group.add(hit, thumbHit)

		const track = group.findOne(`.${NODE_NAMES.audioProgressTrack}`) as Konva.Rect
		const beginScrub = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			this.beginAudioScrub(event, group, track)
		}
		hit.on("mousedown touchstart", beginScrub)
		thumbHit.on("mousedown touchstart", beginScrub)
		hit.on("mouseenter", () => {
			if (this.scrubStage) return
			this.canvas.cursorManager?.setTemporary("pointer")
		})
		hit.on("mouseleave", () => {
			if (this.scrubStage) return
			this.canvas.cursorManager?.restoreToolCursor()
		})
		thumbHit.on("mouseenter", () => {
			if (this.scrubStage) return
			this.canvas.cursorManager?.setTemporary("pointer")
		})
		thumbHit.on("mouseleave", () => {
			if (this.scrubStage) return
			this.canvas.cursorManager?.restoreToolCursor()
		})
	}

	private renderFooter(
		group: Konva.Group,
		layout: VideoEditElementLayout,
		content?: VideoEditElementContent,
	): void {
		const { videoSequence } = this.collectInputs()
		const videoCount = videoSequence.length
		const outputAspect = VIDEO_EDIT_ASPECT_RATIOS.includes(
			content?.output?.aspectRatio as (typeof VIDEO_EDIT_ASPECT_RATIOS)[number],
		)
			? (content?.output?.aspectRatio ?? "16:9")
			: this.resolveDefaultAspectRatio(videoSequence[0])
		const outputResolution = VIDEO_EDIT_RESOLUTIONS.includes(
			content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number],
		)
			? (content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number])
			: "1080P"
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
		if (!this.canvas.readonly) this.renderMergeButton(group, layout, videoCount)
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
					wrap: "none",
					ellipsis: true,
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
			...(this.canvas.readonly ? [] : [this.createSelectSuffix(row)]),
		)
		const overlayAnchor = this.canvas.readonly
			? undefined
			: new Konva.Rect({
					...row.triggerRect,
					listening: false,
				})
		if (overlayAnchor) visual.add(overlayAnchor)
		group.add(visual)
		if (!this.canvas.readonly) {
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
				background.fill(VIDEO_EDIT_CONFIG.DISABLED_BACKGROUND)
				text?.fill(VIDEO_EDIT_CONFIG.DISABLED_TEXT)
				background.opacity(1)
				return
			}
			background.fill(idleFill)
			background.opacity(1)
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
		const outputCapability = this.compositionSnapshot.outputCapability
		const composing = ["checking", "preparing", "encoding", "finalizing", "uploading"].includes(
			status,
		)
		const enabled = videoCount > 0 && outputCapability === "supported" && !composing
		const label = this.getText("videoEditNode.mergeVideos", "合并视频")
		const idleFill = enabled ? VIDEO_EDIT_CONFIG.ACCENT : VIDEO_EDIT_CONFIG.DISABLED_BACKGROUND
		const textFill = enabled ? "#FFFFFF" : VIDEO_EDIT_CONFIG.DISABLED_TEXT
		const visual = new Konva.Group({
			listening: false,
			name: NODE_NAMES.mergeButton,
		})
		visual.add(
			new Konva.Rect({
				...layout.mergeButton,
				fill: idleFill,
				cornerRadius: layout.mergeButtonCornerRadius,
				listening: false,
				perfectDrawEnabled: false,
				name: "video-edit-control-background",
			}),
		)

		const textNode = new Konva.Text({
			x: layout.mergeButton.x,
			y: layout.mergeButton.y,
			text: label,
			align: "center",
			verticalAlign: "middle",
			fontSize: layout.mergeButtonFontSize,
			fontStyle: "bold",
			fontFamily: VIDEO_EDIT_CONFIG.FONT_FAMILY,
			fill: textFill,
			listening: false,
			perfectDrawEnabled: false,
			name: "video-edit-control-text",
		})

		textNode.setAttrs({
			width: layout.mergeButton.width,
			height: layout.mergeButton.height,
		})
		visual.add(textNode)
		group.add(visual)
		this.addControlHit(group, {
			action: { type: "merge-videos", disabled: !enabled },
			kind: "merge",
			visualNode: visual,
			baseBounds: { ...layout.mergeButton },
			idleFill: enabled ? idleFill : VIDEO_EDIT_CONFIG.DISABLED_BACKGROUND,
		})
	}

	private bindCompositionRuntime(): void {
		this.compositionUnsubscribe()
		const manager = this.canvas.videoCompositionManager
		if (!manager?.subscribe) return
		this.compositionUnsubscribe = manager.subscribe(this.data.id, (snapshot) => {
			const changed = !areCompositionSnapshotsEqual(this.compositionSnapshot, snapshot)
			this.compositionSnapshot = {
				...snapshot,
				outputCapability: snapshot.outputCapability ?? "supported",
			}
			this.canvas.videoEditInteractionManager?.refreshOutputControlStates(this.data.id)
			if (changed && this.node) this.rerenderWhenTransformIdle()
		})
	}

	private loadVideoPreviews(force = false): void {
		const { videoSequence } = this.collectInputs()
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

	private collectInputs(content = this.getActiveContent<VideoEditElementContent>()): {
		videoSequence: string[]
		audioElementId?: string
	} {
		const inputs = collectConnectedVideoEditInputs(this.canvas, this.data.id)
		const connectedSet = new Set(inputs.videoElementIds)
		const videoSequence: string[] = []
		;(content?.videoSequence ?? []).forEach((elementId) => {
			if (connectedSet.has(elementId) && !videoSequence.includes(elementId)) {
				videoSequence.push(elementId)
			}
		})
		inputs.videoElementIds.forEach((elementId) => {
			if (!videoSequence.includes(elementId)) videoSequence.push(elementId)
		})
		return { videoSequence, audioElementId: inputs.audioElementId }
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
		const audioElementId = this.collectInputs().audioElementId
		const audio = audioElementId ? this.resolveAudioInput(audioElementId) : undefined
		const nextId = audio?.id
		const nextPath = audio?.src
		if (!force && nextId === this.boundAudioElementId && nextPath === this.boundAudioPath)
			return

		this.playbackUnsubscribe()
		this.playbackUnsubscribe = () => undefined
		this.playbackManager.bindAudio(
			this.data.id,
			nextId && nextPath ? { audioElementId: nextId, path: nextPath } : undefined,
		)
		this.boundAudioElementId = nextId
		this.boundAudioPath = nextPath
		this.playbackSnapshot = EMPTY_PLAYBACK_SNAPSHOT

		if (nextId) {
			this.playbackUnsubscribe = this.playbackManager.subscribe(this.data.id, (snapshot) => {
				this.playbackSnapshot = snapshot
				this.syncAudioPlaybackNodes()
			})
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
		this.syncAudioProgressNodes()
		button?.getLayer()?.batchDraw()
	}

	private syncAudioProgressNodes(): void {
		if (!(this.node instanceof Konva.Group)) return
		const width = Math.max(this.node.width(), 1)
		const height = Math.max(this.node.height(), 1)
		const layout = this.resolveElementLayout(width, height)
		const displayedProgress =
			this.pendingScrubProgress ?? resolvePlaybackProgress(this.playbackSnapshot)
		const audioProgressRow = resolveAudioProgressRowLayout(
			layout,
			this.playbackSnapshot,
			this.pendingScrubProgress ?? undefined,
		)
		const duration = this.node.findOne(`.${NODE_NAMES.audioDuration}`) as Konva.Text | undefined
		duration?.setAttrs({
			...audioProgressRow.timeRect,
			text: audioProgressRow.timeLabel,
		})
		const track = this.node.findOne(`.${NODE_NAMES.audioProgressTrack}`) as
			Konva.Rect | undefined
		const fill = this.node.findOne(`.${NODE_NAMES.audioProgressFill}`) as Konva.Rect | undefined
		const thumb = this.node.findOne(`.${NODE_NAMES.audioProgressThumb}`) as
			Konva.Circle | undefined
		const hit = this.node.findOne(`.${NODE_NAMES.audioProgressHit}`) as Konva.Rect | undefined
		const thumbHit = this.node.findOne(`.${NODE_NAMES.audioProgressThumbHit}`) as
			Konva.Circle | undefined
		if (!track) return
		const fillWidth = audioProgressRow.progressRect.width * displayedProgress
		const thumbX = audioProgressRow.progressRect.x + fillWidth
		const thumbY = audioProgressRow.progressRect.y + audioProgressRow.progressRect.height / 2
		track.setAttrs({
			x: audioProgressRow.progressRect.x,
			y: audioProgressRow.progressRect.y,
			width: audioProgressRow.progressRect.width,
			height: audioProgressRow.progressRect.height,
		})
		fill?.setAttrs({
			x: audioProgressRow.progressRect.x,
			y: audioProgressRow.progressRect.y,
			width: fillWidth,
			height: audioProgressRow.progressRect.height,
		})
		thumb?.setAttrs({
			x: thumbX,
			y: thumbY,
			radius: audioProgressRow.thumbRadius,
		})
		const hitHeight = hit?.height() ?? Math.max(audioProgressRow.thumbRadius * 2.4, 24)
		hit?.setAttrs({
			x: audioProgressRow.progressRect.x - audioProgressRow.thumbRadius,
			y: thumbY - hitHeight / 2,
			width: audioProgressRow.progressRect.width + audioProgressRow.thumbRadius * 2,
		})
		thumbHit?.setAttrs({
			x: thumbX,
			y: thumbY,
			radius: Math.max(audioProgressRow.thumbRadius, hitHeight / 2),
		})
		track.getLayer()?.batchDraw()
	}

	private canScrubAudio(): boolean {
		return (
			!!this.boundAudioElementId &&
			!!this.boundAudioPath &&
			!!this.playbackManager &&
			(this.canvas.permissionManager?.canUseSelectionToolAffordance?.() ?? true)
		)
	}

	private beginAudioScrub(
		event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
		group: Konva.Group,
		track: Konva.Rect,
	): void {
		if (!this.canScrubAudio()) return
		event.cancelBubble = true
		event.evt?.stopPropagation()
		event.evt?.preventDefault()
		const stage = group.getStage()
		if (!stage) return
		this.finishAudioScrub()
		this.scrubStage = stage
		this.scrubNodeWasDraggable = this.node?.draggable() ?? false
		this.scrubStageWasDraggable = stage.draggable()
		this.node?.draggable(false)
		stage.draggable(false)
		this.canvas.cursorManager?.setTemporary("grabbing")

		const audioElementId = this.boundAudioElementId
		const audioPath = this.boundAudioPath
		if (audioElementId && audioPath) {
			void this.playbackManager.prepare(
				this.data.id,
				{ audioElementId, path: audioPath },
				{ source: "interaction", priority: "critical" },
			)
		}

		const update = () => this.queueAudioScrubFromPointer(group, track)
		const finish = () => {
			if (!this.scrubStage) return
			update()
			this.finishAudioScrub()
		}
		const cancel = () => {
			if (!this.scrubStage) return
			this.cancelAudioScrub()
		}
		stage.on("mousemove.videoEditAudioScrub touchmove.videoEditAudioScrub", update)
		stage.on("mouseup.videoEditAudioScrub touchend.videoEditAudioScrub", finish)
		stage.on("touchcancel.videoEditAudioScrub", cancel)
		this.bindAudioScrubWindowListeners(stage, group, track)
		update()
	}

	private queueAudioScrubFromPointer(group: Konva.Group, track: Konva.Rect): void {
		const pointer = group.getRelativePointerPosition()
		if (!pointer || track.width() <= 0) return
		this.pendingScrubProgress = clampProgress((pointer.x - track.x()) / track.width())
		this.syncAudioProgressNodes()
	}

	private seekBoundAudioProgress(progress: number): void {
		if (!this.boundAudioElementId) return
		this.playbackManager.seek(this.data.id, progress)
	}

	private finishAudioScrub(): void {
		const progress = this.pendingScrubProgress
		this.pendingScrubProgress = null
		if (progress !== null) this.seekBoundAudioProgress(progress)
		this.cleanupAudioScrubInteraction()
		this.syncAudioProgressNodes()
	}

	private cancelAudioScrub(): void {
		this.pendingScrubProgress = null
		this.cleanupAudioScrubInteraction()
		this.syncAudioProgressNodes()
	}

	private cleanupAudioScrubInteraction(): void {
		const hadActiveScrub = !!this.scrubStage
		this.scrubWindowCleanup?.()
		this.scrubWindowCleanup = undefined
		if (this.scrubStage) {
			this.scrubStage.off(".videoEditAudioScrub")
			this.scrubStage.draggable(this.scrubStageWasDraggable)
		}
		if (hadActiveScrub) this.node?.draggable(this.scrubNodeWasDraggable)
		this.scrubStage = undefined
		this.canvas.cursorManager?.restoreToolCursor()
	}

	private bindAudioScrubWindowListeners(
		stage: Konva.Stage,
		group: Konva.Group,
		track: Konva.Rect,
	): void {
		if (typeof window === "undefined") return

		const handleMove = (event: Event) => {
			if (this.scrubStage !== stage) return
			stage.setPointersPositions(event)
			this.queueAudioScrubFromPointer(group, track)
		}
		const handleFinish = () => {
			if (this.scrubStage !== stage) return
			this.finishAudioScrub()
		}
		const handleCancel = () => {
			if (this.scrubStage !== stage) return
			this.cancelAudioScrub()
		}
		const capture = true
		window.addEventListener("mousemove", handleMove, capture)
		window.addEventListener("touchmove", handleMove, capture)
		window.addEventListener("pointermove", handleMove, capture)
		window.addEventListener("mouseup", handleFinish, capture)
		window.addEventListener("touchend", handleFinish, capture)
		window.addEventListener("pointerup", handleFinish, capture)
		window.addEventListener("touchcancel", handleCancel, capture)
		window.addEventListener("pointercancel", handleCancel, capture)
		this.scrubWindowCleanup = () => {
			window.removeEventListener("mousemove", handleMove, capture)
			window.removeEventListener("touchmove", handleMove, capture)
			window.removeEventListener("pointermove", handleMove, capture)
			window.removeEventListener("mouseup", handleFinish, capture)
			window.removeEventListener("touchend", handleFinish, capture)
			window.removeEventListener("pointerup", handleFinish, capture)
			window.removeEventListener("touchcancel", handleCancel, capture)
			window.removeEventListener("pointercancel", handleCancel, capture)
		}
	}
}
