import { exportPPTXStreaming } from "@magic/html2pptx"
import type {
	ExportProgress,
	LargeExportOptions,
	PptxDestination,
	PptxOutputSink,
	StreamingExportContent,
	StreamingExportHandle,
	StreamingHtmlPage,
	StreamingHtmlPageInput,
} from "@magic/html2pptx"
import { prepareHtmlForExport } from "@/utils/htmlExportPrepare"

/** File System Access picker options kept local because lib.dom does not expose the picker yet. */
interface SaveFilePickerOptions {
	suggestedName?: string
	types?: Array<{
		description?: string
		accept: Record<string, string[]>
	}>
	excludeAcceptAllOption?: boolean
}

interface SaveFilePickerGlobal {
	showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

export interface PptxDestinationLease {
	destination: PptxDestination
	abort: (reason?: unknown) => Promise<void>
}

type WritablePptxFile = Pick<FileSystemWritableFileStream, "write" | "close" | "abort">

export interface OpenPptxDestinationOptions {
	suggestedName: string
}

type HtmlExportPreparationOptions = Omit<Parameters<typeof prepareHtmlForExport>[0], "content">

export type PptxStreamingPageSourceFactory = (
	signal: AbortSignal,
) => AsyncIterable<StreamingHtmlPageInput>

/** Stable business-facing alias used by batch and single-target exporters. */
export type StreamingPageFactory = PptxStreamingPageSourceFactory

export type PptxStreamingOptionsResolver =
	| LargeExportOptions
	| ((firstPage: StreamingHtmlPage) => LargeExportOptions | Promise<LargeExportOptions>)

export interface PeekedAsyncIterable<T> {
	first: T
	replay: AsyncIterable<T>
	close: (reason?: unknown) => Promise<void>
}

/**
 * Return a stable `.pptx` filename without changing names that already carry the extension.
 */
export function ensurePptxFileName(fileName: string): string {
	const trimmed = fileName.trim() || "export"
	return /\.pptx$/i.test(trimmed) ? trimmed : `${trimmed}.pptx`
}

/**
 * Whether the current browser can open a user-selected writable destination.
 *
 * This check is intentionally capability based. User-agent checks are not sufficient for
 * Chromium desktop shells and can incorrectly advertise a path that cannot be written.
 */
export function supportsPptxFileStreaming(): boolean {
	return typeof (globalThis as SaveFilePickerGlobal).showSaveFilePicker === "function"
}

/**
 * Open the final destination while the original click activation is still alive.
 *
 * The returned sink deliberately exposes only `Uint8Array` writes. This keeps the browser
 * file handle on the application side while the packaging pipeline applies ACK/backpressure.
 * A cancelled picker returns `null` and does not create a partial file.
 */
export async function openPptxDestination(
	options: OpenPptxDestinationOptions,
): Promise<PptxDestinationLease | null> {
	const picker = (globalThis as SaveFilePickerGlobal).showSaveFilePicker
	if (!picker) return null

	let handle: FileSystemFileHandle
	try {
		handle = await picker({
			suggestedName: ensurePptxFileName(options.suggestedName),
			types: [
				{
					description: "PowerPoint presentation",
					accept: {
						"application/vnd.openxmlformats-officedocument.presentationml.presentation":
							[".pptx"],
					},
				},
			],
			excludeAcceptAllOption: true,
		})
	} catch (error) {
		if (isAbortError(error)) return null
		throw error
	}

	return createPptxDestinationLease(await handle.createWritable())
}

/**
 * Adapt a File System Access writable into the ACK sink consumed by html2pptx.
 * Close is not considered terminal until it succeeds, so a failed commit can
 * still be followed by abort() to discard the partially written destination.
 */
export function createPptxDestinationLease(writable: WritablePptxFile): PptxDestinationLease {
	let settled = false
	let closeOperation: Promise<void> | null = null
	let abortOperation: Promise<void> | null = null

	const close = (): Promise<void> => {
		if (settled) return Promise.resolve()
		if (abortOperation) return abortOperation
		if (closeOperation) return closeOperation

		const operation = (async () => {
			try {
				await writable.close()
				settled = true
			} finally {
				if (closeOperation === operation) closeOperation = null
			}
		})()
		closeOperation = operation
		return operation
	}

	const abort = (reason?: unknown): Promise<void> => {
		if (settled) return Promise.resolve()
		if (abortOperation) return abortOperation

		// Abort is intentionally allowed while close is pending. WritableStream
		// semantics will serialize the underlying operations and discard the file
		// when cancellation wins the race.
		const operation = (async () => {
			try {
				await writable.abort(reason)
				settled = true
			} finally {
				if (abortOperation === operation) abortOperation = null
			}
		})()
		abortOperation = operation
		return operation
	}

	const sink: PptxOutputSink = {
		write: async (chunk) => {
			if (settled || closeOperation || abortOperation) {
				throw new Error("PPTX destination is already closing or closed")
			}
			await writable.write(chunk)
		},
		close,
		abort,
	}

	return {
		destination: { kind: "sink-proxy", sink },
		abort,
	}
}

/**
 * Start a streaming export with a destination selected by the caller. The function is kept
 * small so business entry points can open the picker before their first asynchronous fetch,
 * then pass the page provider directly to html2pptx without creating a page array or Blob.
 */
export function startPptxStreamingExport(
	content: StreamingExportContent,
	options: LargeExportOptions,
): StreamingExportHandle {
	return exportPPTXStreaming(content, options)
}

/**
 * Start a large export from a signal-aware lazy page source. The source is peeked once before the
 * Packaging Worker starts so an options resolver can derive the presentation layout from the
 * first page without materializing the remaining pages.
 */
export function startPptxStreamingExportFromFactory(
	createPages: StreamingPageFactory,
	optionsOrResolver: PptxStreamingOptionsResolver,
): StreamingExportHandle {
	const sourceController = new AbortController()
	let activeHandle: StreamingExportHandle | null = null
	let closeSource: ((reason?: unknown) => Promise<void>) | null = null
	let firstPage: StreamingHtmlPage | null = null

	const promise = (async () => {
		let peeked: Awaited<ReturnType<typeof peekStreamingPage>> | null = await peekStreamingPage(
			createPages(sourceController.signal),
			sourceController.signal,
		)
		const close = peeked.close
		closeSource = close
		firstPage = peeked.firstPage
		const pages = peeked.pages
		peeked = null

		try {
			let resolverPage = firstPage
			if (!resolverPage) throw new Error("PPTX page source did not yield any pages")
			let options: LargeExportOptions
			if (typeof optionsOrResolver === "function") {
				const pendingOptions = Promise.resolve(optionsOrResolver(resolverPage))
				resolverPage = null
				firstPage = null
				options = await waitForAbortable(pendingOptions, sourceController.signal)
			} else {
				resolverPage = null
				firstPage = null
				options = optionsOrResolver
			}
			// The replay source now owns the first page until its first yield is consumed.
			// Do not retain a second business-layer reference for the remainder of the export.
			throwIfAborted(sourceController.signal)

			activeHandle = exportPPTXStreaming(pages, options)
			if (sourceController.signal.aborted) activeHandle.cancel()
			return await activeHandle.promise
		} finally {
			firstPage = null
			await close(sourceController.signal.reason).catch(() => undefined)
		}
	})()

	return {
		promise,
		cancel: () => {
			const reason = createPptxAbortError()
			if (!sourceController.signal.aborted) sourceController.abort(reason)
			void closeSource?.(reason).catch(() => undefined)
			activeHandle?.cancel()
		},
	}
}

/** Peek the first normalized page while preserving it in the returned single-use replay source. */
export async function peekStreamingPage(
	source: AsyncIterable<StreamingHtmlPageInput>,
	signal: AbortSignal,
): Promise<{
	firstPage: StreamingHtmlPage
	pages: AsyncIterable<StreamingHtmlPage>
	close: (reason?: unknown) => Promise<void>
}> {
	const normalized = normalizeStreamingPages(source, signal)
	const peeked = await peekAndReplayAsyncIterable(normalized, signal)
	return { firstPage: peeked.first, pages: peeked.replay, close: peeked.close }
}

/**
 * Pull exactly one item from a lazy source, then expose a single-use replay iterable that yields
 * that item before continuing with the same iterator. This lets callers derive presentation-wide
 * options from the first page without fetching or retaining the complete deck.
 */
export async function peekAndReplayAsyncIterable<T>(
	source: AsyncIterable<T>,
	signal: AbortSignal,
): Promise<PeekedAsyncIterable<T>> {
	const iterator = source[Symbol.asyncIterator]()
	let closed = false
	let replayClaimed = false

	const close = async (reason?: unknown) => {
		if (closed) return
		closed = true
		if (typeof iterator.return === "function") await iterator.return(reason)
	}

	let firstResult: IteratorResult<T>
	try {
		firstResult = await waitForAbortable(iterator.next(), signal, () => {
			void close(signal.reason).catch(() => undefined)
		})
		throwIfAborted(signal)
	} catch (error) {
		await close(error).catch(() => undefined)
		throw error
	}
	if (firstResult.done) {
		closed = true
		throw new Error("PPTX page source did not yield any pages")
	}
	const first = firstResult.value
	let replayFirst: T | undefined = first

	const replay: AsyncIterable<T> = {
		async *[Symbol.asyncIterator]() {
			if (replayClaimed) throw new Error("PPTX page source replay can only be consumed once")
			replayClaimed = true
			try {
				throwIfAborted(signal)
				yield replayFirst as T
				replayFirst = undefined
				while (!closed) {
					const next = await waitForAbortable(iterator.next(), signal, () => {
						void close(signal.reason).catch(() => undefined)
					})
					throwIfAborted(signal)
					if (next.done) {
						closed = true
						return
					}
					yield next.value
				}
			} finally {
				replayFirst = undefined
				await close(signal.reason).catch(() => undefined)
			}
		},
	}

	return { first, replay, close }
}

/**
 * Compose an arbitrary lazy HTML source with the application's export preparation step.
 * Only the current raw page and current prepared page are retained.
 */
export async function* iteratePreparedPptxPages(
	pages: Iterable<StreamingHtmlPageInput> | AsyncIterable<StreamingHtmlPageInput>,
	options: HtmlExportPreparationOptions & { signal?: AbortSignal },
): AsyncIterable<StreamingHtmlPage> {
	const { signal, ...preparationOptions } = options
	let fallbackIndex = 0
	for await (const page of pages) {
		throwIfAborted(signal)
		const sourcePage = typeof page === "string" ? { index: fallbackIndex, html: page } : page
		const html = await waitForAbortable(
			prepareHtmlForExport({
				...preparationOptions,
				content: sourcePage.html,
			}),
			signal,
		)
		throwIfAborted(signal)
		yield {
			index: sourcePage.index,
			html,
			...(sourcePage.key ? { key: sourcePage.key } : {}),
		}
		fallbackIndex += 1
	}
}

async function* normalizeStreamingPages(
	source: AsyncIterable<StreamingHtmlPageInput>,
	signal: AbortSignal,
): AsyncIterable<StreamingHtmlPage> {
	let fallbackIndex = 0
	for await (const page of source) {
		throwIfAborted(signal)
		if (typeof page === "string") {
			yield { index: fallbackIndex, html: page }
		} else if (page && typeof page.html === "string") {
			yield page
		} else {
			throw new TypeError(
				"[startPptxStreamingExportFromFactory] Each page must be an HTML string or { index, html } object",
			)
		}
		fallbackIndex += 1
	}
}

/**
 * Build progress text without retaining page HTML or media data in UI state.
 */
export function formatPptxStreamingProgress(baseText: string, progress: ExportProgress): string {
	const pageText =
		progress.pageIndex !== undefined
			? progress.pageCount !== undefined
				? ` (${progress.pageIndex + 1}/${progress.pageCount})`
				: ` (${progress.pageIndex + 1})`
			: ""
	const phaseText = progress.phase === "completed" ? "" : ` · ${progress.phase}`
	return `${baseText}${pageText}${phaseText}`
}

function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" &&
			error instanceof DOMException &&
			error.name === "AbortError") ||
		(typeof error === "object" &&
			error !== null &&
			"name" in error &&
			(error as { name?: unknown }).name === "AbortError")
	)
}

function waitForAbortable<T>(
	promise: PromiseLike<T>,
	signal?: AbortSignal,
	onAbort?: () => void,
): Promise<T> {
	if (!signal) return Promise.resolve(promise)
	if (signal.aborted) {
		onAbort?.()
		return Promise.reject(abortReason(signal))
	}

	return new Promise<T>((resolve, reject) => {
		let settled = false
		const cleanup = () => signal.removeEventListener("abort", handleAbort)
		const handleAbort = () => {
			if (settled) return
			settled = true
			cleanup()
			onAbort?.()
			reject(abortReason(signal))
		}
		signal.addEventListener("abort", handleAbort, { once: true })
		Promise.resolve(promise).then(
			(value) => {
				if (settled) return
				settled = true
				cleanup()
				resolve(value)
			},
			(error) => {
				if (settled) return
				settled = true
				cleanup()
				reject(error)
			},
		)
	})
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortReason(signal)
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error ? signal.reason : createPptxAbortError(signal.reason)
}

function createPptxAbortError(reason?: unknown): Error {
	if (typeof DOMException !== "undefined") {
		return new DOMException(
			reason === undefined ? "Export aborted" : String(reason),
			"AbortError",
		)
	}
	const error = new Error(reason === undefined ? "Export aborted" : String(reason))
	error.name = "AbortError"
	return error
}
