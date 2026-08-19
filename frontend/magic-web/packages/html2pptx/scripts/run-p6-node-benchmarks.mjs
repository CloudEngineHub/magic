import { createRequire } from "node:module"
import { mkdir, readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Reproducible P6 pressure gate for the destination-first Node path.
 *
 * The benchmark worker counts and hashes every output chunk through a Node
 * Writable; it never asks PptxGenJS for a final ArrayBuffer/Blob. We run both
 * the 200-page all-scenario matrix and a 300-page mixed media document, then
 * fail if any sample is missing, failed, or malformed.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const resultsDirectory = path.join(packageRoot, "benchmarks", "results")
const require = createRequire(import.meta.url)
const tsxLoader = require.resolve("tsx")
const runner = path.join(packageRoot, "benchmarks", "node", "run.ts")

await mkdir(resultsDirectory, { recursive: true })

const runs = [
	{
		name: "200-page-all-scenarios",
		output: path.join(resultsDirectory, "p6-ci-node-200.json"),
		args: [
			"--profile",
			"quick",
			"--scenario",
			"text,image-reuse,image-unique,mixed",
			"--slides",
			"200",
			"--images-per-slide",
			"3",
			"--image-width",
			"256",
			"--image-height",
			"144",
			"--iterations",
			"1",
			"--warmup",
			"0",
			"--timeout-ms",
			"900000",
		],
		expectedSlides: 200,
		expectedScenarios: ["text", "image-reuse", "image-unique", "mixed"],
	},
	{
		name: "300-page-mixed-media",
		output: path.join(resultsDirectory, "p6-ci-node-300.json"),
		args: [
			"--profile",
			"quick",
			"--scenario",
			"mixed",
			"--slides",
			"300",
			"--images-per-slide",
			"3",
			"--image-width",
			"256",
			"--image-height",
			"144",
			"--iterations",
			"1",
			"--warmup",
			"0",
			"--timeout-ms",
			"900000",
		],
		expectedSlides: 300,
		expectedScenarios: ["mixed"],
	},
]

for (const run of runs) {
	process.stderr.write(`[html2pptx P6] running ${run.name}\n`)
	await runBenchmark(run.args, run.output)
	const report = JSON.parse(await readFile(run.output, "utf8"))
	assertReport(run, report)
	process.stderr.write(`[html2pptx P6] ${run.name} passed\n`)
}

console.log(
	`[html2pptx P6] Node pressure gate passed: ${runs.map((run) => path.basename(run.output)).join(", ")}`,
)

function runBenchmark(args, output) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["--import", tsxLoader, runner, ...args, "--output", output],
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
						`benchmark exited with code ${code ?? "unknown"} (${signal ?? "no signal"})`,
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

function assertReport(run, report) {
	if (report?.benchmark !== "html2pptx-node-packaging") {
		throw new Error(`${run.name}: unexpected benchmark report type`)
	}
	if (!Array.isArray(report.results)) throw new Error(`${run.name}: results are missing`)
	const names = report.results.map((result) => result?.name)
	for (const scenario of run.expectedScenarios) {
		const result = report.results.find((candidate) => candidate?.name === scenario)
		if (!result)
			throw new Error(`${run.name}: scenario ${scenario} is missing (${names.join(", ")})`)
		if (result.fixture?.slides !== run.expectedSlides) {
			throw new Error(`${run.name}/${scenario}: expected ${run.expectedSlides} slides`)
		}
		if (result.summary?.successRate !== 1 || result.summary?.failedIterations !== 0) {
			throw new Error(`${run.name}/${scenario}: one or more benchmark iterations failed`)
		}
		const sample = result.samples?.find((candidate) => candidate?.status === "success")
		if (!sample || !Number.isFinite(sample.outputBytes) || sample.outputBytes <= 0) {
			throw new Error(`${run.name}/${scenario}: no successful streamed artifact sample`)
		}
		if (!/^[0-9a-f]{64}$/i.test(sample.artifactSha256 ?? "")) {
			throw new Error(`${run.name}/${scenario}: invalid artifact SHA-256`)
		}
	}
}
