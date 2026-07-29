import type { GeneratedPPTX, SlideConfig, ExportPageContext } from "../api/options"
import type { ResourceLoadError } from "../api/options"
import type { EmbedFontInput, FontMissPolicy, FontResolver, UsedFont } from "../api/font"
import type { SerializablePPTNode } from "../ir/serialize"
import { serializePptNodes } from "../ir/serialize"
import type { SandboxInstance } from "../sandbox/htmlRenderSandbox"
import { log, LogLevel } from "../logger"
import { createAbortError } from "../sandbox/abort"
import { MAX_PPT_PAGE_PX } from "../shared/unit"
import { DEFAULT_DPI } from "../shared/constants"
import { ensureNotAborted } from "./abort-guard"
import { packagePresentationInWorker } from "../packaging/package-presentation"
import { createIncrementalPresentationPackager } from "../packaging/incremental-package-presentation"
import type { IncrementalPresentationPackager } from "../packaging/incremental-types"
import { ensureFileName } from "../packaging/pptx-document"
import { prepareSlideNodes } from "./render-slide"
import { sliceByPageHeight } from "./slice-nodes"
import { detectFontsFromNodes } from "../font/detectFontsFromNodes"
import type { ExportPipelineRuntime } from "../runtime"
import { DEFAULT_TEXT_MERGE_MODE } from "./text-merge-mode"
import { isExportFidelityError } from "../errors"

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

const INCREMENTAL_SLIDE_BATCH_SIZE = 8
const MAX_IN_FLIGHT_APPEND_BATCHES = 2

type AppendOutcome = { ok: true } | { ok: false; error: Error }

interface TrackedAppend {
	batchIndex: number
	outcome: Promise<AppendOutcome>
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
	let incrementalPackager: IncrementalPresentationPackager | null = null
	const canUseIncrementalPackager =
		!runtime?.packagePresentationInWorker || Boolean(runtime.createIncrementalPresentationPackager)
	if (canUseIncrementalPackager) {
		try {
			const createPackager =
				runtime?.createIncrementalPresentationPackager ?? createIncrementalPresentationPackager
			incrementalPackager = createPackager({
				initialConfig: config,
				allowLayoutChange: autoSize,
				fileName,
				signal,
				onResourceError,
				download: !collectOutput,
			})
		} catch (error) {
			log(LogLevel.L3, "增量打包 Worker 创建失败，回退到传统流程", {
				error: String(error),
			})
		}
	}
	if (incrementalPackager) {
		return runIncrementalExport({
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
			packager: incrementalPackager,
			activePrepareSlideNodes,
			activeDetectFontsFromNodes,
		})
	}
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
			if (isExportFidelityError(error) || !skipFailedPages) throw error
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

async function runIncrementalExport({
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
	packager,
	activePrepareSlideNodes,
	activeDetectFontsFromNodes,
}: Omit<ExportTaskInput, "collectOutput"> & {
	packager: IncrementalPresentationPackager
	activePrepareSlideNodes: typeof prepareSlideNodes
	activeDetectFontsFromNodes: typeof detectFontsFromNodes
}): Promise<GeneratedPPTX | void> {
	const textMergeMode = DEFAULT_TEXT_MERGE_MODE
	const usedFonts = new Map<string, Set<string>>()
	const pipelineAbortController = new AbortController()
	const pipelineSignal = pipelineAbortController.signal
	const forwardExternalAbort = () => pipelineAbortController.abort(signal.reason)
	if (signal.aborted) forwardExternalAbort()
	else signal.addEventListener("abort", forwardExternalAbort, { once: true })
	let pendingSlides: SerializablePPTNode[][] = []
	let pendingBackgrounds: (string | null)[] = []
	const inFlightAppends: TrackedAppend[] = []
	let measuredMaxWidth = config.htmlWidth
	let successCount = 0
	let outputSlideCount = 0
	let nextBatchIndex = 0
	let firstAppendError: Error | null = null
	let pipelineClosing = false
	let completedNormally = false

	const recordAppendError = (error: unknown): Error => {
		const appendError = toError(error)
		if (!pipelineClosing && !firstAppendError) {
			firstAppendError = appendError
			// Stop an in-progress page as soon as the packaging Worker becomes unusable.
			if (!pipelineSignal.aborted) pipelineAbortController.abort(appendError)
		}
		return appendError
	}

	const ensurePipelineActive = () => {
		if (firstAppendError) throw firstAppendError
		ensureNotAborted(pipelineSignal)
	}

	const enqueuePendingSlides = () => {
		if (pendingSlides.length === 0) return
		const batch = {
			slides: pendingSlides,
			slideBackgrounds: pendingBackgrounds,
		}
		pendingSlides = []
		pendingBackgrounds = []

		const batchIndex = nextBatchIndex++
		let outcome: Promise<AppendOutcome>
		try {
			const appendPromise = packager.appendSlides(batch, batchIndex)
			// Install both handlers immediately: two append requests may be pending, but
			// neither rejection may become an unhandled promise while rendering continues.
			outcome = appendPromise.then<AppendOutcome, AppendOutcome>(
				() => ({ ok: true }),
				(error) => ({ ok: false, error: recordAppendError(error) }),
			)
		} catch (error) {
			const appendError = recordAppendError(error)
			outcome = Promise.resolve({ ok: false, error: appendError })
		}
		inFlightAppends.push({ batchIndex, outcome })
	}

	const settleOldestAppend = async () => {
		const oldest = inFlightAppends[0]
		if (!oldest) return
		const outcome = await oldest.outcome
		inFlightAppends.shift()
		if (!outcome.ok) throw firstAppendError ?? outcome.error
		if (firstAppendError) throw firstAppendError
	}

	const waitForAppendCapacity = async () => {
		// A two-batch window lets the Worker package A while the renderer builds B,
		// while preventing a 200-page export from accumulating unbounded slide data.
		while (inFlightAppends.length >= MAX_IN_FLIGHT_APPEND_BATCHES) {
			await settleOldestAppend()
		}
		ensurePipelineActive()
	}

	const drainAppends = async () => {
		while (inFlightAppends.length > 0) await settleOldestAppend()
		ensurePipelineActive()
	}

	log(LogLevel.L2, "开始导出", {
		slideCount: htmlSlides.length,
		fileName,
		packagingMode: "incremental-worker",
		autoSize,
		batchSize: INCREMENTAL_SLIDE_BATCH_SIZE,
	})

	try {
		for (let index = 0; index < htmlSlides.length; index++) {
			// Do not start rendering the first page of a third logical batch until the
			// oldest Worker append has acknowledged and released its retained buffers.
			if (pendingSlides.length === 0) await waitForAppendCapacity()
			ensurePipelineActive()
			const html = htmlSlides[index]
			onSlideProgress?.({
				index,
				total: htmlSlides.length,
				html,
				fileName: ensureFileName(fileName),
				config,
			})
			log(LogLevel.L2, `处理第 ${index + 1}/${htmlSlides.length} 页`)

			let preparedOutputPages: SerializablePPTNode[][] | null = null
			let preparedBodyBackground: string | null = null
			try {
				const { pptNodes, totalWidth, totalHeight, bodyBackground } =
					await activePrepareSlideNodes({
						config,
						html,
						sandbox,
						signal: pipelineSignal,
						onResourceError,
						textMergeMode,
						runtime,
					})
				ensurePipelineActive()
				if (autoSize) assertWithinPptWidthLimit(totalWidth, index)
				measuredMaxWidth = Math.max(measuredMaxWidth, totalWidth)

				const serializedNodes = serializePptNodes(pptNodes)
				const outputPages = autoSize
					? sliceByPageHeight({
							nodes: serializedNodes,
							pageHeightInch: config.slideHeight,
							totalHeightInch: totalHeight / DEFAULT_DPI,
						})
					: [serializedNodes]

				mergeUsedFonts(usedFonts, activeDetectFontsFromNodes(outputPages))
				preparedOutputPages = prepareOutputPagesForIncrementalBatches({
					pages: outputPages,
					pendingSlides,
					batchSize: INCREMENTAL_SLIDE_BATCH_SIZE,
				})
				preparedBodyBackground = bodyBackground
				successCount += 1
				log(LogLevel.L2, `第 ${index + 1} 页处理完成`, {
					totalWidth,
					totalHeight,
					outputPages: outputPages.length,
				})
			} catch (error) {
				// Worker failure is terminal even when page failures are configured to be
				// skipped, and it must not be hidden by the AbortError used to stop capture.
				if (firstAppendError) throw firstAppendError
				if (pipelineSignal.aborted) throw createAbortError()
				log(LogLevel.L4, `第 ${index + 1} 页导出失败`, { error: String(error) })
				if (isExportFidelityError(error) || !skipFailedPages) throw error
			}

			for (const page of preparedOutputPages ?? []) {
				if (pendingSlides.length === 0) await waitForAppendCapacity()
				pendingSlides.push(page)
				pendingBackgrounds.push(preparedBodyBackground)
				outputSlideCount += 1
				if (pendingSlides.length >= INCREMENTAL_SLIDE_BATCH_SIZE) {
					enqueuePendingSlides()
				}
			}
		}

		if (successCount === 0) throw new Error("[exportPPTX] 所有页面导出失败")
		enqueuePendingSlides()
		await drainAppends()

		const finalConfig = autoSize
			? buildFinalConfigFromMaxWidth(config, measuredMaxWidth)
			: config
		const embedFonts = fontResolver
			? await resolveDetectedFonts(
					mapUsedFonts(usedFonts),
					fontResolver,
					fontMissPolicy,
				)
			: []
		ensurePipelineActive()

		const output = await packager.finalize({ config: finalConfig, embedFonts })
		log(LogLevel.L2, "导出完成", {
			fileName,
			successCount,
			inputSlides: htmlSlides.length,
			outputSlides: outputSlideCount,
			slideWidth: finalConfig.slideWidth,
			slideHeight: finalConfig.slideHeight,
		})
		completedNormally = true
		return output
	} finally {
		pipelineClosing = true
		signal.removeEventListener("abort", forwardExternalAbort)
		if (!pipelineSignal.aborted) pipelineAbortController.abort()
		let disposeError: Error | null = null
		try {
			packager.dispose()
		} catch (error) {
			disposeError = toError(error)
		}
		// dispose() must reject any pending requests. Waiting for the already-handled
		// outcomes prevents append work from leaking beyond this export invocation.
		await Promise.all(inFlightAppends.map(({ outcome }) => outcome))
		if (firstAppendError) throw firstAppendError
		if (completedNormally && disposeError) throw disposeError
	}
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

async function resolveDetectedFonts(
	usedFonts: UsedFont[],
	fontResolver: FontResolver,
	missPolicy: FontMissPolicy = "fallback-with-warning",
): Promise<EmbedFontInput[]> {
	if (usedFonts.length === 0) return []
	log(LogLevel.L2, `[font] 检测到 ${usedFonts.length} 个字体族`)
	const resolvedFonts = await fontResolver(usedFonts, { missPolicy })
	return resolvedFonts ?? []
}

function mergeUsedFonts(target: Map<string, Set<string>>, fonts: UsedFont[]): void {
	for (const font of fonts) {
		let faceKeys = target.get(font.typeface)
		if (!faceKeys) {
			faceKeys = new Set<string>()
			target.set(font.typeface, faceKeys)
		}
		for (const faceKey of font.faceKeys) faceKeys.add(faceKey)
	}
}

function mapUsedFonts(fonts: Map<string, Set<string>>): UsedFont[] {
	return Array.from(fonts, ([typeface, faceKeys]) => ({
		typeface,
		faceKeys: Array.from(faceKeys).sort(),
	}))
}

/**
 * A node that crosses an auto-size page boundary may appear in several output pages while
 * sharing the same image/cover ArrayBuffer. Since transferring the first batch detaches that
 * buffer, every later batch must own a clone created before any batch is posted to the Worker.
 */
function prepareOutputPagesForIncrementalBatches({
	pages,
	pendingSlides,
	batchSize,
}: {
	pages: SerializablePPTNode[][]
	pendingSlides: SerializablePPTNode[][]
	batchSize: number
}): SerializablePPTNode[][] {
	const firstBatchByBuffer = new WeakMap<ArrayBuffer, number>()
	const clonesByBatch = new Map<number, WeakMap<ArrayBuffer, ArrayBuffer>>()

	for (const slide of pendingSlides) {
		for (const node of slide) {
			const buffer = getNodeMediaBuffer(node)
			if (buffer && !firstBatchByBuffer.has(buffer)) firstBatchByBuffer.set(buffer, 0)
		}
	}

	return pages.map((page, pageIndex) => {
		const batchIndex = Math.floor((pendingSlides.length + pageIndex) / batchSize)
		return page.map((node) => {
			const buffer = getNodeMediaBuffer(node)
			if (!buffer) return node

			const firstBatch = firstBatchByBuffer.get(buffer)
			if (firstBatch === undefined) {
				firstBatchByBuffer.set(buffer, batchIndex)
				return node
			}
			if (firstBatch === batchIndex) return node

			let batchClones = clonesByBatch.get(batchIndex)
			if (!batchClones) {
				batchClones = new WeakMap<ArrayBuffer, ArrayBuffer>()
				clonesByBatch.set(batchIndex, batchClones)
			}
			let clonedBuffer = batchClones.get(buffer)
			if (!clonedBuffer) {
				clonedBuffer = buffer.slice(0)
				batchClones.set(buffer, clonedBuffer)
			}

			if (node.type === "image" && node.srcBytes) {
				return {
					...node,
					srcBytes: { ...node.srcBytes, data: clonedBuffer },
				}
			}
			if (node.type === "media" && node.coverBytes) {
				return {
					...node,
					coverBytes: { ...node.coverBytes, data: clonedBuffer },
				}
			}
			return node
		})
	})
}

function getNodeMediaBuffer(node: SerializablePPTNode): ArrayBuffer | undefined {
	if (node.type === "image") return node.srcBytes?.data
	if (node.type === "media") return node.coverBytes?.data
	return undefined
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error))
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

function buildFinalConfigFromMaxWidth(
	baseConfig: SlideConfig,
	measuredMaxWidth: number,
): SlideConfig {
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
