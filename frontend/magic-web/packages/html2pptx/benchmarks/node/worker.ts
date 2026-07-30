import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { performance } from "node:perf_hooks"
import { drawByRegistry } from "../../src/registry/drawer-registry"
import type { SerializablePPTNode } from "../../src/ir/serialize"
import type { Pptx } from "../../src/ir/node"
import { startMemorySampler } from "../shared/memory"
import {
	NODE_MEMORY_SAMPLE_INTERVAL_MS,
	NODE_WORKER_RESULT_PREFIX,
	type NodeWorkerInput,
	type NodeWorkerPhase,
	type NodeWorkerResult,
	type PackagingSuccessSample,
} from "./protocol"
import { createScenarioSlides } from "./scenarios"

const require = createRequire(import.meta.url)
const PptxGenJS = require("pptxgenjs") as new () => Pptx
const SLIDE_CONFIG = {
	htmlWidth: 1920,
	htmlHeight: 1080,
	slideWidth: 20,
	slideHeight: 11.25,
}

async function main(): Promise<void> {
	const input = readWorkerInput()
	let phase: NodeWorkerPhase = "fixture"
	try {
		const slides = createScenarioSlides(input.scenario, input.shape)
		collectGarbage()
		phase = "package"
		const sample = await runPackagingIteration(slides, input.iteration, input.includeHash)
		emitWorkerResult({ status: "success", sample })
	} catch (error) {
		emitWorkerResult({
			status: "failed",
			failure: {
				phase,
				name: error instanceof Error ? error.name : "UnknownError",
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
		})
	}
}

async function runPackagingIteration(
	slides: SerializablePPTNode[][],
	iteration: number,
	includeHash: boolean,
): Promise<PackagingSuccessSample> {
	const memory = startMemorySampler(NODE_MEMORY_SAMPLE_INTERVAL_MS)
	const startedAt = performance.now()
	try {
		const presentation = createBenchPresentation()

		for (const nodes of slides) {
			const slide = presentation.addSlide()
			for (const node of nodes) await drawByRegistry(slide, node)
			memory.observe()
		}

		const output = await presentation.write({ outputType: "arraybuffer" })
		const durationMs = performance.now() - startedAt
		const outputBytes = toUint8Array(output)
		memory.observe()
		const memoryPeak = memory.stop()
		const artifactSha256 = includeHash
			? createHash("sha256").update(outputBytes).digest("hex")
			: "warmup-not-hashed"

		return {
			status: "success",
			iteration,
			durationMs,
			outputBytes: outputBytes.byteLength,
			artifactSha256,
			sampledBaselineHeapBytes: memoryPeak.baselineHeapBytes,
			sampledBaselineRssBytes: memoryPeak.baselineRssBytes,
			sampledPeakHeapBytes: memoryPeak.peakHeapBytes,
			sampledPeakRssBytes: memoryPeak.peakRssBytes,
			sampledPeakHeapDeltaBytes: memoryPeak.peakHeapDeltaBytes,
			sampledPeakRssDeltaBytes: memoryPeak.peakRssDeltaBytes,
		}
	} catch (error) {
		memory.stop()
		throw error
	}
}

function readWorkerInput(): NodeWorkerInput {
	const raw = process.env.HTML2PPTX_NODE_BENCHMARK_WORKER_INPUT
	if (!raw) throw new Error("Missing HTML2PPTX_NODE_BENCHMARK_WORKER_INPUT")
	return JSON.parse(raw) as NodeWorkerInput
}

function emitWorkerResult(result: NodeWorkerResult): void {
	process.stdout.write(`${NODE_WORKER_RESULT_PREFIX}${JSON.stringify(result)}\n`)
}

function createBenchPresentation(): Pptx {
	const presentation = new PptxGenJS()
	presentation.defineLayout({
		name: "HTML2PPTX_BENCHMARK",
		width: SLIDE_CONFIG.slideWidth,
		height: SLIDE_CONFIG.slideHeight,
	})
	presentation.layout = "HTML2PPTX_BENCHMARK"
	return presentation
}

function toUint8Array(output: unknown): Uint8Array {
	if (output instanceof Uint8Array) return output
	if (output instanceof ArrayBuffer) return new Uint8Array(output)
	if (Buffer.isBuffer(output)) return output
	throw new Error(`Unexpected PptxGenJS output type: ${typeof output}`)
}

function collectGarbage(): void {
	const gc = (globalThis as { gc?: () => void }).gc
	gc?.()
}

main().catch((error) => {
	emitWorkerResult({
		status: "failed",
		failure: {
			phase: "fixture",
			name: error instanceof Error ? error.name : "UnknownError",
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
	})
})
