import {
	ALL_FORMATS,
	AudioBufferSink,
	AudioBufferSource,
	CanvasSource,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
	StreamTarget,
	UrlSource,
	VideoSampleSink,
	canEncodeAudio,
	canEncodeVideo,
	type InputAudioTrack,
	type InputVideoTrack,
	type Output as MediabunnyOutput,
	type Target,
} from "mediabunny"
import { getDownstreamContent, getActiveContent } from "../../document/elementContent"
import {
	ElementTypeEnum,
	type AudioElementContent,
	type LayerElement,
	type VideoEditElement,
	type VideoEditElementContent,
	type VideoElementContent,
} from "../../document/types"
import { ElementFactory } from "../../elements/core/ElementFactory"
import { generateElementId } from "../../shared/ids"
import { getCanvasResourceFileName } from "../../shared/path/canvasResourcePath"
import type { Canvas } from "../../core/Canvas"
import { GenerationStatus } from "../../../public/magic-types"

const VIDEO_FPS = 30
const AUDIO_SAMPLE_RATE = 48_000
const AUDIO_CHANNELS = 2
const MAX_DURATION_SECONDS = 10 * 60
const AUDIO_CHUNK_SECONDS = 5
const MAX_BUFFER_FALLBACK_BYTES = 100 * 1024 * 1024
const RESULT_HORIZONTAL_GAP = 64

export const VIDEO_EDIT_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const
export const VIDEO_EDIT_RESOLUTIONS = ["720P", "1080P"] as const
export const VIDEO_EDIT_FORMATS = ["mp4"] as const
export type VideoEditAspectRatio = (typeof VIDEO_EDIT_ASPECT_RATIOS)[number]
export type VideoEditResolution = (typeof VIDEO_EDIT_RESOLUTIONS)[number]
export type VideoEditFormat = (typeof VIDEO_EDIT_FORMATS)[number]

export type VideoCompositionStatus =
	| "idle"
	| "checking"
	| "preparing"
	| "encoding"
	| "finalizing"
	| "uploading"
	| "completed"
	| "error"
	| "cancelled"

export type VideoCompositionPhase = "checking" | "video" | "audio" | "finalizing" | "uploading"

export type VideoCompositionIssueCode =
	| "missing-video"
	| "missing-source"
	| "resource-load-failed"
	| "unsupported-container"
	| "missing-video-track"
	| "video-decode-unsupported"
	| "audio-decode-unsupported"
	| "audio-resource-load-failed"
	| "duration-limit"
	| "video-encode-unsupported"
	| "audio-encode-unsupported"
	| "browser-storage-unsupported"
	| "stale-input"
	| "composition-failed"

export interface VideoCompositionIssue {
	code: VideoCompositionIssueCode
	elementId?: string
	message: string
}

export interface VideoCompositionSnapshot {
	status: VideoCompositionStatus
	progress: number
	phase?: VideoCompositionPhase
	issues: VideoCompositionIssue[]
	errorMessage?: string
	resultElementId?: string
}

export type VideoCompositionListener = (snapshot: VideoCompositionSnapshot) => void

interface CompositionVideoSource {
	elementId: string
	path: string
	url: string
	input: Input
	videoTrack: InputVideoTrack
	audioTrack: InputAudioTrack | null
	duration: number
	videoStart: number
	displayWidth: number
	displayHeight: number
}

interface CompositionAudioSource {
	elementId: string
	path: string
	url: string
	input: Input
	audioTrack: InputAudioTrack
	duration: number
	audioStart: number
}

interface NormalizedOutput {
	aspectRatio: VideoEditAspectRatio
	resolution: VideoEditResolution
	format: "mp4"
	width: number
	height: number
}

interface CompositionJob {
	elementId: string
	operationId: string
	controller: AbortController
	signature: string
	staleInput?: boolean
	output?: MediabunnyOutput
	targetCleanup?: () => Promise<void>
	inputs: Input[]
}

interface OutputTargetHandle {
	target: Target
	getFile: () => Promise<File>
	cleanup: () => Promise<void>
	isBuffered: boolean
}

class CompositionCancelledError extends Error {
	constructor() {
		super("Video composition cancelled")
		this.name = "CompositionCancelledError"
	}
}

class CompositionStaleError extends Error {
	constructor() {
		super("Video composition input changed")
		this.name = "CompositionStaleError"
	}
}

class CompositionIssueError extends Error {
	readonly issue: VideoCompositionIssue

	constructor(issue: VideoCompositionIssue) {
		super(issue.message)
		this.name = "CompositionIssueError"
		this.issue = issue
	}
}

function cloneSnapshot(snapshot: VideoCompositionSnapshot): VideoCompositionSnapshot {
	return {
		...snapshot,
		issues: snapshot.issues.map((issue) => ({ ...issue })),
	}
}

function getAspectRatioValue(aspectRatio: string | undefined): number | null {
	if (!aspectRatio) return null
	const [width, height] = aspectRatio.split(":").map(Number)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null
	}
	return width / height
}

function resolveNearestAspectRatio(width: number, height: number): VideoEditAspectRatio {
	const value = width > 0 && height > 0 ? width / height : 16 / 9
	return VIDEO_EDIT_ASPECT_RATIOS.reduce((nearest, candidate) => {
		const candidateValue = getAspectRatioValue(candidate) ?? 16 / 9
		const nearestValue = getAspectRatioValue(nearest) ?? 16 / 9
		return Math.abs(candidateValue - value) < Math.abs(nearestValue - value)
			? candidate
			: nearest
	}, "16:9" as VideoEditAspectRatio)
}

function getOutputDimensions(
	aspectRatio: VideoEditAspectRatio,
	resolution: VideoEditResolution,
): { width: number; height: number } {
	const longEdge = resolution === "1080P" ? 1080 : 720
	if (aspectRatio === "9:16") return { width: longEdge, height: (longEdge * 16) / 9 }
	if (aspectRatio === "1:1") return { width: longEdge, height: longEdge }
	return { width: (longEdge * 16) / 9, height: longEdge }
}

function estimateOutputBytes(
	output: NormalizedOutput,
	duration: number,
	hasAudio: boolean,
): number {
	const videoBitsPerSecond = output.resolution === "1080P" ? 8_000_000 : 4_000_000
	const audioBitsPerSecond = hasAudio ? 256_000 : 0
	return Math.ceil(((duration * (videoBitsPerSecond + audioBitsPerSecond)) / 8) * 1.1)
}

function normalizeOutput(
	output: VideoEditElementContent["output"] | undefined,
	firstVideo?: { displayWidth: number; displayHeight: number },
): NormalizedOutput {
	const requestedAspect = output?.aspectRatio
	const aspectRatio = VIDEO_EDIT_ASPECT_RATIOS.includes(requestedAspect as VideoEditAspectRatio)
		? (requestedAspect as VideoEditAspectRatio)
		: resolveNearestAspectRatio(firstVideo?.displayWidth ?? 16, firstVideo?.displayHeight ?? 9)
	const resolution = output?.resolution === "720P" ? "720P" : "1080P"
	const dimensions = getOutputDimensions(aspectRatio, resolution)
	return {
		aspectRatio,
		resolution,
		format: "mp4",
		width: Math.round(dimensions.width),
		height: Math.round(dimensions.height),
	}
}

function getVideoName(element: LayerElement | undefined): string {
	if (!element || element.type !== ElementTypeEnum.Video) return "视频"
	const content = getDownstreamContent<VideoElementContent>(element)
	return (
		element.name || getCanvasResourceFileName(content?.src).replace(/\.[^/.]+$/, "") || "视频"
	)
}

function getContentSignature(canvas: Canvas, elementId: string): string | null {
	const element = canvas.elementManager.getElementData(elementId)
	if (!element || element.type !== ElementTypeEnum.VideoEdit) return null
	const content = getActiveContent<VideoEditElementContent>(element)
	if (!content) return null
	const videoSources = content.videoSequence.map((sourceId) => {
		const source = canvas.elementManager.getElementData(sourceId)
		const sourceContent =
			source?.type === ElementTypeEnum.Video
				? getDownstreamContent<VideoElementContent>(source)
				: undefined
		return {
			id: sourceId,
			contentId: sourceContent?.contentId ?? null,
			src: sourceContent?.src ?? null,
		}
	})
	const audioSources = content.audioSequence.map((sourceId) => {
		const source = canvas.elementManager.getElementData(sourceId)
		const sourceContent =
			source?.type === ElementTypeEnum.Audio
				? getDownstreamContent<AudioElementContent>(source)
				: undefined
		return {
			id: sourceId,
			contentId: sourceContent?.contentId ?? null,
			src: sourceContent?.src ?? null,
		}
	})
	return JSON.stringify({
		contentId: content.contentId,
		videoSources,
		audioSources,
		output: content.output ?? null,
	})
}

function throwIfAborted(job: CompositionJob, canvas: Canvas): void {
	if (job.controller.signal.aborted) throw new CompositionCancelledError()
	if (getContentSignature(canvas, job.elementId) !== job.signature) {
		throw new CompositionStaleError()
	}
}

async function yieldToBrowser(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export class VideoCompositionManager {
	private readonly canvas: Canvas
	private readonly snapshots = new Map<string, VideoCompositionSnapshot>()
	private readonly listeners = new Map<string, Set<VideoCompositionListener>>()
	private readonly jobs = new Map<string, CompositionJob>()
	private destroyed = false
	private readonly elementUpdatedUnsubscribe: () => void
	private readonly elementDeletedUnsubscribe: () => void
	private readonly canvasClearUnsubscribe: () => void

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.elementUpdatedUnsubscribe = this.canvas.eventEmitter.on("element:updated", () => {
			this.jobs.forEach((job) => {
				if (getContentSignature(this.canvas, job.elementId) !== job.signature) {
					job.staleInput = true
					this.cancel(job.elementId)
				}
			})
		})
		this.elementDeletedUnsubscribe = this.canvas.eventEmitter.on(
			"element:deleted",
			({ data }) => {
				this.jobs.forEach((job) => {
					if (
						job.elementId === data.elementId ||
						getContentSignature(this.canvas, job.elementId) !== job.signature
					) {
						if (getContentSignature(this.canvas, job.elementId) !== job.signature) {
							job.staleInput = true
						}
						this.cancel(job.elementId)
					}
				})
			},
		)
		this.canvasClearUnsubscribe = this.canvas.eventEmitter.on("canvas:clear", () => {
			this.jobs.forEach((job) => this.cancel(job.elementId))
		})
	}

	public subscribe(elementId: string, listener: VideoCompositionListener): () => void {
		const listeners = this.listeners.get(elementId) ?? new Set<VideoCompositionListener>()
		listeners.add(listener)
		this.listeners.set(elementId, listeners)
		listener(this.getSnapshot(elementId))
		return () => {
			listeners.delete(listener)
			if (listeners.size === 0) this.listeners.delete(elementId)
		}
	}

	public getSnapshot(elementId: string): VideoCompositionSnapshot {
		return cloneSnapshot(
			this.snapshots.get(elementId) ?? {
				status: "idle",
				progress: 0,
				issues: [],
			},
		)
	}

	public async start(elementId: string): Promise<boolean> {
		if (this.destroyed || this.jobs.has(elementId)) return false
		const signature = getContentSignature(this.canvas, elementId)
		if (!signature) {
			const message =
				this.canvas.t?.(
					"videoEditNode.compositionErrors.missingEditor",
					"找不到视频编辑节点",
				) || "找不到视频编辑节点"
			this.updateSnapshot(elementId, {
				status: "error",
				progress: 0,
				issues: [this.issue("missing-source", message)],
			})
			return false
		}
		const job: CompositionJob = {
			elementId,
			operationId: `${elementId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			controller: new AbortController(),
			signature,
			inputs: [],
		}
		this.jobs.set(elementId, job)
		this.updateSnapshot(elementId, {
			status: "checking",
			progress: 0,
			phase: "checking",
			issues: [],
			errorMessage: undefined,
			resultElementId: undefined,
		})

		try {
			const result = await this.run(job)
			return result
		} catch (error) {
			if (job.staleInput || error instanceof CompositionStaleError) {
				const message =
					this.canvas.t?.(
						"videoEditNode.compositionErrors.staleInput",
						"输入内容已变化，请重新合并",
					) || "输入内容已变化，请重新合并"
				const issue = this.issue("stale-input", message)
				this.updateSnapshot(elementId, {
					status: "error",
					progress: 0,
					phase: undefined,
					issues: [issue],
					errorMessage: issue.message,
				})
				return false
			}
			if (job.controller.signal.aborted || error instanceof CompositionCancelledError) {
				this.updateSnapshot(elementId, {
					status: "cancelled",
					progress: 0,
					phase: undefined,
					issues: [],
					errorMessage: undefined,
				})
				return false
			}
			const genericMessage =
				this.canvas.t?.(
					"videoEditNode.compositionErrors.compositionFailed",
					"视频合成失败，请重试",
				) || "视频合成失败，请重试"
			const issue =
				error instanceof CompositionIssueError
					? error.issue
					: error instanceof CompositionStaleError
						? this.issue(
								"stale-input",
								this.canvas.t?.(
									"videoEditNode.compositionErrors.staleInput",
									"输入内容已变化，请重新合并",
								) || "输入内容已变化，请重新合并",
							)
						: this.issue("composition-failed", genericMessage)
			this.updateSnapshot(elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues: [issue],
				errorMessage: issue.message,
			})
			return false
		} finally {
			await this.disposeJob(job)
			if (this.jobs.get(elementId) === job) this.jobs.delete(elementId)
		}
	}

	public cancel(elementId: string): void {
		const job = this.jobs.get(elementId)
		if (!job) return
		job.controller.abort()
		void job.output?.cancel().catch(() => undefined)
		job.inputs.forEach((input) => {
			try {
				input.dispose()
			} catch {
				// The input may already have been disposed by a preflight failure.
			}
		})
	}

	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		this.jobs.forEach((job) => this.cancel(job.elementId))
		this.elementUpdatedUnsubscribe()
		this.elementDeletedUnsubscribe()
		this.canvasClearUnsubscribe()
		this.listeners.clear()
	}

	private async run(job: CompositionJob): Promise<boolean> {
		const element = this.canvas.elementManager.getElementData(job.elementId)
		if (!element || element.type !== ElementTypeEnum.VideoEdit) {
			throw new CompositionIssueError(
				this.issue(
					"missing-source",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.missingEditor",
						"找不到视频编辑节点",
					) || "找不到视频编辑节点",
				),
			)
		}
		const content = getActiveContent<VideoEditElementContent>(element)
		if (!content || content.videoSequence.length === 0) {
			const message =
				this.canvas.t?.(
					"videoEditNode.compositionErrors.missingVideo",
					"请先关联至少一个视频",
				) || "请先关联至少一个视频"
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues: [this.issue("missing-video", message)],
			})
			return false
		}

		const videoSources: CompositionVideoSource[] = []
		const issues: VideoCompositionIssue[] = []
		for (const videoElementId of content.videoSequence) {
			throwIfAborted(job, this.canvas)
			const result = await this.prepareVideoSource(job, videoElementId)
			if (result.issue) issues.push(result.issue)
			if (result.source) videoSources.push(result.source)
			this.updateSnapshot(job.elementId, {
				status: "checking",
				progress: Math.min(0.2, (videoSources.length / content.videoSequence.length) * 0.2),
				phase: "checking",
				issues: [...issues],
			})
		}
		if (issues.length > 0 || videoSources.length !== content.videoSequence.length) {
			const fallbackMessage =
				this.canvas.t?.(
					"videoEditNode.compositionErrors.videoCheckFailed",
					"视频素材检查失败",
				) || "视频素材检查失败"
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues,
				errorMessage: issues[0]?.message ?? fallbackMessage,
			})
			return false
		}

		const audioElementId = content.audioSequence[0]
		let audioSource: CompositionAudioSource | null = null
		if (audioElementId) {
			const result = await this.prepareAudioSource(job, audioElementId)
			if (result.issue) issues.push(result.issue)
			audioSource = result.source
		}
		if (issues.length > 0) {
			const fallbackMessage =
				this.canvas.t?.(
					"videoEditNode.compositionErrors.audioCheckFailed",
					"音频素材检查失败",
				) || "音频素材检查失败"
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues,
				errorMessage: issues[0]?.message ?? fallbackMessage,
			})
			return false
		}

		const totalDuration = videoSources.reduce((sum, source) => sum + source.duration, 0)
		if (totalDuration > MAX_DURATION_SECONDS) {
			const message = (
				this.canvas.t?.(
					"videoEditNode.compositionErrors.durationLimit",
					"视频总时长不能超过 {{minutes}} 分钟",
				) || "视频总时长不能超过 {{minutes}} 分钟"
			).replace("{{minutes}}", String(MAX_DURATION_SECONDS / 60))
			const issue = this.issue("duration-limit", message)
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues: [issue],
				errorMessage: issue.message,
			})
			return false
		}

		const output = normalizeOutput(content.output, videoSources[0])
		const hasAudio = videoSources.some((source) => source.audioTrack) || Boolean(audioSource)
		if (!(await canEncodeVideo("avc", { width: output.width, height: output.height }))) {
			const issue = this.issue(
				"video-encode-unsupported",
				this.canvas.t?.(
					"videoEditNode.compositionErrors.videoEncodeUnsupported",
					"当前浏览器不支持 H.264 视频编码",
				) || "当前浏览器不支持 H.264 视频编码",
			)
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues: [issue],
				errorMessage: issue.message,
			})
			return false
		}
		if (
			hasAudio &&
			!(await canEncodeAudio("aac", {
				numberOfChannels: AUDIO_CHANNELS,
				sampleRate: AUDIO_SAMPLE_RATE,
			}))
		) {
			const issue = this.issue(
				"audio-encode-unsupported",
				this.canvas.t?.(
					"videoEditNode.compositionErrors.audioEncodeUnsupported",
					"当前浏览器不支持 AAC 音频编码",
				) || "当前浏览器不支持 AAC 音频编码",
			)
			this.updateSnapshot(job.elementId, {
				status: "error",
				progress: 0,
				phase: undefined,
				issues: [issue],
				errorMessage: issue.message,
			})
			return false
		}

		this.updateSnapshot(job.elementId, {
			status: "preparing",
			progress: 0.2,
			phase: "checking",
			issues: [],
		})
		throwIfAborted(job, this.canvas)
		const targetHandle = await this.createOutputTarget(
			job.operationId,
			job.elementId,
			estimateOutputBytes(output, totalDuration, hasAudio),
		)
		job.targetCleanup = targetHandle.cleanup
		const outputFormat = new Mp4OutputFormat({ fastStart: false })
		const canvas = document.createElement("canvas")
		canvas.width = output.width
		canvas.height = output.height
		const context = canvas.getContext("2d")
		if (!context) {
			throw new CompositionIssueError(
				this.issue(
					"composition-failed",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.canvasUnavailable",
						"当前浏览器无法创建视频合成画布",
					) || "当前浏览器无法创建视频合成画布",
				),
			)
		}
		const videoSource = new CanvasSource(canvas, {
			codec: "avc",
			quality: new Quality("high"),
			keyFrameInterval: 2,
		})
		const audioBufferSource = hasAudio
			? new AudioBufferSource({
					codec: "aac",
					quality: new Quality("high"),
					transform: {
						numberOfChannels: AUDIO_CHANNELS,
						sampleRate: AUDIO_SAMPLE_RATE,
					},
				})
			: null
		const outputFile = new Output({ format: outputFormat, target: targetHandle.target })
		job.output = outputFile
		outputFile.addVideoTrack(videoSource)
		if (audioBufferSource) outputFile.addAudioTrack(audioBufferSource)
		await outputFile.start()

		await this.encodeVideo(job, videoSources, videoSource, context, output, totalDuration)
		if (audioBufferSource) {
			await this.encodeAudio(job, videoSources, audioSource, audioBufferSource, totalDuration)
		}
		throwIfAborted(job, this.canvas)
		this.updateSnapshot(job.elementId, {
			status: "finalizing",
			progress: 0.94,
			phase: "finalizing",
			issues: [],
		})
		await outputFile.finalize()
		const file = await targetHandle.getFile()
		if (file.size > MAX_BUFFER_FALLBACK_BYTES && targetHandle.isBuffered) {
			throw new CompositionIssueError(
				this.issue(
					"browser-storage-unsupported",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.resultTooLarge",
						"视频结果过大，当前浏览器无法安全保存合成文件",
					) || "视频结果过大，当前浏览器无法安全保存合成文件",
				),
			)
		}

		throwIfAborted(job, this.canvas)
		this.updateSnapshot(job.elementId, {
			status: "uploading",
			progress: 0.96,
			phase: "uploading",
			issues: [],
		})
		const [uploadResult] = await this.canvas.canvasFileUploadManager.uploadDirect([file])
		if (!uploadResult?.path) {
			throw new CompositionIssueError(
				this.issue(
					"composition-failed",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.uploadFailed",
						"视频上传失败",
					) || "视频上传失败",
				),
			)
		}
		throwIfAborted(job, this.canvas)
		this.canvas.videoResourceManager.primeCache(uploadResult.path, uploadResult)
		const resultElementId = this.createResultElement(element, uploadResult.path, output)
		this.updateSnapshot(job.elementId, {
			status: "completed",
			progress: 1,
			phase: undefined,
			issues: [],
			resultElementId,
		})
		return true
	}

	private async prepareVideoSource(
		job: CompositionJob,
		elementId: string,
	): Promise<{ source?: CompositionVideoSource; issue?: VideoCompositionIssue }> {
		const element = this.canvas.elementManager.getElementData(elementId)
		if (!element || element.type !== ElementTypeEnum.Video) {
			return {
				issue: this.issue(
					"missing-source",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.linkedVideoMissing",
						"关联视频不存在",
					) || "关联视频不存在",
					elementId,
				),
			}
		}
		const content = getDownstreamContent<VideoElementContent>(element)
		if (!content?.src)
			return {
				issue: this.issue(
					"missing-source",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.linkedVideoFileMissing",
						"关联视频没有可用文件",
					) || "关联视频没有可用文件",
					elementId,
				),
			}
		let input: Input | undefined
		try {
			const url = await this.canvas.videoResourceManager.ensureFreshOssSrc(content.src, {
				priority: "critical",
				allowCachedFallback: true,
				signal: job.controller.signal,
			})
			throwIfAborted(job, this.canvas)
			if (!url)
				return {
					issue: this.issue(
						"resource-load-failed",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.videoResourceLoadFailed",
							"视频资源加载失败",
						) || "视频资源加载失败",
						elementId,
					),
				}
			input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS })
			job.inputs.push(input)
			if (!(await input.canRead())) {
				input.dispose()
				return {
					issue: this.issue(
						"unsupported-container",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.unsupportedVideoContainer",
							"不支持的视频容器格式",
						) || "不支持的视频容器格式",
						elementId,
					),
				}
			}
			const videoTrack = await input.getPrimaryVideoTrack()
			if (!videoTrack) {
				input.dispose()
				return {
					issue: this.issue(
						"missing-video-track",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.missingVideoTrack",
							"视频文件不包含视频轨道",
						) || "视频文件不包含视频轨道",
						elementId,
					),
				}
			}
			if (!(await videoTrack.canDecode())) {
				input.dispose()
				return {
					issue: this.issue(
						"video-decode-unsupported",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.videoDecodeUnsupported",
							"当前浏览器无法解码该视频",
						) || "当前浏览器无法解码该视频",
						elementId,
					),
				}
			}
			const videoStart = await input.getFirstTimestamp([videoTrack])
			const videoEnd = await input.computeDuration([videoTrack])
			const duration = videoEnd - videoStart
			if (!Number.isFinite(duration) || duration <= 0) {
				input.dispose()
				return {
					issue: this.issue(
						"resource-load-failed",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.videoDurationUnavailable",
							"无法读取视频时长",
						) || "无法读取视频时长",
						elementId,
					),
				}
			}
			const audioTrack = await input.getPrimaryAudioTrack()
			if (audioTrack && !(await audioTrack.canDecode())) {
				input.dispose()
				return {
					issue: this.issue(
						"audio-decode-unsupported",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.videoAudioDecodeUnsupported",
							"当前浏览器无法解码该视频音轨",
						) || "当前浏览器无法解码该视频音轨",
						elementId,
					),
				}
			}
			return {
				source: {
					elementId,
					path: content.src,
					url,
					input,
					videoTrack,
					audioTrack,
					duration,
					videoStart,
					displayWidth: await videoTrack.getDisplayWidth(),
					displayHeight: await videoTrack.getDisplayHeight(),
				},
			}
		} catch (error) {
			if (job.controller.signal.aborted) throw new CompositionCancelledError()
			input?.dispose()
			return {
				issue: this.issue(
					"resource-load-failed",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.videoResourceCheckFailed",
						"视频资源检查失败",
					) || "视频资源检查失败",
					elementId,
				),
			}
		}
	}

	private async prepareAudioSource(
		job: CompositionJob,
		elementId: string,
	): Promise<{ source?: CompositionAudioSource; issue?: VideoCompositionIssue }> {
		const element = this.canvas.elementManager.getElementData(elementId)
		if (!element || element.type !== ElementTypeEnum.Audio) {
			return {
				issue: this.issue(
					"missing-source",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.linkedAudioMissing",
						"关联音频不存在",
					) || "关联音频不存在",
					elementId,
				),
			}
		}
		const content = getDownstreamContent<AudioElementContent>(element)
		if (!content?.src)
			return {
				issue: this.issue(
					"missing-source",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.linkedAudioFileMissing",
						"关联音频没有可用文件",
					) || "关联音频没有可用文件",
					elementId,
				),
			}
		let input: Input | undefined
		try {
			const resource = await this.canvas.audioResourceManager.getResource(content.src, {
				priority: "critical",
				signal: job.controller.signal,
			})
			throwIfAborted(job, this.canvas)
			if (!resource) {
				return {
					issue: this.issue(
						"audio-resource-load-failed",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.audioResourceLoadFailed",
							"音频资源加载失败",
						) || "音频资源加载失败",
						elementId,
					),
				}
			}
			input = new Input({ source: new UrlSource(resource.ossSrc), formats: ALL_FORMATS })
			job.inputs.push(input)
			if (!(await input.canRead())) {
				input.dispose()
				return {
					issue: this.issue(
						"unsupported-container",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.unsupportedAudioContainer",
							"不支持的音频容器格式",
						) || "不支持的音频容器格式",
						elementId,
					),
				}
			}
			const audioTrack = await input.getPrimaryAudioTrack()
			if (!audioTrack) {
				input.dispose()
				return {
					issue: this.issue(
						"missing-source",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.missingAudioTrack",
							"音频文件不包含音频轨道",
						) || "音频文件不包含音频轨道",
						elementId,
					),
				}
			}
			if (!(await audioTrack.canDecode())) {
				input.dispose()
				return {
					issue: this.issue(
						"audio-decode-unsupported",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.audioDecodeUnsupported",
							"当前浏览器无法解码该音频",
						) || "当前浏览器无法解码该音频",
						elementId,
					),
				}
			}
			const audioStart = await input.getFirstTimestamp([audioTrack])
			const audioEnd = await input.computeDuration([audioTrack])
			const duration = audioEnd - audioStart
			if (!Number.isFinite(duration) || duration <= 0) {
				input.dispose()
				return {
					issue: this.issue(
						"audio-resource-load-failed",
						this.canvas.t?.(
							"videoEditNode.compositionErrors.audioDurationUnavailable",
							"无法读取音频时长",
						) || "无法读取音频时长",
						elementId,
					),
				}
			}
			return {
				source: {
					elementId,
					path: content.src,
					url: resource.ossSrc,
					input,
					audioTrack,
					duration,
					audioStart,
				},
			}
		} catch (error) {
			if (job.controller.signal.aborted) throw new CompositionCancelledError()
			input?.dispose()
			return {
				issue: this.issue(
					"audio-resource-load-failed",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.audioResourceCheckFailed",
						"音频资源检查失败",
					) || "音频资源检查失败",
					elementId,
				),
			}
		}
	}

	private async encodeVideo(
		job: CompositionJob,
		sources: CompositionVideoSource[],
		videoSource: CanvasSource,
		context: CanvasRenderingContext2D,
		output: NormalizedOutput,
		totalDuration: number,
	): Promise<void> {
		let globalTimestamp = 0
		let encodedFrames = 0
		const totalFrames = Math.max(1, Math.ceil(totalDuration * VIDEO_FPS))
		for (const source of sources) {
			const sink = new VideoSampleSink(source.videoTrack)
			const frameCount = Math.max(1, Math.ceil(source.duration * VIDEO_FPS))
			let hasFrame = false
			const timestamps = function* () {
				for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
					yield source.videoStart +
						Math.min(Math.max(0, source.duration - 1e-6), frameIndex / VIDEO_FPS)
				}
			}
			let frameIndex = 0
			for await (const sample of sink.samplesAtTimestamps(timestamps())) {
				throwIfAborted(job, this.canvas)
				const currentFrameIndex = frameIndex
				frameIndex += 1
				const localTimestamp = Math.min(
					Math.max(0, source.duration - 1e-6),
					currentFrameIndex / VIDEO_FPS,
				)
				const frameDuration = Math.min(1 / VIDEO_FPS, source.duration - localTimestamp)
				if (frameDuration <= 0) {
					sample?.close()
					continue
				}
				if (sample) {
					context.fillStyle = "#000000"
					context.fillRect(0, 0, output.width, output.height)
					sample.drawWithFit(context, { fit: "cover" })
					sample.close()
					hasFrame = true
				} else if (!hasFrame) {
					const message = (
						this.canvas.t?.(
							"videoEditNode.compositionErrors.firstFrameDecodeFailed",
							"视频“{{name}}”首帧解码失败",
						) || "视频“{{name}}”首帧解码失败"
					).replace(
						"{{name}}",
						getVideoName(this.canvas.elementManager.getElementData(source.elementId)),
					)
					throw new CompositionIssueError(
						this.issue("composition-failed", message, source.elementId),
					)
				}
				await videoSource.add(globalTimestamp, frameDuration)
				globalTimestamp += frameDuration
				encodedFrames += 1
				this.updateSnapshot(job.elementId, {
					status: "encoding",
					progress: 0.2 + (encodedFrames / totalFrames) * 0.62,
					phase: "video",
					issues: [],
				})
				if (encodedFrames % 15 === 0) await yieldToBrowser()
			}
		}
	}

	private async encodeAudio(
		job: CompositionJob,
		videoSources: CompositionVideoSource[],
		externalAudio: CompositionAudioSource | null,
		audioSource: AudioBufferSource,
		totalDuration: number,
	): Promise<void> {
		const chunkCount = Math.max(1, Math.ceil(totalDuration / AUDIO_CHUNK_SECONDS))
		const videoOffsets: Array<{ source: CompositionVideoSource; offset: number }> = []
		let offset = 0
		videoSources.forEach((source) => {
			videoOffsets.push({ source, offset })
			offset += source.duration
		})
		for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
			throwIfAborted(job, this.canvas)
			const chunkStart = chunkIndex * AUDIO_CHUNK_SECONDS
			const chunkDuration = Math.min(AUDIO_CHUNK_SECONDS, totalDuration - chunkStart)
			const context = new OfflineAudioContext(
				AUDIO_CHANNELS,
				Math.max(1, Math.ceil(chunkDuration * AUDIO_SAMPLE_RATE)),
				AUDIO_SAMPLE_RATE,
			)
			const tracks: Array<{
				sink: AudioBufferSink
				outputStart: number
				outputEnd: number
				mediaStart: number
			}> = videoOffsets
				.filter(
					({ source, offset: sourceOffset }) =>
						source.audioTrack &&
						sourceOffset < chunkStart + chunkDuration &&
						sourceOffset + source.duration > chunkStart,
				)
				.map(({ source, offset: sourceOffset }) => ({
					sink: new AudioBufferSink(source.audioTrack!),
					outputStart: sourceOffset,
					outputEnd: sourceOffset + source.duration,
					mediaStart: source.videoStart,
				}))
			if (externalAudio) {
				tracks.push({
					sink: new AudioBufferSink(externalAudio.audioTrack),
					outputStart: 0,
					outputEnd: Math.min(totalDuration, externalAudio.duration),
					mediaStart: externalAudio.audioStart,
				})
			}
			for (const track of tracks) {
				const overlapStart = Math.max(chunkStart, track.outputStart)
				const overlapEnd = Math.min(chunkStart + chunkDuration, track.outputEnd)
				if (overlapEnd <= overlapStart) continue
				const requestedMediaStart = track.mediaStart + overlapStart - track.outputStart
				const requestedMediaEnd = track.mediaStart + overlapEnd - track.outputStart
				for await (const wrapped of track.sink.buffers(
					requestedMediaStart - 1,
					requestedMediaEnd,
				)) {
					const absoluteStart = track.outputStart + wrapped.timestamp - track.mediaStart
					const absoluteEnd = absoluteStart + wrapped.duration
					const bufferOverlapStart = Math.max(chunkStart, absoluteStart)
					const bufferOverlapEnd = Math.min(chunkStart + chunkDuration, absoluteEnd)
					if (bufferOverlapEnd <= bufferOverlapStart) continue
					const node = context.createBufferSource()
					node.buffer = wrapped.buffer
					node.connect(context.destination)
					node.start(
						bufferOverlapStart - chunkStart,
						bufferOverlapStart - absoluteStart,
						bufferOverlapEnd - bufferOverlapStart,
					)
				}
			}
			const mixed = await context.startRendering()
			await audioSource.add(mixed)
			this.updateSnapshot(job.elementId, {
				status: "encoding",
				progress: 0.82 + ((chunkIndex + 1) / chunkCount) * 0.1,
				phase: "audio",
				issues: [],
			})
			await yieldToBrowser()
		}
	}

	private async createOutputTarget(
		operationId: string,
		elementId: string,
		estimatedBytes: number,
	): Promise<OutputTargetHandle> {
		const fileName = `canvas-video-composition-${elementId}-${operationId}.mp4`
		const storage = typeof navigator !== "undefined" ? navigator.storage : undefined
		const getDirectory =
			storage &&
			(
				storage as StorageManager & {
					getDirectory?: () => Promise<FileSystemDirectoryHandle>
				}
			).getDirectory
		if (getDirectory) {
			let directory: FileSystemDirectoryHandle | undefined
			try {
				const root = await getDirectory.call(storage)
				directory = await root.getDirectoryHandle("video-compositions", { create: true })
				const handle = await directory.getFileHandle(fileName, { create: true })
				const writable = await handle.createWritable()
				return {
					target: new StreamTarget(writable, { chunked: true }),
					getFile: async () =>
						new File([await handle.getFile()], fileName, { type: "video/mp4" }),
					cleanup: async () => {
						try {
							await writable.close()
						} catch {
							// Output.finalize/cancel may already have closed the writable.
						}
						try {
							await directory?.removeEntry(fileName)
						} catch {
							// Best-effort cleanup for browsers that remove the temporary file on close.
						}
					},
					isBuffered: false,
				}
			} catch {
				try {
					await directory?.removeEntry(fileName)
				} catch {
					// Fall through to the bounded in-memory target.
				}
			}
		}
		if (estimatedBytes > MAX_BUFFER_FALLBACK_BYTES) {
			throw new CompositionIssueError(
				this.issue(
					"browser-storage-unsupported",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.storageUnavailable",
						"当前浏览器无法为该视频提供足够的临时存储空间",
					) || "当前浏览器无法为该视频提供足够的临时存储空间",
				),
			)
		}
		const { BufferTarget } = await import("mediabunny")
		const target = new BufferTarget()
		return {
			target,
			getFile: async () =>
				new File([target.buffer ?? new ArrayBuffer(0)], fileName, { type: "video/mp4" }),
			cleanup: async () => undefined,
			isBuffered: true,
		}
	}

	private createResultElement(
		videoEdit: VideoEditElement,
		path: string,
		output: NormalizedOutput,
	): string {
		const displayScale = Math.min(1280 / output.width, 720 / output.height)
		const width = Math.max(320, Math.round(output.width * displayScale))
		const height = Math.max(180, Math.round(output.height * displayScale))
		const elementId = generateElementId()
		const result = ElementFactory.createElementData(
			ElementTypeEnum.Video,
			elementId,
			(videoEdit.x ?? 0) + (videoEdit.width ?? 0) + RESULT_HORIZONTAL_GAP,
			(videoEdit.y ?? 0) + ((videoEdit.height ?? 0) - height) / 2,
			width,
			height,
			this.canvas.elementManager.getNextZIndexInLevel(),
		)
		if (result.type !== ElementTypeEnum.Video) {
			throw new CompositionIssueError(
				this.issue(
					"composition-failed",
					this.canvas.t?.(
						"videoEditNode.compositionErrors.resultElementCreateFailed",
						"创建合成视频元素失败",
					) || "创建合成视频元素失败",
				),
			)
		}
		const contentId = result.activeContentId
		result.name =
			this.canvas.t?.("videoEditNode.compositionResultName", "视频编辑-合并结果") ||
			"视频编辑-合并结果"
		result.contents = [{ contentId, src: path, status: GenerationStatus.Completed }]
		this.canvas.elementManager.create(result)
		this.canvas.selectionManager.select(elementId)
		requestAnimationFrame(() => {
			if (!this.canvas.elementManager.hasElement(elementId)) return
			if (this.canvas.viewportController.isElementInViewport([elementId])) return
			this.canvas.viewportController.moveElementToViewport([elementId], {
				animated: true,
				padding: { top: 50, right: 50, bottom: 50, left: 100 },
			})
		})
		return elementId
	}

	private async disposeJob(job: CompositionJob): Promise<void> {
		const output = job.output
		job.output = undefined
		if (output && output.state !== "finalized" && output.state !== "canceled") {
			await output.cancel().catch(() => undefined)
		}
		job.inputs.forEach((input) => {
			try {
				input.dispose()
			} catch {
				// Inputs may already be disposed after cancellation.
			}
		})
		job.inputs = []
		await job.targetCleanup?.()
		job.targetCleanup = undefined
	}

	private updateSnapshot(elementId: string, updates: Partial<VideoCompositionSnapshot>): void {
		const next = {
			...this.getSnapshot(elementId),
			...updates,
		}
		this.snapshots.set(elementId, next)
		this.listeners.get(elementId)?.forEach((listener) => listener(cloneSnapshot(next)))
	}

	private issue(
		code: VideoCompositionIssueCode,
		message: string,
		elementId?: string,
	): VideoCompositionIssue {
		return { code, message, ...(elementId ? { elementId } : {}) }
	}
}

export function normalizeVideoEditOutput(
	output: VideoEditElementContent["output"] | undefined,
	firstVideo?: { displayWidth: number; displayHeight: number },
): NormalizedOutput {
	return normalizeOutput(output, firstVideo)
}
