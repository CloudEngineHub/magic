#!/usr/bin/env node

/**
 * Post-build identity gate for the complete PPTX runtime chain.
 *
 * This is deliberately separate from verify-streaming-only.mjs. The latter
 * runs before a build and must not trust ignored dist directories; this gate
 * runs after both the html2pptx package and the Magic Web application have
 * been built and proves that the emitted root Worker is the Worker produced
 * by the exact vendored PptxGenJS runtime.
 */

import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import {
	assertRuntimeIdentityEqual,
	buildExpectedRuntimeIdentity,
	deriveExpectedBuildId,
	extractRuntimeIdentity,
	validateRuntimeIdentity,
} from "./runtime-identity-gate.mjs"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const magicWebRoot = path.resolve(packageRoot, "../..")
const edition = process.argv.includes("--enterprise") ? "enterprise" : "open"

const expectedPptxGenJs = {
	name: "pptxgenjs",
	version: "5.0.0",
	sourceCommit: "37b2dc9d04352366e765712ba8903be38c6a9669",
	artifact: "pptxgenjs-5.0.0.tgz",
}

const retiredWorkerMarkers = [
	"document.getElementById",
	"tableToSlides.addImage",
	"tableProps.h",
	"Table ID",
	"generatePPTX",
	"exportPPTX",
	"writeFile",
	"FileSaver",
]

/**
 * Verify vendor -> installed runtime -> package Worker -> root app Worker.
 */
export async function verifyBuiltRuntimeChain({
	packageRoot: packageRootOverride = packageRoot,
	magicWebRoot: magicWebRootOverride = magicWebRoot,
} = {}) {
	const failures = []
	const packageDir = path.resolve(packageRootOverride)
	const appRoot = path.resolve(magicWebRootOverride)
	const vendorDir = path.join(appRoot, "vendor")
	const packageJsonPath = path.join(packageDir, "package.json")
	const artifactPath = path.join(vendorDir, expectedPptxGenJs.artifact)
	const manifestPath = artifactPath.replace(/\.tgz$/, ".manifest.json")

	const manifest = await readJsonRequired(manifestPath, failures)
	const packageJson = await readJsonRequired(packageJsonPath, failures)
	if (manifest) {
		for (const [field, expected] of Object.entries(expectedPptxGenJs)) {
			if (manifest[field] !== expected) {
				failures.push(
					`${path.relative(appRoot, manifestPath)}: ${field} must be ${expected}; found ${String(manifest[field])}`,
				)
			}
		}
	}
	const expectedRuntimeIdentity =
		manifest && packageJson
			? buildExpectedRuntimeIdentity({
					edition,
					html2pptxVersion: packageJson.version,
					buildId: deriveExpectedBuildId(appRoot),
					pptxgenjsVersion: manifest.version,
					sourceCommit: manifest.sourceCommit,
					artifactHash: manifest.sha256,
				})
			: undefined

	const artifact = await readRequired(artifactPath, failures)
	if (!artifact) return result(failures)
	const artifactSha256 = sha256(artifact)
	if (manifest?.sha256 !== artifactSha256) {
		failures.push(
			`${path.relative(appRoot, manifestPath)}: sha256 must match the vendored artifact (${artifactSha256})`,
		)
	}

	let runtimeEntry
	try {
		runtimeEntry = readTarEntry(gunzipSync(artifact), "package/dist/pptxgen.es.mjs")
	} catch (error) {
		failures.push(`${path.relative(appRoot, artifactPath)}: unable to read gzip tarball (${error.message})`)
	}
	if (!runtimeEntry) {
		failures.push(`${path.relative(appRoot, artifactPath)}: missing package/dist/pptxgen.es.mjs`)
		return result(failures, { artifactSha256 })
	}
	const runtimeSha256 = sha256(runtimeEntry)

	const installedRuntimePath = path.join(
		packageDir,
		"node_modules",
		"pptxgenjs",
		"dist",
		"pptxgen.es.mjs",
	)
	const installedRuntime = await readRequired(installedRuntimePath, failures)
	if (installedRuntime && sha256(installedRuntime) !== runtimeSha256) {
		failures.push(
			`${path.relative(appRoot, installedRuntimePath)}: installed runtime is stale; expected ${runtimeSha256}, found ${sha256(installedRuntime)}`,
		)
	}

	let packageIdentity
	const packageIdentityFiles = [
		path.join(packageDir, "dist", "index.js"),
		path.join(packageDir, "dist", "index.cjs"),
	]
	for (const file of packageIdentityFiles) {
		const bytes = await readRequired(file, failures)
		if (!bytes) continue
		const identity = inspectRuntimeIdentity(file, bytes.toString("utf8"), expectedRuntimeIdentity, failures)
		if (!identity) continue
		if (!packageIdentity) packageIdentity = identity
		else compareRuntimeIdentity(packageIdentity, identity, file, packageIdentityFiles[0], failures)
	}

	const packageAssets = path.join(packageDir, "dist", "assets")
	const packageWorker = await findSingleWorker(packageAssets, /^packaging-worker-[^.]+\.js$/, "package", failures)
	const packageWorkerBytes = packageWorker && (await readRequired(packageWorker.path, failures))
	const packageWorkerSha256 = packageWorkerBytes ? sha256(packageWorkerBytes) : undefined
	let packageWorkerIdentity
	if (packageWorker && packageWorkerBytes) {
		packageWorkerIdentity = inspectRuntimeIdentity(
			packageWorker.path,
			packageWorkerBytes.toString("utf8"),
			expectedRuntimeIdentity,
			failures,
		)
		if (packageIdentity && packageWorkerIdentity) {
			compareRuntimeIdentity(
				packageIdentity,
				packageWorkerIdentity,
				packageWorker.path,
				packageIdentityFiles[0],
				failures,
			)
		}
	}

	let sourceMapSha256
	if (packageWorker && packageWorkerBytes) {
		const packageWorkerText = packageWorkerBytes.toString("utf8")
		checkWorkerText(packageWorker.path, packageWorkerText, failures)
		const mapMatch = packageWorkerText.match(/sourceMappingURL=([^\s]+)/)
		if (!mapMatch) {
			failures.push(`${path.relative(appRoot, packageWorker.path)}: Worker source map reference is missing`)
		} else {
			const mapName = decodeURIComponent(mapMatch[1].split(/[?#]/, 1)[0])
			const mapPath = path.resolve(packageAssets, mapName)
			if (path.dirname(mapPath) !== path.resolve(packageAssets)) {
				failures.push(`${path.relative(appRoot, mapPath)}: Worker source map escapes the package assets directory`)
			} else {
				const mapBytes = await readRequired(mapPath, failures)
				if (mapBytes) {
					try {
						const map = JSON.parse(mapBytes.toString("utf8"))
						const matches = (map.sources ?? [])
							.map((source, index) => ({ source: String(source), index }))
							.filter(({ source }) => /(?:^|\/)dist\/pptxgen\.es\.mjs$/.test(source))
						if (matches.length !== 1) {
							failures.push(
								`${path.relative(appRoot, mapPath)}: expected one PptxGenJS ESM source, found ${matches.length}`,
							)
						} else {
							const sourceContent = map.sourcesContent?.[matches[0].index]
							if (typeof sourceContent !== "string") {
								failures.push(`${path.relative(appRoot, mapPath)}: PptxGenJS ESM sourceContent is missing`)
							} else {
								sourceMapSha256 = sha256(Buffer.from(sourceContent))
								if (sourceMapSha256 !== runtimeSha256) {
									failures.push(
										`${path.relative(appRoot, mapPath)}: embedded PptxGenJS source is stale; expected ${runtimeSha256}, found ${sourceMapSha256}`,
									)
								}
							}
						}
					} catch (error) {
						failures.push(`${path.relative(appRoot, mapPath)}: invalid source map (${error.message})`)
					}
				}
			}
		}
	}

	const appAssets = path.join(appRoot, "dist", "assets")
	const appWorker = await findSingleWorker(appAssets, /^packaging-worker-.*\.js$/, "Magic Web root", failures)
	const appWorkerBytes = appWorker && (await readRequired(appWorker.path, failures))
	const appWorkerSha256 = appWorkerBytes ? sha256(appWorkerBytes) : undefined
	let rootWorkerIdentity
	if (appWorker && appWorkerBytes) {
		const appWorkerText = appWorkerBytes.toString("utf8")
		checkWorkerText(appWorker.path, appWorkerText, failures)
		rootWorkerIdentity = inspectRuntimeIdentity(
			appWorker.path,
			appWorkerText,
			expectedRuntimeIdentity,
			failures,
		)
		if (packageWorkerIdentity && rootWorkerIdentity) {
			compareRuntimeIdentity(
				packageWorkerIdentity,
				rootWorkerIdentity,
				appWorker.path,
				packageWorker?.path ?? "package Worker",
				failures,
			)
		}
		if (packageWorkerBytes && !appWorkerBytes.equals(packageWorkerBytes)) {
			failures.push(
				`${path.relative(appRoot, appWorker.path)}: root Worker differs from package Worker; expected ${packageWorkerSha256}, found ${appWorkerSha256}`,
			)
		}
		await verifyRootWorkerReference(appAssets, appWorker.name, failures)
	}

	const rootIdentityFiles = await findRuntimeIdentityFiles(appAssets, appWorker?.name)
	for (const file of rootIdentityFiles) {
		const source = await readFile(file, "utf8")
		const identity = inspectRuntimeIdentity(file, source, expectedRuntimeIdentity, failures)
		if (identity && rootWorkerIdentity) {
			compareRuntimeIdentity(rootWorkerIdentity, identity, file, appWorker?.path ?? "root Worker", failures)
		}
	}

	return result(failures, {
		edition,
		artifactSha256,
		runtimeSha256,
		sourceMapSha256,
		packageWorkerSha256,
		rootWorkerSha256: appWorkerSha256,
		packageIdentity,
		packageWorkerIdentity,
		rootWorkerIdentity,
		rootIdentityFiles: rootIdentityFiles.map((file) => path.relative(appRoot, file)),
		packageWorker: packageWorker?.name,
		rootWorker: appWorker?.name,
		sourceCommit: manifest?.sourceCommit,
	})
}

function result(failures, evidence = {}) {
	return { ok: failures.length === 0, failures, evidence }
}

function checkWorkerText(file, source, failures) {
	for (const marker of retiredWorkerMarkers) {
		if (source.includes(marker)) {
			failures.push(`${file}: retired Worker marker remains: ${marker}`)
		}
	}
	for (const required of ["beginStreaming", "writeTo"]) {
		if (!source.includes(required)) failures.push(`${file}: Worker is missing ${required}`)
	}
}

function inspectRuntimeIdentity(file, source, expected, failures) {
	try {
		const identity = extractRuntimeIdentity(source, file)
		return validateRuntimeIdentity(identity, { file, expected })
	} catch (error) {
		failures.push(error.message)
		return undefined
	}
}

function compareRuntimeIdentity(reference, actual, actualFile, referenceFile, failures) {
	try {
		assertRuntimeIdentityEqual(reference, actual, { referenceFile, actualFile })
	} catch (error) {
		failures.push(error.message)
	}
}

async function findRuntimeIdentityFiles(assetsRoot, excludedWorkerName) {
	let names
	try {
		names = await readdir(assetsRoot)
	} catch {
		return []
	}
	const matches = []
	for (const name of names) {
		if (!name.endsWith(".js") || name === excludedWorkerName) continue
		const file = path.join(assetsRoot, name)
		let source
		try {
			source = await readFile(file, "utf8")
		} catch {
			continue
		}
		if (source.includes("html2pptxVersion") && source.includes("artifactHash")) {
			try {
				extractRuntimeIdentity(source, file)
				matches.push(file)
			} catch {
				// A source module may contain validation text without the injected object.
			}
		}
	}
	return matches
}

async function verifyRootWorkerReference(assetsRoot, workerName, failures) {
	let names
	try {
		names = await readdir(assetsRoot)
	} catch (error) {
		failures.push(`${assetsRoot}: unable to inspect root assets (${error.message})`)
		return
	}
	let references = 0
	for (const name of names) {
		if (!name.endsWith(".js") || name === workerName) continue
		const file = path.join(assetsRoot, name)
		let source
		try {
			source = await readFile(file, "utf8")
		} catch {
			continue
		}
		if (source.includes(workerName)) references += 1
	}
	if (references === 0) {
		failures.push(`${path.relative(path.dirname(assetsRoot), assetsRoot)}: root Worker ${workerName} is not referenced by an application chunk`)
	}
}

async function findSingleWorker(assetsRoot, pattern, label, failures) {
	let names
	try {
		names = (await readdir(assetsRoot)).filter((name) => pattern.test(name)).sort()
	} catch (error) {
		failures.push(`${assetsRoot}: ${label} Worker directory is unavailable (${error.message})`)
		return undefined
	}
	if (names.length !== 1) {
		failures.push(`${assetsRoot}: expected exactly one ${label} Worker, found ${names.length}`)
		return undefined
	}
	return { name: names[0], path: path.join(assetsRoot, names[0]) }
}

async function readRequired(file, failures) {
	try {
		return await readFile(file)
	} catch (error) {
		failures.push(`${file}: required artifact is unavailable (${error.message})`)
		return undefined
	}
}

async function readJsonRequired(file, failures) {
	const bytes = await readRequired(file, failures)
	if (!bytes) return undefined
	try {
		return JSON.parse(bytes.toString("utf8"))
	} catch (error) {
		failures.push(`${file}: invalid JSON (${error.message})`)
		return undefined
	}
}

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex")
}

function readTarEntry(tarball, expectedName) {
	for (let offset = 0; offset + 512 <= tarball.byteLength; ) {
		const header = tarball.subarray(offset, offset + 512)
		if (header.every((byte) => byte === 0)) return undefined
		const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "")
		const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "")
		const entryName = prefix ? `${prefix}/${name}` : name
		const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim()
		const size = sizeText ? parseInt(sizeText, 8) : 0
		const bodyStart = offset + 512
		if (entryName === expectedName) return tarball.subarray(bodyStart, bodyStart + size)
		offset = bodyStart + Math.ceil(size / 512) * 512
	}
	return undefined
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const verification = await verifyBuiltRuntimeChain()
	if (!verification.ok) {
		console.error("[html2pptx built runtime chain] failed")
		for (const failure of verification.failures) console.error(`- ${failure}`)
		process.exitCode = 1
	} else {
		console.log(`[html2pptx built runtime chain] passed ${JSON.stringify(verification.evidence)}`)
	}
}
