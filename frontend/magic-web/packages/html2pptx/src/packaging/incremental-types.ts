import type { EmbedFontInput } from "../api/font"
import type { GeneratedPPTX, ResourceLoadError, SlideConfig } from "../api/options"
import type { SerializablePPTNode } from "../ir/serialize"

export interface IncrementalSlideBatch {
	slides: SerializablePPTNode[][]
	slideBackgrounds: (string | null)[]
}

export interface CreateIncrementalPresentationPackagerInput {
	/** Initial layout used while pages are appended. */
	initialConfig?: SlideConfig
	/** Auto-size may replace the presentation layout once the maximum width is known. */
	allowLayoutChange?: boolean
	fileName: string
	signal: AbortSignal
	onResourceError?: (error: ResourceLoadError) => void
	download: boolean
}

export interface FinalizeIncrementalPresentationInput {
	config: SlideConfig
	embedFonts?: EmbedFontInput[]
}

export interface IncrementalPresentationPackager {
	appendSlides(batch: IncrementalSlideBatch, batchIndex: number): Promise<void>
	finalize(input: FinalizeIncrementalPresentationInput): Promise<GeneratedPPTX | void>
	/** Must synchronously cause every pending append/finalize promise to settle. */
	dispose(): void
}

export type IncrementalPackagingWorkerRequest =
	| {
			type: "start"
			payload: {
				initialConfig?: SlideConfig
				allowLayoutChange?: boolean
				fileName: string
			}
	  }
	| {
			type: "append-slides"
			requestId: number
			batchIndex: number
			payload: IncrementalSlideBatch
	  }
	| {
			type: "finalize"
			requestId: number
			payload: FinalizeIncrementalPresentationInput
	  }

export type IncrementalPackagingWorkerResponse =
	| { type: "ready" }
	| {
			type: "slides-appended"
			requestId: number
			resourceErrors?: ResourceLoadError[]
	  }
	| {
			type: "success"
			requestId: number
			buffer: ArrayBuffer
			resourceErrors?: ResourceLoadError[]
	  }
	| { type: "error"; requestId?: number; error: string }
