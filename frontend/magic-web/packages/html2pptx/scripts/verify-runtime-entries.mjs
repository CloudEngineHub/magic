import { createRequire } from "node:module"
import { createServer } from "node:http"
import { access, readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * P6 package-surface gate.
 *
 * This check intentionally runs after `vite build`. It exercises both published
 * module conditions (ESM and CJS), the declaration entry, and the generated
 * worker URL when the package is mounted below a CDN/sub-path. A package can
 * pass typecheck while still shipping a broken worker path, so this is kept as
 * a separate, fail-fast runtime check.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distRoot = path.join(packageRoot, "dist")
const packageJsonPath = path.join(packageRoot, "package.json")
const require = createRequire(import.meta.url)

const esmEntry = path.join(distRoot, "index.js")
const cjsEntry = path.join(distRoot, "index.cjs")
const declarationEntry = path.join(distRoot, "index.d.ts")

await assertFile(esmEntry)
await assertFile(cjsEntry)
await assertFile(declarationEntry)

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))
if (packageJson.exports?.["."]?.import !== "./dist/index.js") {
	throw new Error("package exports.import must point at ./dist/index.js")
}
if (packageJson.exports?.["."]?.require !== "./dist/index.cjs") {
	throw new Error("package exports.require must point at ./dist/index.cjs")
}
if (packageJson.exports?.["."]?.types !== "./dist/index.d.ts") {
	throw new Error("package exports.types must point at ./dist/index.d.ts")
}

const esmExports = await import(`${pathToFileURL(esmEntry).href}?p6=${Date.now()}`)
const cjsExports = require(cjsEntry)
for (const [condition, exportsObject] of [
	["ESM", esmExports],
	["CJS", cjsExports],
]) {
	for (const name of [
		"exportPPTXStreaming",
		"createPptxStreamingExporter",
		"getPptxExportDiagnostic",
		"isOpfsUnavailableError",
	]) {
		if (typeof exportsObject[name] !== "function") {
			throw new Error(`${condition} entry is missing callable export ${name}`)
		}
	}
	for (const name of [
		"exportPPTX",
		"generatePPTX",
		"createPptxExporter",
		"createPptxGenerator",
	]) {
		if (name in exportsObject) {
			throw new Error(`${condition} entry still exposes retired export ${name}`)
		}
	}
}

const declaration = await readFile(declarationEntry, "utf8")
if (!/export declare const exportPPTXStreaming\b/.test(declaration)) {
	throw new Error("declaration entry is missing exportPPTXStreaming")
}

const workerNames = (await readdir(path.join(distRoot, "assets"))).filter((name) =>
	/^packaging-worker-[^.]+\.js$/.test(name),
)
if (workerNames.length !== 1) {
	throw new Error(`expected exactly one generated Packaging Worker, found ${workerNames.length}`)
}
const workerName = workerNames[0]
const esmSource = await readFile(esmEntry, "utf8")
const workerReference = `assets/${workerName}`
if (!esmSource.includes(workerReference)) {
	throw new Error(`ESM entry does not contain the relative worker reference ${workerReference}`)
}
if (new RegExp(`['"]/${workerReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(esmSource)) {
	throw new Error(
		"ESM entry contains a root-absolute worker URL; sub-path deployments would break",
	)
}

const packageBase = new URL("https://cdn.example.test/releases/html2pptx/v5/dist/index.js")
const resolvedWorker = new URL(workerReference, packageBase)
const expectedWorker = "https://cdn.example.test/releases/html2pptx/v5/dist/assets/" + workerName
if (resolvedWorker.href !== expectedWorker) {
	throw new Error(`sub-path worker resolution mismatch: ${resolvedWorker.href}`)
}

await verifyHttpSubpathMount(workerName)

console.log(
	`[html2pptx runtime gate] passed: ESM, CJS, declarations, CDN sub-path, and Worker asset ${workerName}`,
)

async function verifyHttpSubpathMount(workerFileName) {
	const server = createServer(async (request, response) => {
		const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
		const prefix = "/cdn/html2pptx/v5/dist/"
		if (!requestUrl.pathname.startsWith(prefix)) {
			response.statusCode = 404
			response.end()
			return
		}
		const relative = requestUrl.pathname.slice(prefix.length)
		const target = path.resolve(distRoot, relative)
		if (!isInside(target, distRoot)) {
			response.statusCode = 400
			response.end()
			return
		}
		try {
			const fileStat = await stat(target)
			if (!fileStat.isFile()) throw new Error("not a file")
			const body = await readFile(target)
			response.statusCode = 200
			response.setHeader("Content-Length", String(body.byteLength))
			response.setHeader(
				"Content-Type",
				target.endsWith(".js")
					? "text/javascript; charset=utf-8"
					: "application/octet-stream",
			)
			response.end(body)
		} catch {
			response.statusCode = 404
			response.end()
		}
	})

	try {
		await new Promise((resolve, reject) => {
			server.once("error", reject)
			server.listen(0, "127.0.0.1", resolve)
		})
		const address = server.address()
		if (!address || typeof address === "string") throw new Error("sub-path server did not bind")
		const base = `http://127.0.0.1:${address.port}/cdn/html2pptx/v5/dist/`
		for (const relative of ["index.js", `assets/${workerFileName}`]) {
			const response = await fetch(new URL(relative, base))
			if (!response.ok)
				throw new Error(`sub-path fetch failed (${response.status}): ${relative}`)
			if (!(await response.arrayBuffer()).byteLength) {
				throw new Error(`sub-path fetch returned an empty asset: ${relative}`)
			}
		}
	} finally {
		await new Promise((resolve) => server.close(() => resolve()))
	}
}

async function assertFile(file) {
	try {
		await access(file)
	} catch {
		throw new Error(`required built runtime file is missing: ${file}`)
	}
}

function isInside(file, directory) {
	const relative = path.relative(directory, file)
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
