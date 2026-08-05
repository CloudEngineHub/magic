import Konva from "konva"
import type { AudioElement as AudioElementData, LayerElement } from "../../document/types"
import { ElementTypeEnum } from "../../document/types"
import type { Canvas } from "../../core/Canvas"
import {
	BaseElement,
	type ElementTransformConstraints,
	type TransformContext,
} from "../core/BaseElement"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type { AudioPlaybackSnapshot } from "../../resources/audio/AudioPlaybackManager"
import {
	areCanvasHostResourceReferencesSame,
	getCanvasResourceFileName,
} from "../../shared/path/canvasResourcePath"
import { RenderUtils } from "../../shared/render/RenderUtils"
import { AUDIO_CONFIG } from "./AudioElement.config"

const NODE_NAMES = {
	playTriangle: "audio-play-triangle",
	pauseBars: "audio-pause-bars",
	progressFill: "audio-progress-fill",
	time: "audio-time",
	error: "audio-error",
} as const

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
	const wholeSeconds = Math.floor(seconds)
	const minutes = Math.floor(wholeSeconds / 60)
	const remainingSeconds = wholeSeconds % 60
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function normalizeLegacyAudioDimensions(data: AudioElementData): AudioElementData {
	if (data.height !== AUDIO_CONFIG.LEGACY_DEFAULT_HEIGHT) return data
	return {
		...data,
		width:
			data.width === AUDIO_CONFIG.LEGACY_DEFAULT_WIDTH
				? AUDIO_CONFIG.DEFAULT_WIDTH
				: data.width,
		height: AUDIO_CONFIG.DEFAULT_HEIGHT,
	}
}

/** 上传型音频卡片元素；播放、时长、错误等状态仅存在于运行时。 */
export class AudioElement extends BaseElement<AudioElementData> {
	private playbackSnapshot: AudioPlaybackSnapshot
	private playbackUnsubscribe: () => void
	private resourceFailureUnsubscribe: () => void
	private resourceError = false

	constructor(data: AudioElementData, canvas: Canvas) {
		const normalizedData = normalizeLegacyAudioDimensions(data)
		super(normalizedData, canvas)
		this.playbackSnapshot = canvas.audioPlaybackManager.getSnapshot(normalizedData.id)
		this.playbackUnsubscribe = canvas.audioPlaybackManager.subscribe(
			normalizedData.id,
			(snapshot) => {
				this.playbackSnapshot = snapshot
				if (!snapshot.error && snapshot.duration > 0) this.resourceError = false
				this.syncPlaybackNodes()
			},
		)
		this.resourceFailureUnsubscribe = canvas.eventEmitter.on(
			"resource:audio:load-failed",
			({ data: eventData }) => {
				if (
					!this.data.src ||
					!areCanvasHostResourceReferencesSame(this.canvas, this.data.src, eventData.path)
				) {
					return
				}
				this.resourceError = true
				this.rerenderWhenTransformIdle()
			},
		)
	}

	public static getDefaultConfig() {
		return {
			width: AUDIO_CONFIG.DEFAULT_WIDTH,
			height: AUDIO_CONFIG.DEFAULT_HEIGHT,
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public static createElementData(options: {
		id: string
		x: number
		y: number
		zIndex?: number
		src?: string
		name?: string
		width?: number
	}): AudioElementData {
		return {
			id: options.id,
			type: ElementTypeEnum.Audio,
			x: options.x,
			y: options.y,
			width: options.width ?? AUDIO_CONFIG.DEFAULT_WIDTH,
			height: AUDIO_CONFIG.DEFAULT_HEIGHT,
			zIndex: options.zIndex ?? 0,
			name: options.name,
			src: options.src,
			interactionConfig: { aspectRatioLocked: false },
		}
	}

	public getRenderName(): string {
		return this.getText("audio.defaultName", "音频")
	}

	public render(): Konva.Group {
		const width = Math.max(
			this.data.width ?? AUDIO_CONFIG.DEFAULT_WIDTH,
			AUDIO_CONFIG.MIN_WIDTH,
		)
		const height = AUDIO_CONFIG.DEFAULT_HEIGHT
		const group = new Konva.Group({ width, height })

		RenderUtils.createHitNode(group, width, height, {
			cornerRadius: AUDIO_CONFIG.CORNER_RADIUS,
		})
		group.add(
			new Konva.Rect({
				width,
				height,
				fill: AUDIO_CONFIG.BACKGROUND,
				stroke: AUDIO_CONFIG.BORDER,
				strokeWidth: 1,
				cornerRadius: AUDIO_CONFIG.CORNER_RADIUS,
				listening: false,
			}),
		)

		this.renderPlayButton(group, height)
		this.renderContent(group, width, height)
		this.finalizeNode(group)
		this.syncPlaybackNodes()
		return group
	}

	public override onMounted(): void {
		super.onMounted()
		if (this.data.src) {
			this.canvas.visibilityManager.registerAudioElement(this.data.id, this.data.src)
		}
	}

	public update(newData: AudioElementData): boolean {
		const normalizedData = normalizeLegacyAudioDimensions(newData)
		const previousData = this.data
		this.data = normalizedData
		const resourceChanged = previousData.src !== normalizedData.src
		const needsRerender =
			resourceChanged ||
			previousData.name !== normalizedData.name ||
			previousData.width !== normalizedData.width ||
			previousData.height !== normalizedData.height

		if (resourceChanged) {
			this.canvas.audioPlaybackManager.release(this.data.id)
			this.playbackSnapshot = this.canvas.audioPlaybackManager.getSnapshot(this.data.id)
			this.resourceError = false
			if (normalizedData.src) {
				this.canvas.visibilityManager.updateAudioElement(this.data.id, normalizedData.src)
			} else {
				this.canvas.visibilityManager.unregisterAudioElement(this.data.id)
			}
		}

		if (!needsRerender && this.node) {
			this.updateBaseProps(this.node, normalizedData)
		}
		return needsRerender
	}

	public override getTransformBehavior(): TransformBehavior {
		return TransformBehavior.APPLY_TO_SIZE
	}

	public override getTransformConstraints(): ElementTransformConstraints {
		return {
			enabledAnchors: ["middle-left", "middle-right"],
			minWidth: AUDIO_CONFIG.MIN_WIDTH,
			fixedHeight: AUDIO_CONFIG.DEFAULT_HEIGHT,
		}
	}

	public override applyTransform(
		updates: Partial<LayerElement>,
		context: TransformContext,
	): Partial<LayerElement> {
		if ((context.isRealtime && context.isScaling) || !context.isRealtime) {
			const width =
				(updates.width ?? this.data.width ?? AUDIO_CONFIG.DEFAULT_WIDTH) *
				(updates.scaleX ?? 1)
			return {
				x: updates.x,
				y: updates.y,
				width: Math.max(AUDIO_CONFIG.MIN_WIDTH, Math.round(width)),
				height: AUDIO_CONFIG.DEFAULT_HEIGHT,
				scaleX: 1,
				scaleY: 1,
			}
		}
		return { x: updates.x, y: updates.y }
	}

	public playPreview(): void {
		if (!this.data.src) return
		void this.canvas.audioPlaybackManager
			.toggle(this.data.id, this.data.src)
			.then((success) => {
				if (!success) {
					this.resourceError = true
					this.rerenderWhenTransformIdle()
				}
			})
	}

	public pausePreview(): void {
		this.canvas.audioPlaybackManager.pause(this.data.id)
	}

	public override onResourceReferenceResolverChanged(): void {
		this.canvas.audioPlaybackManager.release(this.data.id)
		this.resourceError = false
	}

	public override destroy(): void {
		this.canvas.visibilityManager.unregisterAudioElement(this.data.id)
		this.playbackUnsubscribe()
		this.resourceFailureUnsubscribe()
		super.destroy()
	}

	private renderPlayButton(group: Konva.Group, height: number): void {
		const size = AUDIO_CONFIG.PLAY_BUTTON_SIZE
		const x = AUDIO_CONFIG.PADDING
		const y = (height - size) / 2
		const button = new Konva.Group({
			x,
			y,
			width: size,
			height: size,
			name: "audio-play-button",
		})
		button.add(
			new Konva.Circle({
				x: size / 2,
				y: size / 2,
				radius: size / 2,
				fill: "rgba(255, 255, 255, 0.14)",
			}),
		)
		button.add(
			new Konva.Line({
				name: NODE_NAMES.playTriangle,
				points: [17, 12, 17, 32, 32, 22],
				closed: true,
				fill: AUDIO_CONFIG.PRIMARY_TEXT,
				listening: false,
			}),
		)
		const pauseBars = new Konva.Group({ name: NODE_NAMES.pauseBars, listening: false })
		pauseBars.add(
			new Konva.Rect({ x: 15, y: 13, width: 5, height: 18, fill: AUDIO_CONFIG.PRIMARY_TEXT }),
			new Konva.Rect({ x: 25, y: 13, width: 5, height: 18, fill: AUDIO_CONFIG.PRIMARY_TEXT }),
		)
		button.add(pauseBars)
		button.on("click tap", (event) => {
			event.cancelBubble = true
			this.playPreview()
		})
		group.add(button)
	}

	private renderContent(group: Konva.Group, width: number, height: number): void {
		const left = AUDIO_CONFIG.PADDING + AUDIO_CONFIG.PLAY_BUTTON_SIZE + 14
		const right = AUDIO_CONFIG.PADDING
		const contentWidth = Math.max(80, width - left - right)
		const contentTop = Math.max(AUDIO_CONFIG.PADDING, (height - 100) / 2)
		const fileName =
			this.data.name || getCanvasResourceFileName(this.data.src) || this.getRenderName()
		group.add(
			new Konva.Text({
				x: left,
				y: contentTop,
				width: contentWidth,
				text: `♫  ${fileName}`,
				fontSize: 15,
				fontFamily: "Arial, sans-serif",
				fill: AUDIO_CONFIG.PRIMARY_TEXT,
				ellipsis: true,
				wrap: "none",
				listening: false,
			}),
		)

		const trackX = left
		const trackY = contentTop + 44
		const trackWidth = contentWidth
		group.add(
			new Konva.Rect({
				x: trackX,
				y: trackY,
				width: trackWidth,
				height: 4,
				fill: AUDIO_CONFIG.TRACK,
				cornerRadius: 2,
				name: "audio-progress-track",
			}),
			new Konva.Rect({
				x: trackX,
				y: trackY,
				width: 0,
				height: 4,
				fill: AUDIO_CONFIG.PROGRESS,
				cornerRadius: 2,
				name: NODE_NAMES.progressFill,
				listening: false,
			}),
			new Konva.Text({
				x: left,
				y: contentTop + 58,
				width: contentWidth,
				text: "0:00 / 0:00",
				fontSize: 12,
				fill: AUDIO_CONFIG.SECONDARY_TEXT,
				name: NODE_NAMES.time,
				listening: false,
			}),
			new Konva.Text({
				x: left,
				y: contentTop + 76,
				width: contentWidth,
				text: "",
				fontSize: 11,
				fill: AUDIO_CONFIG.ERROR,
				name: NODE_NAMES.error,
				ellipsis: true,
				wrap: "none",
				listening: false,
			}),
		)
		const progressHit = new Konva.Rect({
			x: trackX,
			y: trackY - 8,
			width: trackWidth,
			height: 20,
			fill: "transparent",
			name: "audio-progress-hit",
		})
		progressHit.on("click tap", (event) => {
			event.cancelBubble = true
			const pointer = group.getRelativePointerPosition()
			if (!pointer) return
			this.canvas.audioPlaybackManager.seek(this.data.id, (pointer.x - trackX) / trackWidth)
		})
		group.add(progressHit)
	}

	private syncPlaybackNodes(): void {
		if (!(this.node instanceof Konva.Group)) return
		const { duration, currentTime, paused, ended, error } = this.playbackSnapshot
		const isPlaying = !paused && !ended
		const playTriangle = this.node.findOne(`.${NODE_NAMES.playTriangle}`)
		const pauseBars = this.node.findOne(`.${NODE_NAMES.pauseBars}`)
		playTriangle?.visible(!isPlaying)
		pauseBars?.visible(isPlaying)

		const progressFill = this.node.findOne(`.${NODE_NAMES.progressFill}`) as
			Konva.Rect | undefined
		const progressTrack = this.node.findOne(".audio-progress-track") as Konva.Rect | undefined
		const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0
		if (progressFill && progressTrack) {
			progressFill.width(progressTrack.width() * progress)
		}

		const timeText = this.node.findOne(`.${NODE_NAMES.time}`) as Konva.Text | undefined
		timeText?.text(`${formatTime(currentTime)} / ${formatTime(duration)}`)
		const errorText = this.node.findOne(`.${NODE_NAMES.error}`) as Konva.Text | undefined
		if (errorText) {
			const failureReason = this.data.src
				? this.canvas.audioResourceManager.getFailureReason(this.data.src)
				: null
			errorText.text(
				error || this.resourceError
					? failureReason === "not-found"
						? this.getText("audio.fileMissing", "音频文件不存在")
						: this.getText("audio.loadFailed", "音频加载失败，点击播放重试")
					: "",
			)
		}
		this.canvas.runtimeScheduler.requestLayerDraw("content", {
			source: "AudioElement",
			reason: "playback-state",
		})
	}
}
