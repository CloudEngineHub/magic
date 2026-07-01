import type { SlideConfig, ExportPageContext } from "../api/options"
import type { ResourceLoadError } from "../api/options"
import type { EmbedFontInput, FontMissPolicy, FontResolver } from "../api/font"
import type { SerializablePPTNode } from "../ir/serialize"
import { serializePptNodes } from "../ir/serialize"
import type { SandboxInstance } from "../sandbox/htmlRenderSandbox"
import { log, LogLevel } from "../logger"
import { createAbortError } from "../sandbox/abort"
import { MAX_PPT_PAGE_PX } from "../shared/unit"
import { DEFAULT_DPI } from "../shared/constants"
import { ensureNotAborted } from "./abort-guard"
import { packagePresentationInWorker } from "../packaging/package-presentation"
import { ensureFileName } from "../packaging/pptx-document"
import { prepareSlideNodes } from "./render-slide"
import { sliceByPageHeight } from "./slice-nodes"
import { detectFontsFromNodes } from "../font/detectFontsFromNodes"
import type { ExportPipelineRuntime } from "../runtime"

export interface ExportTaskInput {
	config: SlideConfig
	fileName: string
	htmlSlides: string[]
	sandbox: SandboxInstance
	skipFailedPages: boolean
	/** 任意尺寸模式（自适应宽度 + 自动分页），默认 false 走 PPT 固定尺寸模式 */
	autoSize: boolean
	onSlideProgress?: (context: ExportPageContext) => void
	onResourceError?: (error: ResourceLoadError) => void
	signal: AbortSignal
	fontResolver?: FontResolver
	fontMissPolicy?: FontMissPolicy
	runtime?: ExportPipelineRuntime
}

interface RenderedSlide {
	pptNodes: ReturnType<typeof serializePptNodes>
	totalWidthPx: number
	totalHeightPx: number
	bodyBackground: string | null
}

/**
 * 执行单文件多页导出：依次渲染每页 HTML 并写入同一个 PPTX。
 *
 * 两种模式：
 * - PPT 模式（`autoSize=false`，默认）：严格按 `config.slideWidth/slideHeight` 输出，
 *   超出内容由 PPT 页面边界裁切，不测量、不分页、不做宽度上限校验。
 * - 任意尺寸模式（`autoSize=true`）：按 HTML 真实尺寸自适应：
 *   - 真实高度超出 → 按 `slideHeight` 切片为多页
 *   - 真实宽度超出 → 自动扩展 `slideWidth`，所有页共享一个最大宽度 layout
 *   - 任一页宽度 > 5376px（PPT 56 英寸上限）则直接 throw
 */
export async function runExport({
	config,
	fileName,
	htmlSlides,
	sandbox,
	skipFailedPages,
	autoSize,
	onSlideProgress,
	onResourceError,
	signal,
	fontResolver,
	fontMissPolicy,
	runtime,
}: ExportTaskInput): Promise<void> {
	const activePrepareSlideNodes = runtime?.prepareSlideNodes ?? prepareSlideNodes
	const activePackagePresentationInWorker =
		runtime?.packagePresentationInWorker ?? packagePresentationInWorker
	const activeDetectFontsFromNodes = runtime?.detectFontsFromNodes ?? detectFontsFromNodes
	const renderedSlides: RenderedSlide[] = []
	let successCount = 0

	log(LogLevel.L2, "开始导出", {
		slideCount: htmlSlides.length,
		fileName,
		packagingMode: "worker",
		autoSize,
	})

	for (let i = 0; i < htmlSlides.length; i++) {
		ensureNotAborted(signal)
		const html = htmlSlides[i]
		const pageFileName = ensureFileName(fileName)
		onSlideProgress?.({
			index: i,
			total: htmlSlides.length,
			html,
			fileName: pageFileName,
			config,
		})
		log(LogLevel.L2, `处理第 ${i + 1}/${htmlSlides.length} 页`)

		try {
			const { pptNodes, totalWidth, totalHeight, bodyBackground } = await activePrepareSlideNodes({
				config,
				html,
				sandbox,
				signal,
				onResourceError,
				runtime,
			})
			if (autoSize) assertWithinPptWidthLimit(totalWidth, i)
			renderedSlides.push({
				pptNodes: serializePptNodes(pptNodes),
				totalWidthPx: totalWidth,
				totalHeightPx: totalHeight,
				bodyBackground,
			})
			ensureNotAborted(signal)
			successCount += 1
			log(LogLevel.L2, `第 ${i + 1} 页处理完成`, { totalWidth, totalHeight })
		} catch (error) {
			if (signal.aborted) throw createAbortError()
			log(LogLevel.L4, `第 ${i + 1} 页导出失败`, { error: String(error) })
			if (!skipFailedPages) throw error
		}
	}

	if (successCount === 0) throw new Error("[exportPPTX] 所有页面导出失败")

	const finalConfig = buildFinalConfig({ baseConfig: config, renderedSlides, autoSize })
	const { slides: preparedSlides, slideBackgrounds } = expandSlidesByPagination({
		renderedSlides,
		finalConfig,
		autoSize,
	})

	log(LogLevel.L2, "分页完成", {
		inputSlides: renderedSlides.length,
		outputSlides: preparedSlides.length,
		slideWidth: finalConfig.slideWidth,
		slideHeight: finalConfig.slideHeight,
	})

	ensureNotAborted(signal)

	const embedFonts = fontResolver
		? await resolveFontsWithResolver(
				preparedSlides,
				fontResolver,
				fontMissPolicy,
				activeDetectFontsFromNodes,
			)
		: []
	ensureNotAborted(signal)

	await activePackagePresentationInWorker({
		config: finalConfig,
		fileName: ensureFileName(fileName),
		slides: preparedSlides,
		slideBackgrounds,
		embedFonts,
		signal,
	})
	log(LogLevel.L2, "导出完成", {
		fileName,
		successCount,
		inputSlides: htmlSlides.length,
		outputSlides: preparedSlides.length,
	})
}

async function resolveFontsWithResolver(
	slides: SerializablePPTNode[][],
	fontResolver: FontResolver,
	missPolicy: FontMissPolicy = "fallback-with-warning",
	detectFonts: (slides: SerializablePPTNode[][]) => ReturnType<typeof detectFontsFromNodes>,
): Promise<EmbedFontInput[]> {
	const usedFonts = detectFonts(slides)
	if (usedFonts.length === 0) return []

	log(LogLevel.L2, `[font] 检测到 ${usedFonts.length} 个字体族`)
	const resolvedFonts = await fontResolver(usedFonts, { missPolicy })
	return resolvedFonts ?? []
}

/**
 * 单页宽度超过 PPT 56 英寸硬上限时直接报错。
 * 缩放降级会破坏"1:1 还原"的承诺，所以选择显式失败。
 */
function assertWithinPptWidthLimit(widthPx: number, slideIndex: number): void {
	if (widthPx > MAX_PPT_PAGE_PX) {
		throw new Error(
			`[exportPPTX] 第 ${slideIndex + 1} 页宽度 ${widthPx}px 超出 PowerPoint 单页最大 ${MAX_PPT_PAGE_PX}px (56 英寸)，请缩窄 HTML 设计稿。`,
		)
	}
}

/**
 * 构建最终统一的 PPT layout 配置：
 * - 任意尺寸模式：slideWidth/htmlWidth 取所有页中的最大测量宽度
 * - PPT 模式：原样返回 baseConfig，严格遵循调用方传入的固定尺寸
 */
function buildFinalConfig({
	baseConfig,
	renderedSlides,
	autoSize,
}: {
	baseConfig: SlideConfig
	renderedSlides: RenderedSlide[]
	autoSize: boolean
}): SlideConfig {
	if (!autoSize) return baseConfig
	const measuredMaxWidth = renderedSlides.reduce(
		(max, slide) => Math.max(max, slide.totalWidthPx),
		0,
	)
	const finalWidthPx = Math.max(measuredMaxWidth, baseConfig.htmlWidth)
	return {
		htmlWidth: finalWidthPx,
		htmlHeight: baseConfig.htmlHeight,
		slideWidth: finalWidthPx / DEFAULT_DPI,
		slideHeight: baseConfig.slideHeight,
	}
}

/**
 * 任意尺寸模式：把每个输入 HTML 的节点按 slideHeight 切片为若干 PPT 页；
 * PPT 模式：原样输出，每个 HTML 对应单页 PPT，超出部分由页面边界裁切。
 */
function expandSlidesByPagination({
	renderedSlides,
	finalConfig,
	autoSize,
}: {
	renderedSlides: RenderedSlide[]
	finalConfig: SlideConfig
	autoSize: boolean
}): { slides: SerializablePPTNode[][]; slideBackgrounds: (string | null)[] } {
	const result: SerializablePPTNode[][] = []
	const backgrounds: (string | null)[] = []
	for (const slide of renderedSlides) {
		if (!autoSize) {
			result.push(slide.pptNodes)
			backgrounds.push(slide.bodyBackground)
			continue
		}
		const pages = sliceByPageHeight({
			nodes: slide.pptNodes,
			pageHeightInch: finalConfig.slideHeight,
			totalHeightInch: slide.totalHeightPx / DEFAULT_DPI,
		})
		for (const page of pages) {
			result.push(page)
			backgrounds.push(slide.bodyBackground)
		}
	}
	return { slides: result, slideBackgrounds: backgrounds }
}
