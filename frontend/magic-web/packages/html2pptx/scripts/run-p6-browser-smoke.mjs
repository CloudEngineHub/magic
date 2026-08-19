import { createRequire } from "node:module"
import { mkdir, readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Chromium/Worker/OPFS P6 gate. The underlying runner uses a real Packaging
 * Worker, a real OPFS FileSystemWritableFileStream, a sink-proxy ACK boundary,
 * bounded ZIP metadata reads, and an incremental SHA-256 pass.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const resultsDirectory = path.join(packageRoot, "benchmarks", "results")
const require = createRequire(import.meta.url)
const tsxLoader = require.resolve("tsx")
const runner = path.join(packageRoot, "benchmarks", "browser", "streaming-smoke.ts")

await mkdir(resultsDirectory, { recursive: true })

for (const slides of [200, 300]) {
	const output = path.join(resultsDirectory, `p6-ci-chromium-${slides}.json`)
	process.stderr.write(`[html2pptx P6] running Chromium/Worker/OPFS smoke (${slides} pages)\n`)
	await runSmoke(slides, output)
	const report = JSON.parse(await readFile(output, "utf8"))
	assertReport(report, slides)
	process.stderr.write(`[html2pptx P6] Chromium/Worker/OPFS smoke (${slides}) passed\n`)
}

console.log(
	"[html2pptx P6] Chromium/Worker/OPFS gate passed: 200 and 300 pages, ZIP64, media, backpressure",
)

function runSmoke(slides, output) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				"--import",
				tsxLoader,
				runner,
				"--target",
				"dist",
				"--slides",
				String(slides),
				"--cpu-throttle",
				"4",
				"--media",
				"--timeout-ms",
				"900000",
				"--output",
				output,
			],
			{
				cwd: packageRoot,
				stdio: ["ignore", "ignore", "inherit"],
				env: { ...process.env, NODE_OPTIONS: appendNodeOptions(process.env.NODE_OPTIONS) },
			},
		)
		child.once("error", reject)
		child.once("exit", (code, signal) => {
			if (code === 0) resolve()
			else
				reject(
					new Error(
						`Chromium smoke exited with code ${code ?? "unknown"} (${signal ?? "no signal"})`,
					),
				)
		})
	})
}

function appendNodeOptions(existing) {
	const options = String(existing ?? "")
	return options.includes("--max-old-space-size")
		? options
		: `${options} --max-old-space-size=4096`.trim()
}

function assertReport(report, expectedSlides) {
	if (report?.benchmark !== "html2pptx-streaming-opfs-smoke") {
		throw new Error(`unexpected Chromium smoke report type for ${expectedSlides} pages`)
	}
	if (report.target !== "dist" || report.slides !== expectedSlides) {
		throw new Error(`Chromium smoke target/page mismatch for ${expectedSlides} pages`)
	}
	const result = report.result
	if (!result || result.summary?.pageCount !== expectedSlides) {
		throw new Error(`Worker summary did not report ${expectedSlides} pages`)
	}
	if (
		!Array.isArray(report.workerUrls) ||
		!report.workerUrls.some((url) => /packaging-worker/.test(url))
	) {
		throw new Error("real Packaging Worker URL was not observed")
	}
	if (
		!result.opfsAvailable ||
		!/FileSystemWritableFileStream/.test(
			`${result.destinationConstructor} ${result.destinationTag}`,
		)
	) {
		throw new Error("the smoke did not use a real OPFS FileSystemWritableFileStream")
	}
	if (result.archiveType !== "zip64") throw new Error("streaming archive did not select ZIP64")
	if (result.slideXmlCount !== expectedSlides || result.missingSlideNumbers?.length !== 0) {
		throw new Error("archive slide XML validation failed")
	}
	if (result.fileBytes !== result.totalChunkBytes || result.fileBytes !== result.hashBytesRead) {
		throw new Error("sink, file, and incremental hash byte counts differ")
	}
	if (!/^[0-9a-f]{64}$/i.test(result.artifactSha256 ?? "")) {
		throw new Error("streamed artifact SHA-256 is invalid")
	}
	if (
		result.chunkCount <= 0 ||
		result.maxInFlightChunks !== 1 ||
		result.maxInFlightBytes < result.maxChunkBytes ||
		result.sinkFailedWriteCount !== 0 ||
		result.sinkCloseCount !== 1 ||
		result.sinkAbortCount !== 0
	) {
		throw new Error("sink backpressure/terminal telemetry is invalid")
	}
}
