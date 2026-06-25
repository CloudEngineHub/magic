const http = require("node:http")
const https = require("node:https")
const fs = require("node:fs")
const path = require("node:path")
const { URL } = require("node:url")
const dns = require("node:dns")

const fsp = fs.promises

const LOG_PREFIX = "[HtmlSandbox]"
const DEFAULT_PORT = 80
const DEFAULT_HOST = "0.0.0.0"
const rootDir = __dirname
const projectRoot = path.resolve(rootDir, "..", "..")
const cliArgs = parseArgs(process.argv.slice(2))
const port = resolvePort(cliArgs.port || process.env.HTML_SANDBOX_PORT || process.env.PORT)
// 绑定的网卡地址。默认 0.0.0.0（监听全部）；本地多域名隔离时可指定 127.0.0.2，
// 与 magic-web 占用的 127.0.0.1 区分，从而让两套服务各自独占同一端口（如 443）。
const host = resolveHost(cliArgs.host || process.env.HTML_SANDBOX_HOST || process.env.HOST)

const indexPath = path.join(rootDir, "index.html")
const keyPath = path.join(rootDir, "certs", "localhost-key.pem")
const certPath = path.join(rootDir, "certs", "localhost.pem")
const localRuntimePath = path.join(rootDir, "iframe-runtime.js")
const runtimePlaceholder = "__MAGIC_IFRAME_RUNTIME_INLINE_PLACEHOLDER__"
const devEventsPathname = "/__html-sandbox-events"
const defaultRuntimeEntry = path.join(rootDir, "src", "auto-start.ts")
const runtimeEntry = resolveRuntimeEntry(
	cliArgs.runtimeEntry ||
		process.env.MAGIC_HTML_SANDBOX_RUNTIME_ENTRY ||
		process.env.HTML_SANDBOX_RUNTIME_ENTRY,
)
const runtimeWatchPollMs = resolvePositiveNumber(
	cliArgs.watchInterval ||
		process.env.HTML_SANDBOX_WATCH_INTERVAL_MS ||
		process.env.HTML_SANDBOX_POLL_INTERVAL_MS,
	500,
)
const rebuildDebounceMs = 120
const runtimeCommentPlaceholder = `/*${runtimePlaceholder}*/`

// 主工程 public/packages 目录，用于代理 /packages 请求（与 MAGIC_CDNHOST 同源，iframe 内静态资源）。
const publicPackagesDir = path.resolve(projectRoot, "public", "packages")

const MIME_TYPES = {
	".js": "application/javascript",
	".mjs": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
}

const CACHEABLE_STATIC_EXTENSIONS = new Set([".js", ".mjs", ".css"])
const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"content-length",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
])

let devAssets = null
let devAssetsBuildPromise = null
let watchedPaths = []
let watchedMtimes = new Map()
let watchPollTimer = null
let rebuildTimer = null
let reloadSequence = 0
const eventClients = new Set()

const resolver = new dns.Resolver()
resolver.setServers(["223.6.6.6", "223.5.5.5", "1.1.1.1"])

function parseArgs(argv) {
	const result = {}
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]
		if (arg === "--") continue
		if (arg === "--runtime-entry") {
			result.runtimeEntry = argv[i + 1]
			i += 1
			continue
		}
		if (arg.startsWith("--runtime-entry=")) {
			result.runtimeEntry = arg.slice("--runtime-entry=".length)
			continue
		}
		if (arg === "--port") {
			result.port = argv[i + 1]
			i += 1
			continue
		}
		if (arg.startsWith("--port=")) {
			result.port = arg.slice("--port=".length)
			continue
		}
		if (arg === "--host") {
			result.host = argv[i + 1]
			i += 1
			continue
		}
		if (arg.startsWith("--host=")) {
			result.host = arg.slice("--host=".length)
			continue
		}
		if (arg === "--watch-interval") {
			result.watchInterval = argv[i + 1]
			i += 1
			continue
		}
		if (arg.startsWith("--watch-interval=")) {
			result.watchInterval = arg.slice("--watch-interval=".length)
		}
	}
	return result
}

function resolvePort(rawPort) {
	const parsedPort = Number(rawPort)
	if (Number.isInteger(parsedPort) && parsedPort > 0) return parsedPort
	return DEFAULT_PORT
}

function resolveHost(rawHost) {
	const trimmed = typeof rawHost === "string" ? rawHost.trim() : ""
	if (trimmed) return trimmed
	return DEFAULT_HOST
}

function resolvePositiveNumber(rawValue, fallback) {
	const parsedValue = Number(rawValue)
	if (Number.isFinite(parsedValue) && parsedValue > 0) return parsedValue
	return fallback
}

function resolveRuntimeEntry(configuredEntry) {
	if (!configuredEntry) return defaultRuntimeEntry
	if (path.isAbsolute(configuredEntry)) return configuredEntry
	return path.resolve(rootDir, configuredEntry)
}

function getServerOrigin() {
	return `http://127.0.0.2:${port}`
}

function getHttpsOptions() {
	if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return null
	return {
		key: fs.readFileSync(keyPath),
		cert: fs.readFileSync(certPath),
	}
}

function sendCors(res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "*")
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
	if (!res.headersSent) {
		res.statusCode = statusCode
		res.setHeader("Content-Type", contentType)
	}
	res.end(body)
}

function sendNoContent(res) {
	res.statusCode = 204
	res.end()
}

function getContentType(filePath) {
	return MIME_TYPES[path.extname(filePath)] || "application/octet-stream"
}

async function sendFileFromDisk(res, filePath, options = {}) {
	const {
		cache = true,
		contentType = getContentType(filePath),
		notFoundStatus = 404,
		notFoundMessage = "Not Found",
	} = options

	let stat
	try {
		stat = await fsp.stat(filePath)
	} catch {
		sendText(res, notFoundStatus, notFoundMessage)
		return
	}

	if (!stat.isFile()) {
		sendText(res, notFoundStatus, notFoundMessage)
		return
	}

	res.setHeader("Content-Type", contentType)
	if (cache && CACHEABLE_STATIC_EXTENSIONS.has(path.extname(filePath))) {
		res.setHeader("Cache-Control", "public, max-age=3600")
	} else if (!cache) {
		setNoCacheHeaders(res)
	}

	const stream = fs.createReadStream(filePath)
	stream.on("error", (error) => {
		if (!res.headersSent) {
			sendText(res, 500, `Failed to read file: ${error.message}`)
			return
		}
		res.destroy(error)
	})
	stream.pipe(res)
}

function resolveEsbuild() {
	try {
		return require(
			require.resolve("esbuild", {
				paths: [rootDir, projectRoot],
			}),
		)
	} catch (directError) {
		try {
			const vitePackagePath = require.resolve("vite/package.json", {
				paths: [rootDir, projectRoot],
			})
			const viteDir = path.dirname(vitePackagePath)
			return require(path.join(viteDir, "..", "esbuild"))
		} catch {
			throw directError
		}
	}
}

function resolveHtmlSandboxSource(subpath) {
	const normalizedSubpath = subpath.replace(/^\/+/, "")
	const basePath = path.join(rootDir, "src", normalizedSubpath)
	const candidates = [
		path.join(basePath, "index.ts"),
		path.join(basePath, "index.tsx"),
		`${basePath}.ts`,
		`${basePath}.tsx`,
		basePath,
	]
	return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function normalizePath(filePath) {
	return filePath.replace(/\\/g, "/")
}

function toAbsoluteInputPath(inputPath) {
	if (path.isAbsolute(inputPath)) return inputPath

	const candidates = [
		path.resolve(process.cwd(), inputPath),
		path.resolve(rootDir, inputPath),
		path.resolve(projectRoot, inputPath),
	]

	return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function getFileMtimeMs(filePath) {
	try {
		return fs.statSync(filePath).mtimeMs
	} catch {
		return 0
	}
}

function createHtmlSandboxAliasPlugin() {
	return {
		name: "html-sandbox-workspace-alias",
		setup(buildContext) {
			buildContext.onResolve({ filter: /^@\// }, (args) => ({
				path: path.resolve(projectRoot, "src", args.path.slice(2)),
			}))

			buildContext.onResolve({ filter: /^@dtyq\/html-sandbox$/ }, () => ({
				path: path.join(rootDir, "src", "index.ts"),
			}))

			buildContext.onResolve({ filter: /^@dtyq\/html-sandbox\/(.+)$/ }, (args) => {
				const subpath = args.path.replace(/^@dtyq\/html-sandbox\/?/, "")
				const resolved = resolveHtmlSandboxSource(subpath)
				if (!resolved) return null
				return { path: resolved }
			})
		},
	}
}

function encodeInlineRuntimeContent(content) {
	return Buffer.from(content, "utf8").toString("base64")
}

function buildIndexHtmlWithRuntime(indexHtml, runtimeSource) {
	if (!indexHtml.includes(runtimePlaceholder)) {
		throw new Error(`runtime placeholder not found: ${indexPath}`)
	}

	const encodedRuntimeSource = encodeInlineRuntimeContent(runtimeSource)
	const runtimePlaceholderToReplace = indexHtml.includes(runtimeCommentPlaceholder)
		? runtimeCommentPlaceholder
		: runtimePlaceholder
	return indexHtml
		.replace(runtimePlaceholderToReplace, () => encodedRuntimeSource)
		.replaceAll(JSON.stringify(runtimePlaceholder), '""')
}

async function bundleRuntimeForDev() {
	if (!fs.existsSync(runtimeEntry)) {
		throw new Error(`runtime entry not found: ${runtimeEntry}`)
	}

	const { build } = resolveEsbuild()
	const result = await build({
		entryPoints: [runtimeEntry],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "MagicHtmlSandboxRuntime",
		target: "es2018",
		platform: "browser",
		sourcemap: false,
		metafile: true,
		legalComments: "none",
		plugins: [createHtmlSandboxAliasPlugin()],
		banner: {
			js: "/* html-sandbox runtime - dev bundle */",
		},
	})

	const outputFile = result.outputFiles && result.outputFiles[0]
	if (!outputFile) throw new Error("runtime bundle produced no output")
	const inputPaths = Object.keys(result.metafile?.inputs || {}).map(toAbsoluteInputPath)
	return { source: outputFile.text, inputPaths }
}

function createDevReloadClient(version) {
	return `<script data-html-sandbox-dev-client="true">
;(function setupHtmlSandboxDevReload() {
	if (window.__MAGIC_HTML_SANDBOX_DEV_RELOAD__) return
	window.__MAGIC_HTML_SANDBOX_DEV_RELOAD__ = true
	window.__MAGIC_HTML_SANDBOX_RUNTIME_VERSION__ = ${JSON.stringify(version)}
	if (!window.EventSource) return
	if (
		window.__MAGIC_HTML_SANDBOX_DEV_EVENT_SOURCE__ &&
		typeof window.__MAGIC_HTML_SANDBOX_DEV_EVENT_SOURCE__.close === "function"
	) {
		window.__MAGIC_HTML_SANDBOX_DEV_EVENT_SOURCE__.close()
	}
	var source = new EventSource(${JSON.stringify(devEventsPathname)})
	window.__MAGIC_HTML_SANDBOX_DEV_EVENT_SOURCE__ = source
	source.addEventListener("reload", function (event) {
		var nextVersion = event && event.data ? event.data : ""
		if (nextVersion && nextVersion === window.__MAGIC_HTML_SANDBOX_RUNTIME_VERSION__) return
		window.__MAGIC_HTML_SANDBOX_RUNTIME_VERSION__ = nextVersion
		window.location.reload()
	})
})()
</script>`
}

function injectDevReloadClient(html, version) {
	const clientScript = createDevReloadClient(version)
	if (html.includes("</head>")) {
		return html.replace("</head>", `${clientScript}\n</head>`)
	}
	return `${clientScript}\n${html}`
}

async function buildIndexHtmlForDev(version) {
	const [indexHtml, runtimeBundle] = await Promise.all([
		fsp.readFile(indexPath, "utf-8"),
		bundleRuntimeForDev(),
	])

	const html = buildIndexHtmlWithRuntime(indexHtml, runtimeBundle.source)

	return {
		html: injectDevReloadClient(html, version),
		runtimeSource: runtimeBundle.source,
		inputPaths: runtimeBundle.inputPaths,
	}
}

function setNoCacheHeaders(res) {
	res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
	res.setHeader("Pragma", "no-cache")
	res.setHeader("Expires", "0")
}

function createRuntimeVersion() {
	reloadSequence += 1
	return `${Date.now()}-${reloadSequence}`
}

function refreshWatchedPaths(inputPaths) {
	const nextWatchedPaths = Array.from(new Set([indexPath, runtimeEntry, ...inputPaths]))
		.filter((watchPath) => fs.existsSync(watchPath))
		.sort()

	watchedPaths = nextWatchedPaths
	watchedMtimes = new Map(watchedPaths.map((watchPath) => [watchPath, getFileMtimeMs(watchPath)]))

	console.log(`${LOG_PREFIX} watching runtime inputs: ${watchedPaths.length}`)
}

function broadcastReload(version) {
	if (eventClients.size === 0) return

	const payload = `event: reload\ndata: ${version}\n\n`
	for (const res of eventClients) {
		try {
			res.write(payload)
		} catch {
			eventClients.delete(res)
		}
	}
}

async function rebuildDevAssets({ notify = false } = {}) {
	if (devAssetsBuildPromise) return devAssetsBuildPromise

	const version = createRuntimeVersion()
	devAssetsBuildPromise = buildIndexHtmlForDev(version)
		.then((nextAssets) => {
			devAssets = {
				...nextAssets,
				version,
				builtAt: Date.now(),
			}
			refreshWatchedPaths(nextAssets.inputPaths)
			if (notify) broadcastReload(version)
			console.log(`${LOG_PREFIX} runtime injected into index.html`, {
				runtimeEntry: normalizePath(path.relative(projectRoot, runtimeEntry)),
				version,
			})
			return devAssets
		})
		.finally(() => {
			devAssetsBuildPromise = null
		})

	return devAssetsBuildPromise
}

async function ensureDevAssets() {
	if (devAssets) return devAssets
	return rebuildDevAssets()
}

function scheduleDevRebuild(changedFile) {
	if (rebuildTimer) clearTimeout(rebuildTimer)

	rebuildTimer = setTimeout(() => {
		rebuildTimer = null
		rebuildDevAssets({ notify: true }).catch((error) => {
			console.error(`${LOG_PREFIX} runtime rebuild failed`, {
				changedFile: changedFile
					? normalizePath(path.relative(projectRoot, changedFile))
					: "",
				error: error.message,
			})
		})
	}, rebuildDebounceMs)
}

function pollWatchedFiles() {
	if (devAssetsBuildPromise || watchedPaths.length === 0) return

	for (const watchPath of watchedPaths) {
		const previousMtime = watchedMtimes.get(watchPath) || 0
		const nextMtime = getFileMtimeMs(watchPath)
		if (nextMtime !== previousMtime) {
			watchedMtimes.set(watchPath, nextMtime)
			console.log(`${LOG_PREFIX} runtime input changed`, {
				file: normalizePath(path.relative(projectRoot, watchPath)),
			})
			scheduleDevRebuild(watchPath)
			return
		}
	}
}

function startDevWatcher() {
	if (watchPollTimer) return

	watchPollTimer = setInterval(pollWatchedFiles, runtimeWatchPollMs)
	if (typeof watchPollTimer.unref === "function") watchPollTimer.unref()
}

function serveDevEvents(req, res) {
	res.statusCode = 200
	res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
	res.setHeader("Cache-Control", "no-cache, no-transform")
	res.setHeader("Connection", "keep-alive")
	res.setHeader("X-Accel-Buffering", "no")
	res.write(`event: connected\ndata: ${devAssets?.version || ""}\n\n`)
	eventClients.add(res)

	req.on("close", () => {
		eventClients.delete(res)
	})
}

async function serveIndex(res) {
	try {
		const assets = await ensureDevAssets()
		res.setHeader("Content-Type", "text/html; charset=utf-8")
		setNoCacheHeaders(res)
		res.end(assets.html)
	} catch (error) {
		console.error(`${LOG_PREFIX} index runtime injection failed`, {
			runtimeEntry,
			error: error.message,
		})
		sendText(res, 500, `Index runtime injection failed: ${error.message}`)
	}
}

function customLookup(hostname, options, callback) {
	resolver.resolve4(hostname, (error, addresses) => {
		if (!error && addresses && addresses.length > 0) {
			callback(null, addresses[0], 4)
			return
		}

		dns.lookup(hostname, options, callback)
	})
}

function copyProxyHeaders(proxyRes, res) {
	Object.entries(proxyRes.headers).forEach(([key, value]) => {
		if (!key) return
		if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return
		if (value !== undefined) res.setHeader(key, value)
	})
}

function proxyRequest(targetUrl, res, depth = 0) {
	const maxDepth = 3
	const client = targetUrl.protocol === "https:" ? https : http
	const headers = {
		Host: targetUrl.host,
		"User-Agent": "Magic-HtmlSandbox-Proxy/1.0",
		Accept: "*/*",
	}

	const request = client.request(
		targetUrl,
		{
			method: "GET",
			headers,
			lookup: customLookup,
		},
		(proxyRes) => {
			const statusCode = proxyRes.statusCode || 200
			const location = proxyRes.headers.location

			if (statusCode >= 300 && statusCode < 400 && location && depth < maxDepth) {
				try {
					const nextUrl = new URL(location, targetUrl)
					proxyRes.resume()
					proxyRequest(nextUrl, res, depth + 1)
					return
				} catch (error) {
					console.error(`${LOG_PREFIX} redirect parse failed`, {
						location,
						error: error.message,
					})
				}
			}

			res.statusCode = statusCode
			copyProxyHeaders(proxyRes, res)
			proxyRes.pipe(res)
		},
	)

	request.on("error", (error) => {
		console.error(`${LOG_PREFIX} proxy error`, {
			url: targetUrl.toString(),
			error: error.message,
		})
		if (!res.writableEnded) {
			sendText(res, 502, `Proxy error: ${error.message}`)
		}
	})

	request.setTimeout(15000, () => {
		console.error(`${LOG_PREFIX} proxy timeout`, { url: targetUrl.toString() })
		request.destroy(new Error("Proxy timeout"))
	})

	request.end()
}

function resolvePublicPackagesFile(pathname) {
	if (!pathname || pathname === "/") return null
	let rel = pathname.replace(/^\/+/, "")
	if (rel.startsWith("packages/")) {
		rel = rel.slice("packages/".length)
	}
	if (!rel) return null

	// 防止 iframe 中拼出的静态资源路径穿越到 public/packages 以外。
	const segments = rel
		.split("/")
		.filter((segment) => segment && segment !== "." && segment !== "..")
	if (segments.length === 0) return null

	const resolved = path.resolve(path.join(publicPackagesDir, ...segments))
	const safeRel = path.relative(publicPackagesDir, resolved)
	if (safeRel.startsWith("..") || path.isAbsolute(safeRel)) return null
	return resolved
}

function isPackagesPathname(pathname) {
	return pathname === "/packages" || pathname.startsWith("/packages/")
}

function getPublicPackagesPathname(pathname) {
	if (isPackagesPathname(pathname)) return pathname

	// document URL 为 .../index.html 时，相对资源会变成 /index.html/...
	if (!pathname.startsWith("/index.html/")) return null

	const suffix = pathname.slice("/index.html".length)
	if (!suffix || suffix === "/") return null

	const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`
	return isPackagesPathname(normalizedSuffix) ? normalizedSuffix : null
}

async function servePublicPackageIfMatched(pathname, res) {
	const packagesPathname = getPublicPackagesPathname(pathname)
	if (!packagesPathname) return false

	const resolved = resolvePublicPackagesFile(packagesPathname)
	if (!resolved) {
		sendText(res, 404, "Not Found")
		return true
	}

	await sendFileFromDisk(res, resolved)
	return true
}

async function serveRuntime(res) {
	if (fs.existsSync(localRuntimePath)) {
		await sendFileFromDisk(res, localRuntimePath, {
			cache: false,
			contentType: "application/javascript; charset=utf-8",
			notFoundMessage: "Runtime not found",
		})
		return
	}

	try {
		const assets = await ensureDevAssets()
		res.setHeader("Content-Type", "application/javascript; charset=utf-8")
		setNoCacheHeaders(res)
		res.end(assets.runtimeSource)
	} catch (error) {
		console.error(`${LOG_PREFIX} runtime bundle failed`, {
			runtimeEntry,
			error: error.message,
		})
		sendText(res, 500, `Runtime bundle failed: ${error.message}`)
	}
}

function serveProxy(requestUrl, res) {
	const target = requestUrl.searchParams.get("url")
	if (!target) {
		sendText(res, 400, "Missing url")
		return
	}

	let targetUrl
	try {
		targetUrl = new URL(target)
	} catch (error) {
		sendText(res, 400, `Invalid url: ${error.message}`)
		return
	}

	if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
		sendText(res, 400, "Invalid url protocol")
		return
	}

	sendCors(res)
	proxyRequest(targetUrl, res)
}

async function handleRequest(req, res) {
	if (!req.url) {
		sendText(res, 400, "Bad Request")
		return
	}

	const startedAt = Date.now()
	res.on("finish", () => {
		const duration = Date.now() - startedAt
		console.log(`${LOG_PREFIX} ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`)
	})

	let requestUrl
	try {
		requestUrl = new URL(req.url, getServerOrigin())
	} catch (error) {
		sendText(res, 400, `Invalid request url: ${error.message}`)
		return
	}

	const { pathname } = requestUrl

	if (req.method === "OPTIONS") {
		sendCors(res)
		sendNoContent(res)
		return
	}

	if (pathname === devEventsPathname) {
		serveDevEvents(req, res)
		return
	}

	if (pathname.startsWith("/proxy")) {
		serveProxy(requestUrl, res)
		return
	}

	if (pathname === "/iframe-runtime.js") {
		await serveRuntime(res)
		return
	}

	if (await servePublicPackageIfMatched(pathname, res)) return

	if (pathname === "/" || pathname === "/index.html") {
		await serveIndex(res)
		return
	}

	sendText(res, 404, "Not Found")
}

const requestHandler = (req, res) => {
	handleRequest(req, res).catch((error) => {
		console.error(`${LOG_PREFIX} request failed`, { error: error.message })
		if (!res.headersSent && !res.writableEnded) {
			sendText(res, 500, `Internal Server Error: ${error.message}`)
			return
		}
		if (!res.writableEnded) res.end()
	})
}

function createServer() {
	const forceHttp = process.env.RENDER_SITE_FORCE_HTTP === "true"
	const httpsOptions = forceHttp ? null : getHttpsOptions()
	const server = httpsOptions
		? https.createServer(httpsOptions, requestHandler)
		: http.createServer(requestHandler)

	server.on("error", (error) => {
		console.error(`${LOG_PREFIX} server error`, { error: error.message })
		process.exitCode = 1
	})

	return { server, httpsOptions }
}

function startServer() {
	const { server, httpsOptions } = createServer()
	server.listen(port, host, () => {
		const protocol = httpsOptions ? "https" : "http"
		console.log(`${LOG_PREFIX} server running at ${protocol}://${host}:${port}`)
		console.log(`${LOG_PREFIX} runtime entry: ${runtimeEntry}`)
		console.log(`${LOG_PREFIX} runtime watch interval: ${runtimeWatchPollMs}ms`)
		startDevWatcher()
		rebuildDevAssets().catch((error) => {
			console.error(`${LOG_PREFIX} initial runtime build failed`, {
				runtimeEntry,
				error: error.message,
			})
		})
	})
	return server
}

if (require.main === module) {
	startServer()
}

module.exports = {
	buildIndexHtmlWithRuntime,
	encodeInlineRuntimeContent,
	startServer,
}
