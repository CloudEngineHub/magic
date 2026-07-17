import type { ExportOptions, ExportHandle } from "./api/options"
import { configureLogger, resetLogger } from "./logger"
import { HtmlRenderSandbox } from "./sandbox"
import { DEFAULT_CONFIG } from "./shared/unit"
import { runExport } from "./pipeline/export-slides"
import type { Html2PptxRuntime } from "./runtime"

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
 * const exportB = exportPPTX(htmlB, { fileName: 'b.pptx' })
 * exportA.cancel()
 * await exportB.promise
 * ```
 */
export function createPptxExporter(runtime: Html2PptxRuntime = {}) {
	return function exportPPTX(content: string | string[], options?: ExportOptions): ExportHandle {
		const controller = new AbortController()
		const promise = runExportPipeline(content, options, controller.signal, runtime)
		return { promise, cancel: () => controller.abort() }
	}
}

export const exportPPTX = createPptxExporter()

async function runExportPipeline(
	content: string | string[],
	options: ExportOptions | undefined,
	signal: AbortSignal,
	runtime: Html2PptxRuntime,
): Promise<void> {
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
		await runExport({
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
			signal,
			runtime: runtime.pipeline,
		})
	} catch (error) {
		throw error
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
	ResourceLoadError,
} from "./api/options"
export type {
	EmbedFontInput,
	FontMissPolicy,
	FontResolver,
	UsedFont,
} from "./api/font"
export { DEFAULT_CONFIG } from "./shared/unit"
export { LogLevel } from "./logger"
export type { ExternalLogger } from "./logger"
export {
	captureVideoFirstFrameDataUrl,
	type CaptureVideoFirstFrameOptions,
} from "./materialize/video-first-frame"
