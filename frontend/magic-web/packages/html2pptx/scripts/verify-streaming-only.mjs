import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
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
])

const removedFiles = [
	"src/packaging/package-presentation.ts",
	"src/packaging/incremental-package-presentation.ts",
	"src/packaging/incremental-types.ts",
	"src/packaging/package-presentation.worker.ts",
	"enterprise/src/packaging/package-presentation.worker.ts",
	"src/pipeline/export-slides.ts",
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
	const dependencyRoot = path.resolve(path.dirname(manifestPath), specifier.slice("file:".length))
	const dependencyManifest = path.join(dependencyRoot, "package.json")
	if (!(await exists(dependencyManifest))) {
		report(manifestPath, `local PptxGenJS dependency is unavailable: ${dependencyRoot}`)
		return
	}
	const dependency = JSON.parse(await readFile(dependencyManifest, "utf8"))
	if (dependency.name !== "pptxgenjs" || !/^5\./.test(dependency.version ?? "")) {
		report(dependencyManifest, `local dependency must be pptxgenjs v5; found ${dependency.name}@${dependency.version}`)
	}
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
