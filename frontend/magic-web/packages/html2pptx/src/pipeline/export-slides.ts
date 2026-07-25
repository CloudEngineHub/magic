import type { GeneratedPPTX, SlideConfig, ExportPageContext } from "../api/options"
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
import { DEFAULT_TEXT_MERGE_MODE } from "./text-merge-mode"

export interface ExportTaskInput {
	config: SlideConfig
	fileName: string
	htmlSlides: string[]
	sandbox: SandboxInstance
	skipFailedPages: boolean
	/** Auto-size mode (adaptive width + automatic pagination); default false uses fixed-size PPT mode */
	autoSize: boolean
	onSlideProgress?: (context: ExportPageContext) => void
	onResourceError?: (error: ResourceLoadError) => void
	signal: AbortSignal
	fontResolver?: FontResolver
	fontMissPolicy?: FontMissPolicy
	/** Return the generated file instead of downloading it inside the packager. */
	collectOutput?: boolean
	runtime?: ExportPipelineRuntime
}

interface RenderedSlide {
	pptNodes: ReturnType<typeof serializePptNodes>
	totalWidthPx: number
	totalHeightPx: number
	bodyBackground: string | null
}

/**
 * Run a single-file multi-page export: render each HTML page in sequence and write it into one PPTX.
 *
 * Two modes:
 * - PPT mode (`autoSize=false`, default): output strictly using `config.slideWidth/slideHeight`,
 *   overflowing content is clipped by PPT page bounds; no measuring, pagination, or width-limit checks are performed.
 * - Auto-size mode (`autoSize=true`): adapt to the actual HTML dimensions:
 *   - Actual height overflow -> split into multiple pages by `slideHeight`
 *   - Actual width overflow -> expand `slideWidth`; all pages share the maximum-width layout
 *   - Throw directly if any page width exceeds 5376px, the PPT 56-inch limit
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
	collectOutput = false,
	runtime,
}: ExportTaskInput): Promise<GeneratedPPTX | void> {
	const textMergeMode = DEFAULT_TEXT_MERGE_MODE
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
				textMergeMode,
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

	const output = await activePackagePresentationInWorker({
		config: finalConfig,
		fileName: ensureFileName(fileName),
		slides: preparedSlides,
		slideBackgrounds,
		embedFonts,
		signal,
		onResourceError,
		...(collectOutput ? { download: false } : {}),
	})
	log(LogLevel.L2, "导出完成", {
		fileName,
		successCount,
		inputSlides: htmlSlides.length,
		outputSlides: preparedSlides.length,
	})
	return output
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
 * Fail immediately when a single page exceeds PPT's hard 56-inch width limit.
 * Scale-down fallback would break the 1:1 fidelity promise, so this fails explicitly.
 */
function assertWithinPptWidthLimit(widthPx: number, slideIndex: number): void {
	if (widthPx > MAX_PPT_PAGE_PX) {
		throw new Error(
			`[exportPPTX] 第 ${slideIndex + 1} 页宽度 ${widthPx}px 超出 PowerPoint 单页最大 ${MAX_PPT_PAGE_PX}px (56 英寸)，请缩窄 HTML 设计稿。`,
		)
	}
}

/**
 * Build the final unified PPT layout configuration:
 * - Auto-size mode: slideWidth/htmlWidth use the maximum measured width across all pages
 * - PPT mode: return baseConfig unchanged and strictly follow the caller-provided fixed size
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
 * Auto-size mode: split each input HTML's nodes into PPT pages by slideHeight;
 * PPT mode: output as-is, one PPT page per HTML input, with overflow clipped by page bounds.
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
