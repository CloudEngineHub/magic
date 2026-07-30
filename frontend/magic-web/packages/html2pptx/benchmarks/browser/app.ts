import { generatePPTX } from "@html2pptx-benchmark-target"
import { createBrowserScenarioSlides } from "./scenarios"
import type { ScenarioName, ScenarioShape } from "../shared/types"

interface BrowserRunInput {
	scenario: ScenarioName
	shape: ScenarioShape
	iteration: number
}

export interface BrowserRunSample {
	status: "ok"
	iteration: number
	durationMs: number
	outputBytes: number
	artifactSha256: string
	hashDurationMs: number
	sampledBaselineJsHeapBytes: number | null
	sampledExportPeakJsHeapBytes: number | null
	sampledPeakJsHeapBytes: number | null
	heapSampleIntervalMs: number
	longTaskCount: number
	longTaskTotalMs: number
	longTaskMaxMs: number
	slideProgressEvents: number
}

declare global {
	interface Window {
		__HTML2PPTX_BENCHMARK__?: {
			run(input: BrowserRunInput): Promise<BrowserRunSample>
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

window.__HTML2PPTX_BENCHMARK__ = { run: runBenchmark }
document.querySelector("#status")!.textContent = "ready"

async function runBenchmark(input: BrowserRunInput): Promise<BrowserRunSample> {
	const htmlSlides = createBrowserScenarioSlides(input.scenario, input.shape, location.origin)
	const heap = startHeapSampler()
	const longTasks = startLongTaskObserver()
	try {
		let slideProgressEvents = 0
		const startedAt = performance.now()
		const output = await generatePPTX(htmlSlides, {
			fileName: `html2pptx-${input.scenario}.pptx`,
			logLevel: "error",
			onSlideProgress: () => {
				slideProgressEvents += 1
			},
		}).promise
		const durationMs = performance.now() - startedAt
		const sampledExportPeakJsHeapBytes = heap.currentPeak()
		const longTaskSummary = longTasks.stop()
		const hashStartedAt = performance.now()
		const artifactSha256 = await sha256(output.data)
		const hashDurationMs = performance.now() - hashStartedAt
		const heapSummary = heap.stop()

		return {
			status: "ok",
			iteration: input.iteration,
			durationMs,
			outputBytes: output.data.size,
			artifactSha256,
			hashDurationMs,
			sampledBaselineJsHeapBytes: heapSummary.baseline,
			sampledExportPeakJsHeapBytes,
			sampledPeakJsHeapBytes: heapSummary.peak,
			heapSampleIntervalMs: heapSummary.sampleIntervalMs,
			longTaskCount: longTaskSummary.count,
			longTaskTotalMs: longTaskSummary.totalMs,
			longTaskMaxMs: longTaskSummary.maxMs,
			slideProgressEvents,
		}
	} finally {
		heap.stop()
		longTasks.stop()
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

async function sha256(blob: Blob): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
