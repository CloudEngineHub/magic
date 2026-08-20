import { createHash } from "node:crypto"
import { access, readFile, readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import ts from "typescript"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const magicWebRoot = path.resolve(packageRoot, "../..")

const forbiddenIdentifiers = new Set([
	"exportPPTX",
	"generatePPTX",
	"createPptxExporter",
	"createPptxGenerator",
	"runExportPipeline",
	"PackagePresentationInput",
	"PackagePresentationWorkerRequest",
	"PackagePresentationWorkerSuccess",
	"PackagePresentationWorkerError",
	"PackagePresentationWorkerResponse",
	"IncrementalPresentationPackager",
	"CreateIncrementalPresentationPackagerInput",
	"IncrementalPackagingWorkerRequest",
	"IncrementalPackagingWorkerResponse",
	"IncrementalSlideBatch",
	"encodeSlideMediaRels",
	"srcBytes",
	"coverBytes",
])

const removedFiles = [
	"src/packaging/package-presentation.ts",
	"src/packaging/incremental-package-presentation.ts",
	"src/packaging/incremental-types.ts",
	"src/packaging/package-presentation.worker.ts",
	"enterprise/src/packaging/package-presentation.worker.ts",
	"src/pipeline/export-slides.ts",
	"src/materialize/image-to-base64.ts",
	"src/materialize/image-capture.ts",
	"src/materialize/video-first-frame.ts",
	"src/materialize/resolve-captures.ts",
	"src/materialize/materialize-video-covers.ts",
	"src/shared/fetch.ts",
	"src/drawer/data-url.ts",
	"src/workers/image-pool.ts",
	"src/workers/image-worker.ts",
]

const scanRoots = [
	path.join(packageRoot, "src"),
	path.join(packageRoot, "enterprise/src"),
	path.join(packageRoot, "customer/src"),
	path.join(magicWebRoot, "src"),
	path.join(magicWebRoot, "enterprise/src"),
	path.join(magicWebRoot, "customer/src"),
]

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"])
const expectedPptxGenJs = {
	name: "pptxgenjs",
	version: "5.0.0",
	sourceCommit: "137cd01cab5c3e5f65951f7f9fb49496318273aa",
}
const violations = []
let scannedFiles = 0

for (const relativePath of removedFiles) {
	const absolutePath = path.join(packageRoot, relativePath)
	if (await exists(absolutePath)) report(absolutePath, "removed implementation file still exists")
}

for (const root of scanRoots) {
	if (!(await exists(root))) continue
	for (const file of await collectSourceFiles(root)) {
		scannedFiles += 1
		inspectSourceFile(file, await readFile(file, "utf8"))
	}
}

await verifyPackageMetadata()
await verifyPublicEntry()
await verifyBuiltEntryIfPresent()

if (violations.length > 0) {
	console.error("[html2pptx streaming gate] failed")
	for (const violation of violations) console.error(`- ${violation}`)
	process.exitCode = 1
} else {
	console.log(
		`[html2pptx streaming gate] passed: ${scannedFiles} production source files; v5 destination-only contract`,
	)
}

function inspectSourceFile(file, sourceText) {
	const sourceFile = ts.createSourceFile(
		file,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		resolveScriptKind(file),
	)
	const packageSource = isInside(file, path.join(packageRoot, "src"))

	const visit = (node) => {
		if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) {
			reportNode(file, sourceFile, node, `forbidden legacy identifier ${node.text}`)
		}

		if (packageSource && ts.isPropertyAssignment(node) && propertyName(node.name) === "outputType") {
			reportNode(file, sourceFile, node, "buffered PptxGenJS outputType is forbidden")
		}

		if (packageSource && ts.isPropertyAccessExpression(node)) {
			const method = node.name.text
			const receiver = ts.isIdentifier(node.expression) ? node.expression.text : ""
			if (
				["write", "writeFile", "stream"].includes(method) &&
				/^(?:pres|pptx|presentation|deck|powerpoint)$/i.test(receiver) &&
				ts.isCallExpression(node.parent)
			) {
				reportNode(file, sourceFile, node, `buffered PptxGenJS ${receiver}.${method}() is forbidden`)
			}
			if (method === "generateAsync" && ts.isCallExpression(node.parent)) {
				reportNode(file, sourceFile, node, "JSZip generateAsync() is forbidden in production")
			}
		}

		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
}

async function verifyPackageMetadata() {
	const packageJsonPath = path.join(packageRoot, "package.json")
	const appPackageJsonPath = path.join(magicWebRoot, "package.json")
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))
	const appPackageJson = JSON.parse(await readFile(appPackageJsonPath, "utf8"))

	const peer = packageJson.peerDependencies?.pptxgenjs
	if (peer !== ">=5.0.0 <6") {
		report(packageJsonPath, `peerDependencies.pptxgenjs must be \">=5.0.0 <6\"; found ${String(peer)}`)
	}

	for (const [manifestPath, manifest] of [
		[packageJsonPath, packageJson],
		[appPackageJsonPath, appPackageJson],
	]) {
		for (const group of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
			const specifier = manifest[group]?.pptxgenjs
			if (!specifier) continue
			if (/(?:^|[^0-9])4(?:\.|$)/.test(specifier)) {
				report(manifestPath, `${group}.pptxgenjs still targets v4: ${specifier}`)
			}
			if (specifier.startsWith("file:")) {
				await verifyLocalPptxGenJs(manifestPath, specifier)
			}
		}
	}

	const patchedDependencies = appPackageJson.pnpm?.patchedDependencies ?? {}
	for (const [dependency, patch] of Object.entries(patchedDependencies)) {
		if (dependency.startsWith("pptxgenjs@")) {
			report(appPackageJsonPath, `retired PptxGenJS patch remains: ${dependency} -> ${patch}`)
		}
	}

	const lockfilePath = path.join(magicWebRoot, "pnpm-lock.yaml")
	const lockfile = await readFile(lockfilePath, "utf8")
	if (/pptxgenjs@4\.0\.1|patches\/pptxgenjs@4\.0\.1\.patch/.test(lockfile)) {
		report(lockfilePath, "lockfile still contains the retired pptxgenjs@4.0.1 package or patch")
	}
}

async function verifyLocalPptxGenJs(manifestPath, specifier) {
	const dependencyPath = path.resolve(path.dirname(manifestPath), specifier.slice("file:".length))
	if (!isInsideOrEqual(dependencyPath, magicWebRoot)) {
		report(manifestPath, `local PptxGenJS dependency must stay inside Magic Web: ${dependencyPath}`)
		return
	}
	if (path.extname(dependencyPath) !== ".tgz") {
		report(manifestPath, `local PptxGenJS dependency must be a vendored .tgz: ${dependencyPath}`)
		return
	}
	if (!(await exists(dependencyPath))) {
		report(manifestPath, `vendored PptxGenJS tarball is unavailable: ${dependencyPath}`)
		return
	}
	if (!(await stat(dependencyPath)).isFile()) {
		report(manifestPath, `vendored PptxGenJS dependency is not a file: ${dependencyPath}`)
		return
	}

	const resolvedMagicWebRoot = await realpath(magicWebRoot)
	const resolvedDependencyPath = await realpath(dependencyPath)
	if (!isInsideOrEqual(resolvedDependencyPath, resolvedMagicWebRoot)) {
		report(manifestPath, `vendored PptxGenJS tarball resolves outside Magic Web: ${resolvedDependencyPath}`)
		return
	}

	const provenancePath = dependencyPath.replace(/\.tgz$/, ".manifest.json")
	if (!(await exists(provenancePath))) {
		report(manifestPath, `vendored PptxGenJS manifest is unavailable: ${provenancePath}`)
		return
	}
	if (!(await stat(provenancePath)).isFile()) {
		report(manifestPath, `vendored PptxGenJS manifest is not a file: ${provenancePath}`)
		return
	}
	const resolvedProvenancePath = await realpath(provenancePath)
	if (!isInsideOrEqual(resolvedProvenancePath, resolvedMagicWebRoot)) {
		report(manifestPath, `vendored PptxGenJS manifest resolves outside Magic Web: ${resolvedProvenancePath}`)
		return
	}

	let provenance
	try {
		provenance = JSON.parse(await readFile(provenancePath, "utf8"))
	} catch (error) {
		report(provenancePath, `vendored PptxGenJS manifest is invalid JSON: ${error.message}`)
		return
	}

	if (provenance.name !== expectedPptxGenJs.name) {
		report(provenancePath, `name must be ${expectedPptxGenJs.name}; found ${String(provenance.name)}`)
	}
	if (provenance.version !== expectedPptxGenJs.version) {
		report(provenancePath, `version must be ${expectedPptxGenJs.version}; found ${String(provenance.version)}`)
	}
	if (provenance.sourceCommit !== expectedPptxGenJs.sourceCommit) {
		report(provenancePath, `sourceCommit must be ${expectedPptxGenJs.sourceCommit}; found ${String(provenance.sourceCommit)}`)
	}
	if (provenance.artifact !== path.basename(dependencyPath)) {
		report(
			provenancePath,
			`artifact must match ${path.basename(dependencyPath)}; found ${String(provenance.artifact)}`,
		)
	}
	if (!/^[0-9a-f]{64}$/i.test(provenance.sha256 ?? "")) {
		report(provenancePath, `sha256 must be a 64-character digest; found ${String(provenance.sha256)}`)
		return
	}

	const actualSha256 = createHash("sha256").update(await readFile(dependencyPath)).digest("hex")
	if (actualSha256 !== provenance.sha256.toLowerCase()) {
		report(provenancePath, `sha256 mismatch: expected ${provenance.sha256}; calculated ${actualSha256}`)
	}
	await verifyInstalledPptxGenJs(dependencyPath, provenancePath)
}

/**
 * A frozen install can leave a file: dependency linked to an older unpacked
 * tarball when the filename and version stay unchanged. Compare the files the
 * build actually imports with the exact vendored tarball so a green source
 * gate cannot certify a stale Worker bundle.
 */
async function verifyInstalledPptxGenJs(tarballPath, provenancePath) {
	const installedPath = path.join(packageRoot, "node_modules", "pptxgenjs")
	if (!(await exists(installedPath))) {
		report(provenancePath, `installed PptxGenJS package is unavailable: ${installedPath}`)
		return
	}
	const tarball = gunzipSync(await readFile(tarballPath))
	const runtimeFiles = ["dist/pptxgen.cjs.js", "dist/pptxgen.es.mjs", "types/index.d.ts"]
	for (const relativePath of runtimeFiles) {
		const installedFile = path.join(installedPath, relativePath)
		if (!(await exists(installedFile))) {
			report(provenancePath, `installed PptxGenJS file is unavailable: ${installedFile}`)
			continue
		}
		const tarEntry = readTarEntry(tarball, `package/${relativePath}`)
		if (!tarEntry) {
			report(provenancePath, `vendored PptxGenJS tarball is missing package/${relativePath}`)
			continue
		}
		const installedHash = createHash("sha256").update(await readFile(installedFile)).digest("hex")
		const tarHash = createHash("sha256").update(tarEntry).digest("hex")
		if (installedHash !== tarHash) {
			report(
				provenancePath,
				`installed PptxGenJS ${relativePath} is stale: expected ${tarHash}, found ${installedHash}`,
			)
		}
	}
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

async function verifyPublicEntry() {
	const entryPath = path.join(packageRoot, "src/index.ts")
	const entry = await readFile(entryPath, "utf8")
	if (!/export const exportPPTXStreaming\b/.test(entry)) {
		report(entryPath, "exportPPTXStreaming is missing from the public source entry")
	}
}

async function verifyBuiltEntryIfPresent() {
	const declarationPath = path.join(packageRoot, "dist/index.d.ts")
	if (!(await exists(declarationPath))) return
	const declaration = await readFile(declarationPath, "utf8")
	for (const name of forbiddenIdentifiers) {
		if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(declaration)) {
			report(declarationPath, `built declaration exposes forbidden legacy symbol ${name}`)
		}
	}
	if (!/export declare const exportPPTXStreaming\b/.test(declaration)) {
		report(declarationPath, "built declaration is missing exportPPTXStreaming")
	}
}

async function collectSourceFiles(root) {
	const files = []
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (["dist", "node_modules", "coverage"].includes(entry.name)) continue
		const absolutePath = path.join(root, entry.name)
		if (entry.isDirectory()) files.push(...(await collectSourceFiles(absolutePath)))
		else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(absolutePath)
	}
	return files
}

function resolveScriptKind(file) {
	if (file.endsWith(".tsx")) return ts.ScriptKind.TSX
	if (file.endsWith(".jsx")) return ts.ScriptKind.JSX
	if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JS
	return ts.ScriptKind.TS
}

function propertyName(name) {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
	return ""
}

function reportNode(file, sourceFile, node, message) {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
	report(file, `${line + 1}:${character + 1} ${message}`)
}

function report(file, message) {
	violations.push(`${path.relative(magicWebRoot, file)}: ${message}`)
}

function isInside(file, directory) {
	const relative = path.relative(directory, file)
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function isInsideOrEqual(file, directory) {
	const relative = path.relative(directory, file)
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function exists(file) {
	try {
		await access(file)
		return true
	} catch {
		return false
	}
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
