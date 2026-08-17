import type { EmbedFontInput } from "../api/font"
import type { ExportProgress, PptxOutputSink, SlideConfig } from "../api/options"
import type { SerializablePPTNode } from "../ir/serialize"

/**
 * The streaming package is deliberately described locally instead of importing
 * the PptxGenJS v5 declarations. The protocol stays narrow so it can cross a
 * browser Worker boundary without importing Node-only implementation details.
 */
export interface StreamingPlannedSlide {
	readonly key: string
	readonly ordinal: number
	readonly slideId: number
	readonly presentationRelId: number
	readonly partName: string
	readonly layoutKey?: string
	readonly sectionKey?: string
}

export interface StreamingSlidePlan {
	readonly slides: readonly StreamingPlannedSlide[]
	readonly byKey?: ReadonlyMap<string, StreamingPlannedSlide>
}

export interface StreamingSectionPlan {
	readonly key: string
	readonly id?: string
	readonly title: string
	readonly order: number
	readonly type?: "user" | "default"
}

/** A structural subset of PptxGenJS's frozen beginStreaming plan. */
export interface StreamingPresentationPlan {
	readonly finalSlideCount?: number
	readonly slidePlan?: StreamingSlidePlan
	readonly sections?: readonly StreamingSectionPlan[]
	readonly capacityPlan?: object
}

export interface StreamingSlideOptions {
	readonly slideKey?: string
	readonly masterName?: string
	readonly sectionTitle?: string
}

export interface StreamingCommitSlidePayload {
	readonly nodes: SerializablePPTNode[]
	readonly background?: string | null
	readonly options?: StreamingSlideOptions
}

export interface StreamingSlideCommitSummary {
	readonly manifest?: unknown
	readonly bytesWritten: bigint
}

export interface StreamingExportSummary {
	readonly slideCount: number
	readonly mediaPartCount: number
	readonly bytesWritten: bigint
}

export type StreamingOutputSink = PptxOutputSink

export interface StreamingWorkerFactory {
	(): StreamingWorkerLike
}

/** Minimal Worker surface used by browsers, tests, and desktop bridges. */
export interface StreamingWorkerLike {
	postMessage(message: unknown, transfer?: Transferable[]): void
	addEventListener?(
		type: "message" | "error" | "messageerror",
		listener: (event: MessageEvent) => void,
	): void
	removeEventListener?(
		type: "message" | "error" | "messageerror",
		listener: (event: MessageEvent) => void,
	): void
	onmessage?: ((event: MessageEvent) => void) | null
	onerror?: ((event: ErrorEvent) => void) | null
	terminate?(): void
}

export type StreamingWorkerDestination =
	| WritableStream<Uint8Array>
	| {
			kind: "writable-stream"
			writable: WritableStream<Uint8Array>
	  }
	| {
			kind: "transferable-stream"
			writable: WritableStream<Uint8Array>
	  }
	| {
			kind: "sink-proxy"
			sink: StreamingOutputSink
			ackWindow?: number
	  }

export interface CreateStreamingPresentationPackagerInput {
	config: SlideConfig
	plan: StreamingPresentationPlan
	fileName?: string
	embedFonts?: EmbedFontInput[]
	destination: StreamingWorkerDestination
	compression?: boolean
	signal?: AbortSignal
	/**
	 * Host-provided Packaging Worker module URL. Required for CJS/non-Vite
	 * browser consumers or when the generated `dist/assets` file is relocated.
	 */
	workerUrl?: string | URL
	workerFactory?: StreamingWorkerFactory
	onProgress?: (progress: ExportProgress) => void
}

export interface StreamingPresentationPackager {
	readonly state:
		| "starting"
		| "accepting-slides"
		| "committing-slide"
		| "finalizing"
		| "completed"
		| "failed"
		| "aborted"
	readonly ready: Promise<void>
	commitSlide(payload: StreamingCommitSlidePayload): Promise<StreamingSlideCommitSummary>
	commitSlides(
		batch: StreamingSlideBatch,
		batchIndex?: number,
	): Promise<readonly StreamingSlideCommitSummary[]>
	finalize(): Promise<StreamingExportSummary>
	abort(reason?: unknown): Promise<void>
	dispose(): void
}

export interface StreamingSlideBatch {
	slides: SerializablePPTNode[][]
	slideBackgrounds: (string | null)[]
}

export interface SerializedStreamingError {
	readonly name: string
	readonly message: string
	readonly stack?: string
	readonly cause?: string
}

export type StreamingPackagingWorkerRequest =
	| {
			type: "start"
			payload: {
				config: SlideConfig
				plan: StreamingPresentationPlan
				embedFonts?: EmbedFontInput[]
				compression?: boolean
				destination:
					| { kind: "transferable-stream"; writable: WritableStream<Uint8Array> }
					| { kind: "sink-proxy"; ackWindow?: number }
			}
	  }
	| {
			type: "commit-slide"
			requestId: number
			payload: StreamingCommitSlidePayload
	  }
	| { type: "finalize"; requestId: number }
	| { type: "abort"; requestId?: number; reason?: string }
	| { type: "sink-ack"; chunkId: number }

export type StreamingPackagingWorkerResponse =
	| { type: "ready" }
	| {
			type: "slide-committed"
			requestId: number
			summary: StreamingSlideCommitSummary
	  }
	| { type: "sink-chunk"; chunkId: number; data: ArrayBuffer }
	| { type: "progress"; progress: ExportProgress }
	| { type: "completed"; requestId: number; summary: StreamingExportSummary }
	| { type: "aborted"; requestId?: number }
	| { type: "error"; requestId?: number; error: SerializedStreamingError }
