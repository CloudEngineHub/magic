import type {
	ExportOptions,
	ExportHandle,
	ExportProgress,
	ExportSummary,
	GeneratedPPTX,
	GenerateHandle,
	LargeExportOptions,
	PptxDestination,
	ResourceLoadError,
	SlideConfig,
	StreamingExportContent,
	StreamingExportHandle,
	StreamingHtmlPage,
} from "./api/options"
import { configureLogger, resetLogger } from "./logger"
import { createAbortError } from "./sandbox/abort"
import { HtmlRenderSandbox, type SandboxInstance } from "./sandbox"
import { DEFAULT_CONFIG } from "./shared/unit"
import { runExport } from "./pipeline/export-slides"
import { runStreamingExport } from "./pipeline/streaming-export"
import type { Html2PptxRuntime } from "./runtime"

/** Input contract for the optional runtime-owned large export implementation. */
export interface StreamingExportTaskInput {
	config: SlideConfig
	fileName: string
	pages: AsyncIterable<StreamingHtmlPage>
	pageCount?: number
	sandbox: SandboxInstance
	signal: AbortSignal
	skipFailedPages: boolean
	autoSize: boolean
	onResourceError?: (error: ResourceLoadError) => void
	onProgress?: (progress: ExportProgress) => void
	fontResolver?: LargeExportOptions["fontResolver"]
	fontMissPolicy?: LargeExportOptions["fontMissPolicy"]
	outputPolicy?: LargeExportOptions["outputPolicy"]
	destination?: PptxDestination
	mediaPolicy?: LargeExportOptions["mediaPolicy"]
	imagePolicy?: LargeExportOptions["imagePolicy"]
	stagingPolicy?: LargeExportOptions["stagingPolicy"]
	compression?: boolean
	pipeline?: Html2PptxRuntime["pipeline"]
}

/** Runtime hook implemented by the streaming page/IR/packaging pipeline. */
export type StreamingExportRunner = (input: StreamingExportTaskInput) => Promise<ExportSummary>

/** Optional streaming additions accepted by createPptxStreamingExporter(). */
export interface StreamingExportPipelineRuntime {
	/** Preferred hook name. It must consume pages serially and close/abort the destination. */
	exportStreaming?: StreamingExportRunner
	/** Compatibility alias while downstream pipeline wiring is being migrated. */
	runStreamingExport?: StreamingExportRunner
}

export type Html2PptxStreamingRuntime = Omit<Html2PptxRuntime, "pipeline"> & {
	pipeline?: NonNullable<Html2PptxRuntime["pipeline"]> & StreamingExportPipelineRuntime
}

function getExportConfig(options?: LargeExportOptions) {
	return { ...DEFAULT_CONFIG, ...options?.config }
}

/** Create a cancellable PPTX generator that returns a Blob instead of downloading it. */
export function createPptxGenerator(runtime: Html2PptxRuntime = {}) {
	return function generatePPTX(
		content: string | string[],
		options?: ExportOptions,
	): GenerateHandle {
		const controller = new AbortController()
		const promise = runExportPipeline(content, options, controller.signal, runtime, true).then(
			(output) => {
				if (!output) throw new Error("[generatePPTX] No PPTX artifact was produced")
				return output
			},
		)
		return { promise, cancel: () => controller.abort() }
	}
}

/** Generate a PPTX artifact without triggering a browser download. */
export const generatePPTX = createPptxGenerator()

/**
 * Export HTML as a PPTX file
 *
 * Supports concurrent exports: each call returns an independent { promise, cancel } pair.
 *
 * @param content - HTML content string, or an array of HTML pages
 * @param options - export options
 * @returns ExportHandle - promise waits for completion, and cancel() aborts this export
 *
 * @example
 * ```ts
 * // Basic usage
 * const { promise } = exportPPTX('<div class="slide">...</div>')
 * await promise
 *
 * // Use console logging
 * exportPPTX(html, { logger: console })
 *
 * // Only collect warn and above
 * exportPPTX(html, { logger: console, logLevel: "warn" })
 *
 * // Concurrent exports with independent cancellation
 * const exportA = exportPPTX(htmlA)
 * const exportB = exportPPTX(htmlB, { fileName: "b.pptx" })
 * exportA.cancel()
 * await exportB.promise
 * ```
 */
export function createPptxExporter(runtime: Html2PptxRuntime = {}) {
	return function exportPPTX(content: string | string[], options?: ExportOptions): ExportHandle {
		const controller = new AbortController()
		const promise = runExportPipeline(content, options, controller.signal, runtime, false).then(
			() => undefined,
		)
		return { promise, cancel: () => controller.abort() }
	}
}

export const exportPPTX = createPptxExporter()

/**
 * Create a cancellable forward-only exporter. Unlike exportPPTX(), this entry never
 * buffers an AsyncIterable into string[] and never falls back to a final Blob.
 */
export function createPptxStreamingExporter(runtime: Html2PptxStreamingRuntime = {}) {
	return function exportPPTXStreaming(
		content: StreamingExportContent,
		options?: LargeExportOptions,
	): StreamingExportHandle {
		const controller = new AbortController()
		const promise = runStreamingExportPipeline(content, options, controller.signal, runtime)
		return { promise, cancel: () => controller.abort() }
	}
}

/** Export an AsyncIterable page source to a caller-selected streaming destination. */
export const exportPPTXStreaming = createPptxStreamingExporter()

async function runStreamingExportPipeline(
	content: StreamingExportContent,
	options: LargeExportOptions | undefined,
	signal: AbortSignal,
	runtime: Html2PptxStreamingRuntime,
): Promise<ExportSummary> {
	configureLogger({
		minLevel: options?.logLevel,
		logger: options?.logger,
	})

	let sandbox: SandboxInstance | undefined
	let runnerOwnsDestination = false
	try {
		const runner =
			runtime.pipeline?.exportStreaming ??
			runtime.pipeline?.runStreamingExport ??
			runStreamingExport

		throwIfStreamingAborted(signal)
		const config = getExportConfig(options)
		const fileName = options?.fileName ?? "export.pptx"
		const pageCount = options?.pageCount ?? getKnownStreamingPageCount(content)
		options?.onProgress?.({ phase: "preflight", pageCount })

		sandbox = runtime.createSandbox
			? runtime.createSandbox(config)
			: new HtmlRenderSandbox(config, {
					ReadyController: runtime.sandboxReadyController,
				})

		const runnerPromise = runner({
			config,
			fileName,
			pages: iterateStreamingHtmlPages(content, signal),
			pageCount,
			sandbox,
			signal,
			skipFailedPages: options?.skipFailedPages ?? false,
			autoSize: options?.autoSize ?? false,
			onResourceError: options?.onResourceLoadError,
			onProgress: options?.onProgress,
			fontResolver: options?.fontResolver,
			fontMissPolicy: options?.fontMissPolicy,
			outputPolicy: options?.outputPolicy,
			destination: options?.destination,
			mediaPolicy: options?.mediaPolicy,
			imagePolicy: options?.imagePolicy,
			stagingPolicy: options?.stagingPolicy,
			compression: options?.compression,
			pipeline: runtime.pipeline,
		})
		runnerOwnsDestination = true
		const summary = await runnerPromise
		// Once the runner resolves, finalize has closed the destination. A cancel
		// racing with this continuation must not turn a completed file into failure.
		options?.onProgress?.({
			phase: "completed",
			pageCount: summary.pageCount,
			bytesWritten: summary.bytesWritten,
		})
		return summary
	} catch (error) {
		if (!runnerOwnsDestination) {
			await abortUnclaimedPptxDestination(options?.destination, error)
		}
		throw error
	} finally {
		sandbox?.destroy()
		if (options?.logLevel || options?.logger) resetLogger()
	}
}

/** Abort a selected destination if setup fails before the streaming runner takes ownership. */
async function abortUnclaimedPptxDestination(
	destination: PptxDestination | undefined,
	reason: unknown,
): Promise<void> {
	if (!destination) return
	try {
		const wrapped = destination as {
			kind?: string
			writable?: { abort?: (reason?: unknown) => void | Promise<void>; destroy?: unknown }
			sink?: { abort?: (reason?: unknown) => void | Promise<void> }
			abort?: (reason?: unknown) => void | Promise<void>
			destroy?: (error?: Error) => void
		}
		if (wrapped.kind === "sink-proxy") {
			await wrapped.sink?.abort?.(reason)
			return
		}
		if (wrapped.kind === "writable-stream" || wrapped.kind === "transferable-stream") {
			await wrapped.writable?.abort?.(reason)
			return
		}
		if (wrapped.kind === "node-writable") {
			const destroy = wrapped.writable?.destroy
			if (typeof destroy === "function") {
				destroy.call(
					wrapped.writable,
					reason instanceof Error
						? reason
						: new Error(String(reason ?? "Export aborted")),
				)
			}
			return
		}
		if (typeof wrapped.abort === "function") {
			await wrapped.abort(reason)
			return
		}
		wrapped.destroy?.(
			reason instanceof Error ? reason : new Error(String(reason ?? "Export aborted")),
		)
	} catch {
		// Preserve the setup error that prevented the runner from taking ownership.
	}
}

function getKnownStreamingPageCount(content: StreamingExportContent): number | undefined {
	if (typeof content === "string") return 1
	if (Array.isArray(content)) return content.length
	return undefined
}

/** Normalize compatibility inputs lazily so the runtime owns at most one prepared page at a time. */
async function* iterateStreamingHtmlPages(
	content: StreamingExportContent,
	signal: AbortSignal,
): AsyncIterable<StreamingHtmlPage> {
	if (typeof content === "string") {
		throwIfStreamingAborted(signal)
		yield { index: 0, html: content }
		return
	}

	let sourceIndex = 0
	for await (const page of content) {
		throwIfStreamingAborted(signal)
		if (typeof page === "string") {
			yield { index: sourceIndex, html: page }
		} else if (page && typeof page.html === "string") {
			yield page
		} else {
			throw new TypeError(
				"[exportPPTXStreaming] Each page must be an HTML string or { index, html } object",
			)
		}
		sourceIndex += 1
	}
	throwIfStreamingAborted(signal)
}

function throwIfStreamingAborted(signal: AbortSignal): void {
	if (signal.aborted) throw createAbortError()
}

async function runExportPipeline(
	content: string | string[],
	options: ExportOptions | undefined,
	signal: AbortSignal,
	runtime: Html2PptxRuntime,
	collectOutput: boolean,
): Promise<GeneratedPPTX | void> {
	configureLogger({
		minLevel: options?.logLevel,
		logger: options?.logger,
	})

	const config = { ...DEFAULT_CONFIG, ...options?.config }
	const fileName = options?.fileName ?? "export.pptx"
	const htmlSlides = Array.isArray(content) ? content : [content]

	const sandbox = runtime.createSandbox
		? runtime.createSandbox(config)
		: new HtmlRenderSandbox(config, {
				ReadyController: runtime.sandboxReadyController,
			})
	try {
		return await runExport({
			config,
			fileName,
			htmlSlides,
			sandbox,
			skipFailedPages: options?.skipFailedPages ?? false,
			autoSize: options?.autoSize ?? false,
			onSlideProgress: options?.onSlideProgress,
			onResourceError: options?.onResourceLoadError,
			fontResolver: options?.fontResolver,
			fontMissPolicy: options?.fontMissPolicy,
			collectOutput,
			signal,
			runtime: runtime.pipeline,
		})
	} finally {
		sandbox.destroy()
		if (options?.logLevel || options?.logger) resetLogger()
	}
}

export type {
	SlideConfig,
	ExportOptions,
	ExportPageContext,
	ExportHandle,
	GeneratedPPTX,
	GenerateHandle,
	ResourceLoadError,
	ExportPhase,
	ExportPreflightResult,
	ExportProgress,
	ExportSummary,
	ExportExecutionInfo,
	ExportFailureCode,
	ExportFailureDiagnostic,
	ExportFailurePhase,
	ByteCount,
	CapacityConfidence,
	LargeExportHandle,
	LargeExportOptions,
	LargeExportOutputPolicy,
	MediaPolicy,
	PptxDestination,
	PptxOutputSink,
	PreflightIssue,
	StagingPolicy,
	StreamingExportContent,
	StreamingExportHandle,
	StreamingHtmlPage,
	StreamingHtmlPageInput,
	ZipMode,
} from "./api/options"
export type {
	ImagePolicy,
	ImagePreflightAction,
	ImagePreflightDecision,
	ImagePreflightPolicy,
	ImagePreflightReason,
	ImagePreflightRejectAction,
	ImageTransformDescriptor,
	ImageTransformDescriptorInput,
	ImageTransformDescriptorResult,
} from "./media/image-preflight"
export { imagePolicyRequiresReplay, preflightPptImage } from "./media/image-preflight"
export { preflightPptxExport, type PreflightOptions } from "./api/preflight"
export {
	resolveStreamingMediaPolicyMode,
	type ResolveMediaPolicyModeOptions,
	type ResolvedMediaPolicyMode,
} from "./api/strategy"
export type { EmbedFontInput, FontMissPolicy, FontResolver, UsedFont } from "./api/font"
export { DEFAULT_CONFIG } from "./shared/unit"
export {
	ExportFidelityError,
	isExportFidelityError,
	PptxExportError,
	isPptxExportError,
	getPptxExportDiagnostic,
	normalizePptxExportError,
} from "./errors"
export type { ExportFidelityFailureKind, PptxExportErrorContext } from "./errors"
export { LogLevel } from "./logger"
export type { ExternalLogger } from "./logger"
export {
	captureVideoFirstFrameDataUrl,
	type CaptureVideoFirstFrameOptions,
} from "./materialize/video-first-frame"
