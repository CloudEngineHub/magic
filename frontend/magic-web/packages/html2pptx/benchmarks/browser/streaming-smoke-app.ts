// Vite resolves this benchmark-only alias to either the source tree or an explicit dist build.
// eslint-disable-next-line import/no-unresolved
import { createPptxStreamingExporter, type ExportProgress } from "@html2pptx-benchmark-target"

interface StreamingSmokeInput {
	slides: number
	includeMedia?: boolean
}

export interface StreamingSmokeResult {
	summary: {
		pageCount: number
		mediaPartCount: number
		bytesWritten: number
		durationMs: number
	}
	fileBytes: number
	artifactSha256: string
	centralDirectoryEntryCount: number
	slideXmlCount: number
	missingSlideNumbers: number[]
	destinationConstructor: string
	destinationTag: string
	destinationMode: "sink-proxy"
	opfsAvailable: boolean
	progressCounts: Record<string, number>
	sampledBaselineJsHeapBytes: number | null
	sampledExportPeakJsHeapBytes: number | null
	heapSampleIntervalMs: number
	longTaskCount: number
	longTaskTotalMs: number
	longTaskMaxMs: number
	includeMedia: boolean
}

declare global {
	interface Window {
		__HTML2PPTX_STREAMING_SMOKE__?: {
			run(input: StreamingSmokeInput): Promise<StreamingSmokeResult>
		}
	}

	interface Performance {
		memory?: {
			usedJSHeapSize: number
			totalJSHeapSize: number
			jsHeapSizeLimit: number
		}
	}
}

class FastReadyController {
	constructor(_input: { iframeWindow: Window; iframeDocument: Document }) {}

	async waitForReady(options: { signal?: AbortSignal } = {}): Promise<void> {
		if (options.signal?.aborted) throw createAbortError()
	}

	restore(): void {}
}

const streamingExporter = createPptxStreamingExporter({
	sandboxReadyController: FastReadyController,
})

window.__HTML2PPTX_STREAMING_SMOKE__ = { run: runStreamingSmoke }
document.querySelector("#status")!.textContent = "ready"

async function runStreamingSmoke(input: StreamingSmokeInput): Promise<StreamingSmokeResult> {
	if (!Number.isSafeInteger(input.slides) || input.slides <= 0) {
		throw new RangeError("slides must be a positive safe integer")
	}

	const storage = navigator.storage as StorageManager & {
		getDirectory?: () => Promise<FileSystemDirectoryHandle>
	}
	if (typeof storage.getDirectory !== "function") {
		throw new Error("OPFS navigator.storage.getDirectory() is unavailable")
	}

	const root = await storage.getDirectory()
	const fileName = `html2pptx-streaming-smoke-${crypto.randomUUID()}.pptx`
	const fileHandle = await root.getFileHandle(fileName, { create: true })
	const writable = await fileHandle.createWritable({ keepExistingData: false })
	const destinationConstructor = writable.constructor.name
	const destinationTag = Object.prototype.toString.call(writable)
	const progressCounts: Record<string, number> = {}
	const heap = startHeapSampler()
	const longTasks = startLongTaskObserver()

	try {
		const handle = streamingExporter(createSlides(input.slides, input.includeMedia === true), {
			fileName,
			pageCount: input.slides,
			outputPolicy: "file-stream",
			// Chromium currently does not structured-clone FileSystemWritableFileStream
			// itself. Keep the real OPFS stream on the main thread and expose the
			// worker's output through the production sink-proxy protocol.
			destination: {
				kind: "sink-proxy",
				sink: {
					write: (chunk) => writable.write(chunk),
					close: () => writable.close(),
					abort: (reason) => writable.abort(reason),
				},
			},
			compression: false,
			logLevel: "error",
			onProgress: (progress) => incrementProgress(progressCounts, progress),
		})
		const summary = await handle.promise
		const sampledExportPeakJsHeapBytes = heap.currentPeak()
		const longTaskSummary = longTasks.stop()
		const heapSummary = heap.stop()
		const file = await fileHandle.getFile()
		const bytes = new Uint8Array(await file.arrayBuffer())
		const archive = inspectArchive(bytes, input.slides)
		const artifactSha256 = await sha256(bytes)

		return {
			summary: {
				pageCount: summary.pageCount,
				mediaPartCount: summary.mediaPartCount,
				bytesWritten: summary.bytesWritten,
				durationMs: summary.durationMs,
			},
			fileBytes: file.size,
			artifactSha256,
			centralDirectoryEntryCount: archive.centralDirectoryEntryCount,
			slideXmlCount: archive.slideXmlCount,
			missingSlideNumbers: archive.missingSlideNumbers,
			destinationConstructor,
			destinationTag,
			destinationMode: "sink-proxy",
			opfsAvailable: true,
			progressCounts,
			sampledBaselineJsHeapBytes: heapSummary.baseline,
			sampledExportPeakJsHeapBytes,
			heapSampleIntervalMs: heapSummary.sampleIntervalMs,
			longTaskCount: longTaskSummary.count,
			longTaskTotalMs: longTaskSummary.totalMs,
			longTaskMaxMs: longTaskSummary.maxMs,
			includeMedia: input.includeMedia === true,
		}
	} finally {
		heap.stop()
		longTasks.stop()
		await root.removeEntry(fileName).catch(() => undefined)
	}
}

async function* createSlides(slideCount: number, includeMedia: boolean): AsyncIterable<string> {
	for (let index = 0; index < slideCount; index += 1) {
		yield createSlideHtml(index, includeMedia)
	}
}

function createSlideHtml(index: number, includeMedia: boolean): string {
	const pageNumber = index + 1
	const media = includeMedia
		? `<img class="fixture" src="${location.origin}/__html2pptx_benchmark_asset/32x32/324478056.png" alt="reused fixture">`
		: ""
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:#f8fafc;font-family:Arial,sans-serif}
		.slide{position:relative;width:1920px;height:1080px}
		.marker{position:absolute;left:96px;top:96px;width:1728px;height:168px;padding:24px;background:#e2e8f0;color:#0f172a;font-size:44px;line-height:1.25}
		.fixture{position:absolute;left:96px;top:340px;width:32px;height:32px}
	</style>
</head>
<body><main class="slide"><div class="marker">Streaming smoke page ${pageNumber} of ${pageNumber}</div>${media}</main></body>
</html>`
}

function incrementProgress(counts: Record<string, number>, progress: ExportProgress): void {
	counts[progress.phase] = (counts[progress.phase] ?? 0) + 1
}

function inspectArchive(
	bytes: Uint8Array,
	expectedSlides: number,
): {
	centralDirectoryEntryCount: number
	slideXmlCount: number
	missingSlideNumbers: number[]
} {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const decoder = new TextDecoder()
	const slideNumbers = new Set<number>()
	let centralDirectoryEntryCount = 0

	for (let offset = 0; offset + 46 <= bytes.byteLength; ) {
		if (view.getUint32(offset, true) !== 0x02014b50) {
			offset += 1
			continue
		}
		const fileNameLength = view.getUint16(offset + 28, true)
		const extraLength = view.getUint16(offset + 30, true)
		const commentLength = view.getUint16(offset + 32, true)
		const entryLength = 46 + fileNameLength + extraLength + commentLength
		if (offset + entryLength > bytes.byteLength) {
			offset += 1
			continue
		}
		const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength))
		centralDirectoryEntryCount += 1
		const slideMatch = name.match(/^ppt\/slides\/slide(\d+)\.xml$/)
		if (slideMatch) slideNumbers.add(Number(slideMatch[1]))
		offset += entryLength
	}

	const missingSlideNumbers: number[] = []
	for (let index = 1; index <= expectedSlides; index += 1) {
		if (!slideNumbers.has(index)) missingSlideNumbers.push(index)
	}
	return {
		centralDirectoryEntryCount,
		slideXmlCount: slideNumbers.size,
		missingSlideNumbers,
	}
}

function startHeapSampler(): {
	currentPeak(): number | null
	stop(): { baseline: number | null; peak: number | null; sampleIntervalMs: number }
} {
	const sampleIntervalMs = 20
	const read = () => performance.memory?.usedJSHeapSize ?? null
	const baseline = read()
	let peak = baseline
	let stopped = false
	const observe = () => {
		const current = read()
		if (current !== null) peak = peak === null ? current : Math.max(peak, current)
	}
	const timer = window.setInterval(observe, sampleIntervalMs)
	return {
		currentPeak() {
			observe()
			return peak
		},
		stop() {
			if (!stopped) {
				stopped = true
				window.clearInterval(timer)
				observe()
			}
			return { baseline, peak, sampleIntervalMs }
		},
	}
}

function startLongTaskObserver(): {
	stop(): { count: number; totalMs: number; maxMs: number }
} {
	const durations: number[] = []
	let observer: PerformanceObserver | null = null
	let stopped = false
	if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) durations.push(entry.duration)
		})
		observer.observe({ entryTypes: ["longtask"] })
	}
	return {
		stop() {
			if (!stopped) {
				stopped = true
				observer?.takeRecords().forEach((entry) => durations.push(entry.duration))
				observer?.disconnect()
			}
			return {
				count: durations.length,
				totalMs: durations.reduce((sum, value) => sum + value, 0),
				maxMs: durations.length > 0 ? Math.max(...durations) : 0,
			}
		},
	}
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes)
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function createAbortError(): DOMException {
	return new DOMException("Export aborted", "AbortError")
}
