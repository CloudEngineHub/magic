import type { ExportOptions, ExportHandle } from "./api/options"
import { configureLogger, resetLogger } from "./logger"
import { HtmlRenderSandbox } from "./sandbox"
import { DEFAULT_CONFIG } from "./shared/unit"
import { runExport } from "./pipeline/export-slides"
import type { Html2PptxRuntime } from "./runtime"

/**
 * 导出 HTML 为 PPTX 文件
 *
 * 支持并发：每次调用返回独立的 { promise, cancel }，互不干扰。
 *
 * @param content - HTML 内容字符串，或多页 HTML 数组
 * @param options - 导出选项
 * @returns ExportHandle — promise 等待完成，cancel() 取消本次导出
 *
 * @example
 * ```ts
 * // 基础用法
 * const { promise } = exportPPTX('<div class="slide">...</div>')
 * await promise
 *
 * // 接入 console
 * exportPPTX(html, { logger: console })
 *
 * // 只收 warn 以上
 * exportPPTX(html, { logger: console, logLevel: "warn" })
 *
 * // 并发导出，各自独立取消
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
