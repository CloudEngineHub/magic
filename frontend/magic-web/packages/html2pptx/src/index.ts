import type { ExportOptions, ExportHandle, GeneratedPPTX, GenerateHandle } from "./api/options"
import { configureLogger, resetLogger } from "./logger"
import { HtmlRenderSandbox } from "./sandbox"
import { DEFAULT_CONFIG } from "./shared/unit"
import { runExport } from "./pipeline/export-slides"
import type { Html2PptxRuntime } from "./runtime"

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
} from "./api/options"
export type {
	EmbedFontInput,
	FontMissPolicy,
	FontResolver,
	UsedFont,
} from "./api/font"
export { DEFAULT_CONFIG } from "./shared/unit"
export { ExportFidelityError, isExportFidelityError } from "./errors"
export type { ExportFidelityFailureKind } from "./errors"
export { LogLevel } from "./logger"
export type { ExternalLogger } from "./logger"
export {
	captureVideoFirstFrameDataUrl,
	type CaptureVideoFirstFrameOptions,
} from "./materialize/video-first-frame"
