import type { EmbedFontInput, UsedFont } from "../api/font"
import { preflightPptxExport } from "../api/preflight"
import type {
	ExportFailurePhase,
	ExportProgress,
	ExportSummary,
	MediaPolicy,
	PptxDestination,
	SlideConfig,
	StagingPolicy,
	StreamingHtmlPage,
} from "../api/options"
import { resolveStreamingMediaPolicyMode } from "../api/strategy"
import type { StreamingExportTaskInput } from "../index"
import type { PPTNode } from "../ir/node"
import { serializePptNodes, type SerializablePPTNode } from "../ir/serialize"
import {
	withMediaSourceKey,
	type MediaSourceDescriptor,
} from "../media/source-descriptor"
import { detectFontsFromNodes } from "../font/detectFontsFromNodes"
import {
	createStreamingPresentationPackager,
	type StreamingPresentationPackager,
	type StreamingPresentationPlan,
	type StreamingWorkerDestination,
} from "../packaging"
import { createPresentation, ensureFileName } from "../packaging/pptx-document"
import {
	ExportFidelityError,
	isExportFidelityError,
	isPptxExportError,
	PptxExportError,
	normalizePptxExportError,
	type PptxExportErrorContext,
} from "../errors"
import {
	preflightPptImage,
	imagePolicyRequiresReplay,
	type ImagePreflightDecision,
	type ImageTransformDescriptorResult,
} from "../media/image-preflight"
import {
	createAbortError,
	throwIfAborted as throwIfSandboxAborted,
	withAbort,
} from "../sandbox/abort"
import { log, LogLevel } from "../logger"
import { DEFAULT_DPI } from "../shared/constants"
import { MAX_PPT_PAGE_PX } from "../shared/unit"
import { prepareSlideNodes } from "./render-slide"
import { sliceByPageHeight } from "./slice-nodes"
import { DEFAULT_TEXT_MERGE_MODE } from "./text-merge-mode"
import type { StreamingStagingStore } from "../runtime"

interface StagedSlideRecord {
	key: string
	nodes: SerializablePPTNode[]
	background: string | null
}

interface StreamingPptxWithStaging {
	createOpfsStagingStore?: (options?: { sessionId?: string }) => StreamingStagingStore
}

interface ExportDiagnosticState {
	phase: ExportFailurePhase
	pageIndex?: number
	pageCount?: number
	bytesWritten?: number
}

/** Default Phase 4 HTML -> IR -> Packaging Worker streaming runner. */
export async function runStreamingExport(input: StreamingExportTaskInput): Promise<ExportSummary> {
	const startedAt = now()
	const requiresReplay =
		input.autoSize ||
		Boolean(input.fontResolver) ||
		input.stagingPolicy?.mode === "opfs" ||
		imagePolicyRequiresReplay(input.imagePolicy)
	const mediaPolicyMode = resolveStreamingMediaPolicyMode(input.mediaPolicy, {
		requiresReplay,
	})
	const requiresStaging =
		requiresReplay || mediaPolicyMode === "rolling-stage" || mediaPolicyMode === "full-stage"
	const diagnostic: ExportDiagnosticState = {
		phase: "preflight",
		pageCount: input.pageCount,
	}
	const trackedInput = createTrackedStreamingInput(input, diagnostic, mediaPolicyMode)
	const createPackager =
		input.pipeline?.createStreamingPresentationPackager ?? createStreamingPresentationPackager
	let errorContext: PptxExportErrorContext = {
		phase: "preflight",
		fileName: input.fileName,
		pageCount: input.pageCount,
		mediaPolicyMode,
		zipMode: "zip64",
	}
	try {
		const preflight = preflightPptxExport({
			destination: input.destination,
			outputPolicy: input.outputPolicy,
			pageCount: input.pageCount,
			requiresOpfs: requiresStaging,
			requiresSlidePlan: requiresStaging,
			mediaPolicy: trackedInput.mediaPolicy,
			stagingPolicy: input.stagingPolicy,
			hasInjectedPackager: Boolean(input.pipeline?.createStreamingPresentationPackager),
			hasInjectedStagingStore: Boolean(input.pipeline?.createStreamingStagingStore),
		})
		errorContext = {
			...errorContext,
			outputPolicy: preflight.outputPolicy,
			zipMode: preflight.zipMode,
		}
		if (!preflight.accepted) {
			const cause = new Error(
				`[exportPPTXStreaming] Preflight failed: ${preflight.errors.map((issue) => issue.message).join("; ")}`,
			)
			const error = normalizePptxExportError(cause, {
				...errorContext,
				code: "preflight-rejected",
				details: {
					issues: preflight.errors.map((issue) => ({
						code: issue.code,
						severity: issue.severity,
					})),
				},
			})
			await abortDestination(input.destination, error)
			throw error
		}
		if (!input.destination) throw new Error("[exportPPTXStreaming] A destination is required")

		diagnostic.phase = "worker"
		const summary = requiresStaging
			? await runStagedStreamingExport(trackedInput, createPackager, startedAt)
			: await runDirectStreamingExport(trackedInput, createPackager, startedAt)
		return {
			...summary,
			execution: {
				outputPolicy: preflight.outputPolicy,
				mediaPolicyMode,
				zipMode: preflight.zipMode,
				pipeline: requiresStaging ? "staged" : "direct",
			},
		}
	} catch (error) {
		throw normalizePptxExportError(error, {
			...errorContext,
			phase: diagnostic.phase,
			pageIndex: diagnostic.pageIndex,
			pageCount: diagnostic.pageCount,
			bytesWritten: diagnostic.bytesWritten,
			code: isExportFidelityError(error) ? "fidelity-failed" : undefined,
		})
	}
}

function createTrackedStreamingInput(
	input: StreamingExportTaskInput,
	diagnostic: ExportDiagnosticState,
	mediaPolicyMode: Exclude<NonNullable<MediaPolicy["mode"]>, "auto">,
): StreamingExportTaskInput {
	return {
		...input,
		pages: trackPageSource(input.pages, diagnostic),
		mediaPolicy: { ...input.mediaPolicy, mode: mediaPolicyMode },
		onProgress: (progress) => {
			trackExportProgress(diagnostic, progress)
			input.onProgress?.(progress)
		},
	}
}

async function* trackPageSource(
	pages: AsyncIterable<StreamingHtmlPage>,
	diagnostic: ExportDiagnosticState,
): AsyncIterable<StreamingHtmlPage> {
	const iterator = pages[Symbol.asyncIterator]()
	try {
		while (true) {
			diagnostic.phase = "source"
			const next = await iterator.next()
			if (next.done) return
			yield next.value
		}
	} finally {
		await iterator.return?.()
	}
}

function trackExportProgress(diagnostic: ExportDiagnosticState, progress: ExportProgress): void {
	diagnostic.phase = progress.phase
	if (progress.pageIndex !== undefined) diagnostic.pageIndex = progress.pageIndex
	if (progress.pageCount !== undefined) diagnostic.pageCount = progress.pageCount
	if (progress.bytesWritten !== undefined) diagnostic.bytesWritten = progress.bytesWritten
}

async function runDirectStreamingExport(
	input: StreamingExportTaskInput,
	createPackager: NonNullable<
		StreamingExportTaskInput["pipeline"]
	>["createStreamingPresentationPackager"],
	startedAt: number,
) {
	let packager: StreamingPresentationPackager | undefined
	let successCount = 0
	let outputSlideCount = 0

	try {
		packager = createPackagerOrThrow(createPackager, {
			config: input.config,
			plan: createCapacityOnlyPlan(input.pageCount),
			fileName: input.fileName,
			destination: normalizeWorkerDestination(input.destination as PptxDestination),
			compression: input.compression,
			signal: input.signal,
			workerUrl: input.workerUrl,
			onProgress: input.onProgress,
			onResourceError: input.onResourceError,
		})
		await packager.ready
		for await (const page of input.pages) {
			throwIfAborted(input.signal)
			input.onProgress?.({
				phase: "prepare-page",
				pageIndex: page.index,
				pageCount: input.pageCount,
			})
			try {
				const result = await prepareStreamingPage(input, page.html)
				const nodes = serializePptNodes(result.pptNodes)
				await normalizeNodeMediaSources(nodes)
				await applyImagePreflight(nodes, input)
				input.onProgress?.({
					phase: "render-page",
					pageIndex: page.index,
					pageCount: input.pageCount,
				})
				const outputPages = [nodes]
				for (let pageOffset = 0; pageOffset < outputPages.length; pageOffset += 1) {
					const outputNodes = outputPages[pageOffset]
					await packager.commitSlide({
						nodes: outputNodes,
						background: result.bodyBackground,
						options: { slideKey: createSlideKey(page.key, page.index, pageOffset) },
					})
					outputNodes.length = 0
					outputSlideCount += 1
					input.onProgress?.({
						phase: "package-page",
						pageIndex: page.index,
						pageCount: input.pageCount,
					})
				}
				successCount += 1
			} catch (error) {
				if (input.signal.aborted) throw createAbortError()
				if (
					isPptxExportError(error) ||
					isExportFidelityError(error) ||
					!input.skipFailedPages
				)
					throw error
			}
		}

		if (successCount === 0) throw new Error("[exportPPTXStreaming] All pages failed")
		input.onProgress?.({ phase: "finalize", pageCount: outputSlideCount })
		const summary = await packager.finalize()
		return {
			fileName: ensureFileName(input.fileName),
			pageCount: summary.slideCount,
			mediaPartCount: summary.mediaPartCount,
			bytesWritten: summary.bytesWritten,
			durationMs: now() - startedAt,
		}
	} catch (error) {
		if (packager) await packager.abort(error).catch(() => undefined)
		else await abortDestination(input.destination, error)
		throw error
	} finally {
		packager?.dispose()
	}
}

async function runStagedStreamingExport(
	input: StreamingExportTaskInput,
	createPackager: NonNullable<
		StreamingExportTaskInput["pipeline"]
	>["createStreamingPresentationPackager"],
	startedAt: number,
) {
	const sessionId = createSessionId()
	let store: StreamingStagingStore | undefined
	const usedFonts = new Map<string, Set<string>>()
	const stagedKeys: string[] = []
	const stagedMedia = new Map<string, MediaSourceDescriptor>()
	let measuredMaxWidth = input.config.htmlWidth
	let successfulSourcePages = 0
	let exportSucceeded = false
	let packager: StreamingPresentationPackager | undefined

	try {
		const activeStore = await runStagingOperation(input.signal, () =>
			createStagingStore(input, sessionId),
		)
		store = activeStore
		await runStagingOperation(input.signal, () =>
			activeStore.createSession(sessionId, { signal: input.signal }),
		)
		for await (const page of input.pages) {
			throwIfAborted(input.signal)
			input.onProgress?.({
				phase: "prepare-page",
				pageIndex: page.index,
				pageCount: input.pageCount,
			})
			try {
				const result = await prepareStreamingPage(input, page.html)
				if (input.autoSize && result.totalWidth > MAX_PPT_PAGE_PX) {
					throw new ExportFidelityError(
						`[exportPPTXStreaming] Page ${page.index + 1} width ${result.totalWidth}px exceeds PowerPoint's ${MAX_PPT_PAGE_PX}px limit.`,
						"page-size",
					)
				}
				measuredMaxWidth = Math.max(measuredMaxWidth, result.totalWidth)
				const serialized = serializePptNodes(result.pptNodes)
				await normalizeNodeMediaSources(serialized)
				await applyImagePreflight(serialized, input)
				const outputPages = input.autoSize
					? sliceByPageHeight({
							nodes: serialized,
							pageHeightInch: input.config.slideHeight,
							totalHeightInch: result.totalHeight / DEFAULT_DPI,
						})
					: [serialized]
				for (let pageOffset = 0; pageOffset < outputPages.length; pageOffset += 1) {
					const outputNodes = outputPages[pageOffset]
					input.onProgress?.({
						phase: "stage-media",
						pageIndex: page.index,
						pageCount: input.pageCount,
					})
					await stageNodeMediaSources(
						outputNodes,
						activeStore,
						input.signal,
						stagedMedia,
						input.mediaPolicy?.mode,
					)
					mergeUsedFonts(usedFonts, detectFontsFromNodes([outputNodes]))
					const key = createSlideKey(page.key, page.index, pageOffset)
					const stageIndex = stagedKeys.length + 1
					await runStagingOperation(input.signal, () =>
						activeStore.putSlideIr(
							stageIndex,
							{
								key,
								nodes: outputNodes,
								background: result.bodyBackground,
							} satisfies StagedSlideRecord,
							{ signal: input.signal },
						),
					)
					outputNodes.length = 0
					stagedKeys.push(key)
				}
				successfulSourcePages += 1
				input.onProgress?.({
					phase: "render-page",
					pageIndex: page.index,
					pageCount: input.pageCount,
				})
			} catch (error) {
				if (input.signal.aborted) throw createAbortError()
				if (
					isPptxExportError(error) ||
					isExportFidelityError(error) ||
					!input.skipFailedPages
				)
					throw error
			}
		}

		if (successfulSourcePages === 0 || stagedKeys.length === 0) {
			throw new Error("[exportPPTXStreaming] All pages failed")
		}
		const finalConfig = input.autoSize
			? buildFinalAutoSizeConfig(input.config, measuredMaxWidth)
			: input.config
		const embedFonts = await resolveFonts(input, usedFonts)
		const plan = createFrozenPlan(stagedKeys, stagedMedia)
		packager = createPackagerOrThrow(createPackager, {
			config: finalConfig,
			plan,
			fileName: input.fileName,
			embedFonts,
			destination: normalizeWorkerDestination(input.destination as PptxDestination),
			compression: input.compression,
			signal: input.signal,
			workerUrl: input.workerUrl,
			onProgress: input.onProgress,
			onResourceError: input.onResourceError,
		})
		await packager.ready

		for (let index = 1; index <= stagedKeys.length; index += 1) {
			throwIfAborted(input.signal)
			const record = await runStagingOperation(input.signal, () =>
				activeStore.getSlideIr<StagedSlideRecord>(index, { signal: input.signal }),
			)
			await packager.commitSlide({
				nodes: record.nodes,
				background: record.background,
				options: { slideKey: record.key },
			})
			record.nodes.length = 0
			const deleteSlideIr = activeStore.deleteSlideIr
			if (deleteSlideIr) {
				await runStagingOperation(input.signal, () =>
					deleteSlideIr.call(activeStore, index, { signal: input.signal }),
				)
			}
			input.onProgress?.({
				phase: "package-page",
				pageIndex: index - 1,
				pageCount: stagedKeys.length,
			})
		}

		input.onProgress?.({ phase: "finalize", pageCount: stagedKeys.length })
		const summary = await packager.finalize()
		const result = {
			fileName: ensureFileName(input.fileName),
			pageCount: summary.slideCount,
			mediaPartCount: summary.mediaPartCount,
			bytesWritten: summary.bytesWritten,
			durationMs: now() - startedAt,
		}
		exportSucceeded = true
		return result
	} catch (error) {
		if (packager) await packager.abort(error).catch(() => undefined)
		else await abortDestination(input.destination, error)
		throw error
	} finally {
		packager?.dispose()
		if (store && shouldCleanupStaging(input.stagingPolicy?.cleanup, exportSucceeded)) {
			await cleanupStagingSession(store, sessionId)
		}
	}
}

async function prepareStreamingPage(input: StreamingExportTaskInput, html: string) {
	const activePrepare = input.pipeline?.prepareSlideNodes ?? prepareSlideNodes
	return activePrepare({
		config: input.config,
		html,
		sandbox: input.sandbox,
		signal: input.signal,
		onResourceError: input.onResourceError,
		textMergeMode: DEFAULT_TEXT_MERGE_MODE,
		runtime: input.pipeline,
	})
}

/**
 * Decide whether an explicit image policy may require a second pass.
 *
 * A policy that only explicitly forwards every class of image remains on the direct path. Any
 * configured budget or action that can transform/reject an image is staged first, so a missing
 * transform hook or an error policy is reported before the packaging writer is created.
 */
/**
 * Apply the image policy after source normalization and before any media is staged or committed.
 * This path only inspects descriptor metadata and intrinsic DOM dimensions. In particular,
 * `passthrough` never calls Blob.arrayBuffer(), fetch(), or an image decoder.
 */
async function applyImagePreflight(
	nodes: SerializablePPTNode[],
	input: StreamingExportTaskInput,
): Promise<void> {
	const policy = input.imagePolicy
	if (!policy) return

	const transformImageDescriptor = input.pipeline?.transformImageDescriptor
	const kept: SerializablePPTNode[] = []
	for (const node of nodes) {
		if (node.type !== "image") {
			kept.push(node)
			continue
		}
		if (!node.source) throw new TypeError("Image node must provide a source descriptor")

		const decision = preflightPptImage(node, policy)
		if (decision.action === "passthrough") {
			kept.push(node)
			continue
		}

		if (decision.action === "reject") {
			if ((policy.rejectAction ?? "error") === "omit") continue
			throw createImagePreflightError(
				"preflight",
				"preflight-rejected",
				"Image rejected by imagePolicy",
				node,
				decision,
			)
		}

		if (!transformImageDescriptor) {
			throw createImagePreflightError(
				"transform-media",
				"media-transform-failed",
				"Image policy requires a transformImageDescriptor runtime hook",
				node,
				decision,
			)
		}

		let transformed: ImageTransformDescriptorResult
		try {
			transformed = await transformImageDescriptor({
				source: node.source,
				intrinsicSize: node.intrinsicSize,
				decision,
				assetKey: node.assetKey,
				sizing: node.sizing,
				signal: input.signal,
			})
		} catch (error) {
			throw normalizePptxExportError(error, {
				phase: "transform-media",
				code: "media-transform-failed",
				details: imageDecisionDetails(node.assetKey, decision),
			})
		}

		const result = unpackImageTransformResult(transformed)
		if (!result) {
			throw createImagePreflightError(
				"transform-media",
				"media-transform-failed",
				"transformImageDescriptor returned an invalid media descriptor",
				node,
				decision,
			)
		}
		node.source = withMediaSourceKey(result.source, node.assetKey)
		if (result.intrinsicSize) node.intrinsicSize = result.intrinsicSize
		kept.push(node)
	}

	if (kept.length !== nodes.length) {
		nodes.splice(0, nodes.length, ...kept)
	}
}

function unpackImageTransformResult(
	result: ImageTransformDescriptorResult,
):
	| { source: MediaSourceDescriptor; intrinsicSize?: { width: number; height: number } }
	| undefined {
	if (isMediaSourceDescriptor(result)) return { source: result }
	if (!result || typeof result !== "object" || !("source" in result)) return undefined
	const source = (result as { source?: unknown }).source
	if (!isMediaSourceDescriptor(source)) return undefined
	const intrinsicSize = (result as { intrinsicSize?: unknown }).intrinsicSize
	if (
		intrinsicSize !== undefined &&
		(!intrinsicSize ||
			typeof intrinsicSize !== "object" ||
			!Number.isFinite((intrinsicSize as { width?: unknown }).width) ||
			!Number.isFinite((intrinsicSize as { height?: unknown }).height))
	) {
		return undefined
	}
	return {
		source,
		...(intrinsicSize === undefined
			? {}
			: { intrinsicSize: intrinsicSize as { width: number; height: number } }),
	}
}

function isMediaSourceDescriptor(value: unknown): value is MediaSourceDescriptor {
	if (!value || typeof value !== "object") return false
	const source = value as { kind?: unknown; key?: unknown; contentType?: unknown; extn?: unknown }
	return (
		(source.kind === "opfs" ||
			source.kind === "blob" ||
			source.kind === "url" ||
			source.kind === "bytes" ||
			source.kind === "path") &&
		typeof source.key === "string" &&
		typeof source.contentType === "string" &&
		typeof source.extn === "string"
	)
}

function createImagePreflightError(
	phase: "preflight" | "transform-media",
	code: "preflight-rejected" | "media-transform-failed",
	message: string,
	node: SerializablePPTNode & { type: "image" },
	decision: ImagePreflightDecision,
): PptxExportError {
	return new PptxExportError({
		phase,
		code,
		message,
		recoverable: false,
		cancelled: false,
		details: imageDecisionDetails(node.assetKey, decision),
	})
}

function imageDecisionDetails(
	assetKey: string | undefined,
	decision: ImagePreflightDecision,
): Record<string, unknown> {
	return {
		assetKey,
		action: decision.action,
		reason: decision.reason,
		contentType: decision.contentType,
		...(decision.encodedBytes === undefined ? {} : { encodedBytes: decision.encodedBytes }),
		...(decision.width === undefined ? {} : { width: decision.width }),
		...(decision.height === undefined ? {} : { height: decision.height }),
		...(decision.pixelCount === undefined ? {} : { pixelCount: decision.pixelCount }),
	}
}

async function normalizeNodeMediaSources(nodes: SerializablePPTNode[]): Promise<void> {
	for (const node of nodes) {
		if (node.type === "image") {
			if (!node.source) throw new TypeError("Image node must provide a source descriptor")
			node.source = withMediaSourceKey(node.source, node.assetKey)
			continue
		}
		if (node.type !== "media" || node.mediaType === "online") continue
		if (!node.source) throw new TypeError(`${node.mediaType} node must provide a source descriptor`)
		node.source = withMediaSourceKey(node.source, node.assetKey)
		if (node.coverSource)
			node.coverSource = withMediaSourceKey(node.coverSource, node.coverAssetKey)
	}
}

async function stageNodeMediaSources(
	nodes: SerializablePPTNode[],
	store: StreamingStagingStore,
	signal: AbortSignal,
	stagedMedia: Map<string, MediaSourceDescriptor>,
	mediaMode: MediaPolicy["mode"],
): Promise<void> {
	for (const node of nodes) {
		if (node.type === "image" && node.source) {
			node.source = await stageDescriptor(node.source, store, signal, stagedMedia, mediaMode)
		}
		if (node.type === "media") {
			if (node.source) {
				node.source = await stageDescriptor(
					node.source,
					store,
					signal,
					stagedMedia,
					mediaMode,
				)
			}
			if (node.coverSource) {
				node.coverSource = await stageDescriptor(
					node.coverSource,
					store,
					signal,
					stagedMedia,
					mediaMode,
				)
			}
		}
	}
}

async function stageDescriptor(
	source: MediaSourceDescriptor,
	store: StreamingStagingStore,
	signal: AbortSignal,
	stagedMedia: Map<string, MediaSourceDescriptor>,
	mediaMode: MediaPolicy["mode"],
): Promise<MediaSourceDescriptor> {
	const existing = stagedMedia.get(source.key)
	if (existing) return existing
	if (source.kind === "opfs") {
		stagedMedia.set(source.key, source)
		return source
	}
	if (!shouldStageMediaSource(source, mediaMode)) {
		stagedMedia.set(source.key, source)
		return source
	}
	const staged = await runStagingOperation(signal, () =>
		store.stage(source, { signal, directory: "media" }),
	)
	stagedMedia.set(source.key, staged)
	return staged
}

/**
 * Run a staging operation with cancellation at the runner boundary.
 *
 * OPFS implementations receive the signal and can cancel their own I/O. The
 * additional race here is intentional: custom/native stores may not observe
 * AbortSignal, so a cancelled export must not wait forever for their promise
 * to settle. The original promise remains handled by `withAbort`, preventing a
 * late rejection from becoming an unhandled rejection.
 */
function runStagingOperation<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
	throwIfSandboxAborted(signal)
	const task = Promise.resolve().then(() => {
		throwIfSandboxAborted(signal)
		return operation()
	})
	return withAbort({ task, signal })
}

const STAGING_CLEANUP_ATTEMPTS = 2

/** Best-effort cleanup that never masks the export result/error. */
async function cleanupStagingSession(
	store: StreamingStagingStore,
	sessionId: string,
): Promise<void> {
	let lastError: unknown
	let failed = false
	for (let attempt = 1; attempt <= STAGING_CLEANUP_ATTEMPTS; attempt += 1) {
		try {
			await store.cleanupSession(sessionId)
			return
		} catch (error) {
			failed = true
			lastError = error
			// Give a rejected OPFS operation a microtask to release any transient
			// handle before the bounded retry. No unbounded backoff is used here.
			if (attempt < STAGING_CLEANUP_ATTEMPTS) await Promise.resolve()
		}
	}

	if (!failed) return
	try {
		log(LogLevel.L3, "Streaming staging cleanup failed", {
			sessionId,
			attempts: STAGING_CLEANUP_ATTEMPTS,
			error: lastError instanceof Error ? lastError.message : String(lastError),
		})
	} catch {
		// Logging must never replace the export's primary result/error.
	}
}

function shouldStageMediaSource(
	source: MediaSourceDescriptor,
	mediaMode: MediaPolicy["mode"],
): boolean {
	// Blob and ArrayBuffer fields are lost by the JSON SlideIR store, so they
	// always become repeatable OPFS descriptors before the record is written.
	if (source.kind === "blob" || source.kind === "bytes") return true
	// A staged export is a two-pass pipeline: pages are collected first and
	// replayed later. Signed/expiring URLs therefore must be fetched while the
	// page is still being collected. `auto` (including an omitted mode) uses
	// rolling staging for URL/blob URLs; `direct-stream` is an explicit opt-out
	// for callers that can guarantee a replayable URL or path.
	if (source.kind === "url") return mediaMode !== "direct-stream"
	// Stable path descriptors survive JSON replay and remain direct-streamed
	// unless the caller explicitly requests a media staging strategy.
	return mediaMode === "rolling-stage" || mediaMode === "full-stage"
}

async function createStagingStore(
	input: StreamingExportTaskInput,
	sessionId: string,
): Promise<StreamingStagingStore> {
	if (input.pipeline?.createStreamingStagingStore) {
		return input.pipeline.createStreamingStagingStore({ config: input.config, sessionId })
	}
	const presentation = createPresentation(input.config) as unknown as StreamingPptxWithStaging
	if (typeof presentation.createOpfsStagingStore !== "function") {
		throw new Error(
			"PptxGenJS v5 createOpfsStagingStore() is unavailable; use the streaming-only runtime.",
		)
	}
	return presentation.createOpfsStagingStore({ sessionId })
}

async function resolveFonts(
	input: StreamingExportTaskInput,
	usedFonts: Map<string, Set<string>>,
): Promise<EmbedFontInput[]> {
	if (!input.fontResolver || usedFonts.size === 0) return []
	const fonts: UsedFont[] = Array.from(usedFonts, ([typeface, faceKeys]) => ({
		typeface,
		faceKeys: Array.from(faceKeys).sort(),
	}))
	return (
		(await input.fontResolver(fonts, {
			missPolicy: input.fontMissPolicy ?? "fallback-with-warning",
		})) ?? []
	)
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

function createFrozenPlan(
	keys: readonly string[],
	media: ReadonlyMap<string, MediaSourceDescriptor>,
): StreamingPresentationPlan {
	const slides = keys.map((key, index) => {
		const ordinal = index + 1
		return {
			key,
			ordinal,
			slideId: ordinal + 255,
			presentationRelId: ordinal + 1,
			partName: `ppt/slides/slide${ordinal}.xml`,
		}
	})
	return {
		finalSlideCount: slides.length,
		slidePlan: { slides },
		capacityPlan: createCapacityPlan(slides.length, media, { mediaScanComplete: true }),
	}
}

function createCapacityOnlyPlan(pageCount?: number): StreamingPresentationPlan {
	return {
		// The direct path starts packaging before pages and media are observed. An
		// empty map here means "not scanned yet", rather than "this export has no
		// media", so capacity telemetry must remain conservative.
		capacityPlan: createCapacityPlan(pageCount ?? 0, new Map(), { mediaScanComplete: false }),
	}
}

interface CapacityPlanOptions {
	/** Whether the supplied media map represents the complete export. */
	readonly mediaScanComplete?: boolean
}

const ZIP32_SIZE_SENTINEL = BigInt("4294967295")
const ZIP32_ENTRY_COUNT_SENTINEL = BigInt("65535")

function createCapacityPlan(
	slideCount: number,
	media: ReadonlyMap<string, MediaSourceDescriptor>,
	options: CapacityPlanOptions = {},
) {
	let knownInputBytes = BigInt(0)
	let maxKnownEntryBytes: bigint | undefined
	let hasUnknownLengthSource = options.mediaScanComplete !== true
	for (const source of media.values()) {
		const size = descriptorSize(source)
		if (size === undefined) {
			hasUnknownLengthSource = true
			continue
		}
		const bytes = BigInt(size)
		knownInputBytes += bytes
		if (maxKnownEntryBytes === undefined || bytes > maxKnownEntryBytes) {
			maxKnownEntryBytes = bytes
		}
	}
	const estimatedEntryCount = BigInt(Math.max(24, slideCount * 6 + media.size + 24))
	return {
		confidence: hasUnknownLengthSource ? "streaming-unknown" : "upper-bound",
		zipMode: "zip64",
		hasUnknownLengthSource,
		maxEntryBytesMayReachZip32Limit:
			hasUnknownLengthSource ||
			(maxKnownEntryBytes !== undefined && maxKnownEntryBytes >= ZIP32_SIZE_SENTINEL),
		archiveBytesMayReachZip32Limit:
			hasUnknownLengthSource || knownInputBytes >= ZIP32_SIZE_SENTINEL,
		entryCountMayReachZip32Limit: estimatedEntryCount >= ZIP32_ENTRY_COUNT_SENTINEL,
		knownInputBytes,
		maxKnownEntryBytes,
		estimatedEntryCount,
	}
}

function normalizeWorkerDestination(destination: PptxDestination): StreamingWorkerDestination {
	if (isWritableStream(destination)) return { kind: "writable-stream", writable: destination }
	const wrapped = destination as {
		kind?: string
		writable?: WritableStream<Uint8Array> | NodeJS.WritableStream
		sink?: {
			write(chunk: Uint8Array): void | Promise<void>
			close(): void | Promise<void>
			abort?(reason?: unknown): void | Promise<void>
		}
		ackWindow?: number
	}
	if (wrapped.kind) {
		if (wrapped.kind === "sink-proxy" && wrapped.sink) {
			return { kind: "sink-proxy", sink: wrapped.sink, ackWindow: wrapped.ackWindow }
		}
		if (
			(wrapped.kind === "writable-stream" || wrapped.kind === "transferable-stream") &&
			isWritableStream(wrapped.writable)
		) {
			return { kind: "writable-stream", writable: wrapped.writable }
		}
		if (wrapped.kind === "node-writable" && isNodeWritable(wrapped.writable)) {
			return nodeWritableDestination(wrapped.writable)
		}
	}
	if (isOutputSink(destination)) return { kind: "sink-proxy", sink: destination }
	if (isNodeWritable(destination)) return nodeWritableDestination(destination)
	throw new TypeError("Unsupported PPTX streaming destination")
}

function nodeWritableDestination(writable: NodeJS.WritableStream): StreamingWorkerDestination {
	return {
		kind: "sink-proxy",
		sink: {
			write: (chunk) => writeNodeChunk(writable, chunk),
			close: () => endNodeWritable(writable),
			abort: (reason) => {
				;(
					writable as NodeJS.WritableStream & { destroy?: (error?: Error) => void }
				).destroy?.(
					reason instanceof Error
						? reason
						: new Error(String(reason ?? "Export aborted")),
				)
			},
		},
	}
}

/** Release a caller-owned destination when no packager was created to take ownership. */
async function abortDestination(
	destination: PptxDestination | undefined,
	reason: unknown,
): Promise<void> {
	if (!destination) return
	try {
		if (isWritableStream(destination)) {
			await destination.abort(reason)
			return
		}
		const wrapped = destination as {
			kind?: string
			writable?: WritableStream<Uint8Array> | NodeJS.WritableStream
			sink?: { abort?(reason?: unknown): void | Promise<void> }
		}
		if (wrapped.kind === "sink-proxy") {
			await wrapped.sink?.abort?.(reason)
			return
		}
		if (
			(wrapped.kind === "writable-stream" || wrapped.kind === "transferable-stream") &&
			isWritableStream(wrapped.writable)
		) {
			await wrapped.writable.abort(reason)
			return
		}
		if (wrapped.kind === "node-writable" && isNodeWritable(wrapped.writable)) {
			destroyNodeWritable(wrapped.writable, reason)
			return
		}
		if (isOutputSink(destination)) {
			await destination.abort?.(reason)
			return
		}
		if (isNodeWritable(destination)) destroyNodeWritable(destination, reason)
	} catch {
		// Preserve the render/preflight error that caused the destination release.
	}
}

function destroyNodeWritable(writable: NodeJS.WritableStream, reason: unknown): void {
	;(writable as NodeJS.WritableStream & { destroy?: (error?: Error) => void }).destroy?.(
		reason instanceof Error ? reason : new Error(String(reason ?? "Export aborted")),
	)
}

function writeNodeChunk(writable: NodeJS.WritableStream, chunk: Uint8Array): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false
		const done = (error?: Error | null) => {
			if (settled) return
			settled = true
			writable.removeListener?.("error", onError)
			error ? reject(error) : resolve()
		}
		const onError = (error: Error) => done(error)
		writable.once?.("error", onError)
		try {
			writable.write(chunk, (error?: Error | null) => done(error))
		} catch (error) {
			done(error instanceof Error ? error : new Error(String(error)))
		}
	})
}

function endNodeWritable(writable: NodeJS.WritableStream): Promise<void> {
	return new Promise((resolve, reject) => {
		const onError = (error: Error) => reject(error)
		writable.once?.("error", onError)
		writable.end(() => {
			writable.removeListener?.("error", onError)
			resolve()
		})
	})
}

function createPackagerOrThrow(
	createPackager: NonNullable<
		StreamingExportTaskInput["pipeline"]
	>["createStreamingPresentationPackager"],
	input: Parameters<NonNullable<typeof createPackager>>[0],
): StreamingPresentationPackager {
	if (!createPackager) throw new Error("Streaming presentation packager is unavailable")
	return createPackager(input)
}

function buildFinalAutoSizeConfig(config: SlideConfig, measuredMaxWidth: number): SlideConfig {
	const htmlWidth = Math.max(config.htmlWidth, measuredMaxWidth)
	return {
		...config,
		htmlWidth,
		slideWidth: htmlWidth / DEFAULT_DPI,
	}
}

function createSlideKey(sourceKey: string | undefined, index: number, pageOffset: number): string {
	const key = sourceKey?.trim() || `page-${index + 1}`
	return pageOffset === 0 ? key : `${key}-${pageOffset + 1}`
}

function descriptorSize(source: MediaSourceDescriptor): number | undefined {
	if (source.kind === "bytes") return source.data.byteLength
	return "size" in source ? source.size : undefined
}

function shouldCleanupStaging(policy: StagingPolicy["cleanup"], succeeded: boolean): boolean {
	switch (policy) {
		case "never":
			return false
		case "on-success":
			return succeeded
		case "on-error":
			return !succeeded
		default:
			return true
	}
}

function createSessionId(): string {
	const id =
		globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
	return `session-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`
}

function isWritableStream(value: unknown): value is WritableStream<Uint8Array> {
	return Boolean(value) && typeof (value as { getWriter?: unknown }).getWriter === "function"
}

function isOutputSink(value: unknown): value is {
	write(chunk: Uint8Array): void | Promise<void>
	close(): void | Promise<void>
	abort?(reason?: unknown): void | Promise<void>
} {
	return (
		Boolean(value) &&
		typeof (value as { write?: unknown }).write === "function" &&
		typeof (value as { close?: unknown }).close === "function"
	)
}

function isNodeWritable(value: unknown): value is NodeJS.WritableStream {
	return (
		Boolean(value) &&
		typeof (value as { write?: unknown }).write === "function" &&
		typeof (value as { end?: unknown }).end === "function" &&
		typeof (value as { on?: unknown }).on === "function"
	)
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw createAbortError()
}

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

// Keep the imported node union visible to declaration emit when custom runtimes
// override prepareSlideNodes with a structurally compatible implementation.
void (undefined as unknown as PPTNode)
