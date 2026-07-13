import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import type { Plugin } from "vite"

export interface VitePluginSrcOverlayOptions {
	projectRoot: string
	layers: SrcOverlayLayerOption[]
	profileEnvName?: string
}

export interface SrcOverlayLayerOption {
	name: string
	dir: string
	reloadOnChange?: boolean
}

interface OverlayLayer {
	name: string
	root: string
	rootWithSeparator: string
	requestPrefix: string
	reloadOnChange: boolean
	resolveIndex: Map<string, string>
}

interface OverlayProfileStats {
	resolveIdCalls: number
	nonOverlaySkips: number
	requestCacheHits: number
	logicalPathCacheHits: number
	logicalPathCacheMisses: number
	logicalImportPathMisses: number
	resolveMisses: number
	indexBuildRuns: number
	indexBuildTimeMs: number
	layerHits: Record<string, number>
	layerIndexEntries: Record<string, number>
}

interface OverlayProfileSession {
	command: "build" | "serve"
	hasPrintedSummary: boolean
}

const RESOLVE_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".css",
	".less",
	".scss",
	".sass",
	".svg",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
]
const DIRECTORY_INDEX_PRIORITY_OFFSET = RESOLVE_EXTENSIONS.length

function splitRequest(request: string): { pathname: string; suffix: string } {
	const queryIndex = request.indexOf("?")
	const hashIndex = request.indexOf("#")
	const suffixStart =
		queryIndex === -1
			? hashIndex
			: hashIndex === -1
				? queryIndex
				: Math.min(queryIndex, hashIndex)
	if (suffixStart === -1) return { pathname: request, suffix: "" }

	return {
		pathname: request.slice(0, suffixStart),
		suffix: request.slice(suffixStart),
	}
}

function normalizeRequestPrefix(relativeDir: string): string {
	const normalized = path.normalize(relativeDir).split(path.sep).join("/")
	return `/${normalized.replace(/^\/+|\/+$/g, "")}/`
}

function createOverlayLayers({
	projectRoot,
	layerOptions,
}: {
	projectRoot: string
	layerOptions: SrcOverlayLayerOption[]
}): OverlayLayer[] {
	return layerOptions.map((layer) => {
		const root = path.resolve(projectRoot, layer.dir)
		return {
			name: layer.name,
			root,
			rootWithSeparator: `${root}${path.sep}`,
			requestPrefix: normalizeRequestPrefix(layer.dir),
			reloadOnChange: layer.reloadOnChange ?? true,
			resolveIndex: new Map<string, string>(),
		}
	})
}

function getLayerRelativePath(filePath: string, layer: OverlayLayer): string | null {
	return getSubPathRelativePath(filePath, layer.root, layer.rootWithSeparator)
}

function getLogicalPathFromRootedRequest(
	sourcePath: string,
	layers: OverlayLayer[],
): string | null {
	for (const layer of layers) {
		if (!sourcePath.startsWith(layer.requestPrefix)) continue
		return sourcePath.slice(layer.requestPrefix.length)
	}

	return null
}

function isOverlayCandidate(
	source: string,
	importerLogicalPath: string | null,
	layers: OverlayLayer[],
): boolean {
	if (getLogicalPathFromRootedRequest(source, layers) !== null) return true
	if (path.isAbsolute(source)) {
		return layers.some((layer) => getLayerRelativePath(source, layer) !== null)
	}
	if (isRelativeImport(source)) return importerLogicalPath !== null

	return source.startsWith("@/")
}

function isRelativeImport(source: string): boolean {
	return source.startsWith("./") || source.startsWith("../")
}

function getPathStat(filePath: string): fs.Stats | null {
	try {
		return fs.statSync(filePath)
	} catch {
		return null
	}
}

function isResolvableExtension(extension: string): boolean {
	return RESOLVE_EXTENSIONS.includes(extension)
}

function getResolvePriority(extension: string, isDirectoryIndex: boolean): number {
	const extensionPriority = RESOLVE_EXTENSIONS.indexOf(extension)
	if (extensionPriority === -1) return Number.MAX_SAFE_INTEGER
	if (!isDirectoryIndex) return extensionPriority

	return DIRECTORY_INDEX_PRIORITY_OFFSET + extensionPriority
}

function setResolveIndexEntry(
	resolveIndex: Map<string, string>,
	resolvePriorities: Map<string, number>,
	logicalPath: string,
	resolvedPath: string,
	priority: number,
): void {
	const normalizedLogicalPath = path.normalize(logicalPath || ".")
	const existingPriority = resolvePriorities.get(normalizedLogicalPath)
	if (existingPriority !== undefined && existingPriority <= priority) return

	resolvePriorities.set(normalizedLogicalPath, priority)
	if (!resolveIndex.has(normalizedLogicalPath) || existingPriority !== priority)
		resolveIndex.set(normalizedLogicalPath, resolvedPath)
}

function indexResolvedPath(
	resolveIndex: Map<string, string>,
	resolvePriorities: Map<string, number>,
	rootPath: string,
	resolvedPath: string,
): void {
	const relativePath = path.relative(rootPath, resolvedPath)
	const normalizedRelativePath = path.normalize(relativePath)
	const extension = path.extname(normalizedRelativePath)

	setResolveIndexEntry(resolveIndex, resolvePriorities, normalizedRelativePath, resolvedPath, -1)
	if (!isResolvableExtension(extension)) return

	const extensionlessPath = normalizedRelativePath.slice(0, -extension.length)
	setResolveIndexEntry(
		resolveIndex,
		resolvePriorities,
		extensionlessPath,
		resolvedPath,
		getResolvePriority(extension, false),
	)

	const parsedPath = path.parse(normalizedRelativePath)
	if (parsedPath.name !== "index") return

	const directoryPath = path.normalize(parsedPath.dir || ".")
	setResolveIndexEntry(
		resolveIndex,
		resolvePriorities,
		directoryPath,
		resolvedPath,
		getResolvePriority(extension, true),
	)
}

function buildResolveIndex(rootPath: string): Map<string, string> {
	const resolveIndex = new Map<string, string>()
	const resolvePriorities = new Map<string, number>()
	if (!getPathStat(rootPath)?.isDirectory()) return resolveIndex

	const pendingDirectories = [rootPath]
	while (pendingDirectories.length > 0) {
		const currentDirectory = pendingDirectories.pop()
		if (!currentDirectory) continue

		const directoryEntries = fs.readdirSync(currentDirectory, {
			withFileTypes: true,
		})
		for (const directoryEntry of directoryEntries) {
			const entryPath = path.join(currentDirectory, directoryEntry.name)
			if (directoryEntry.isDirectory()) {
				pendingDirectories.push(entryPath)
				continue
			}
			if (!directoryEntry.isFile()) continue

			indexResolvedPath(resolveIndex, resolvePriorities, rootPath, entryPath)
		}
	}

	return resolveIndex
}

function getSubPathRelativePath(
	filePath: string,
	parentPath: string,
	parentPathWithSeparator: string,
): string | null {
	if (filePath === parentPath) return "."

	if (!filePath.startsWith(parentPathWithSeparator)) return null

	return filePath.slice(parentPathWithSeparator.length)
}

function isSubPath(filePath: string, parentPath: string, parentPathWithSeparator: string): boolean {
	return getSubPathRelativePath(filePath, parentPath, parentPathWithSeparator) !== null
}

function createOverlayProfileStats(): OverlayProfileStats {
	return {
		resolveIdCalls: 0,
		nonOverlaySkips: 0,
		requestCacheHits: 0,
		logicalPathCacheHits: 0,
		logicalPathCacheMisses: 0,
		logicalImportPathMisses: 0,
		resolveMisses: 0,
		indexBuildRuns: 0,
		indexBuildTimeMs: 0,
		layerHits: {},
		layerIndexEntries: {},
	}
}

function createOverlayProfileSession(
	command: OverlayProfileSession["command"],
): OverlayProfileSession {
	return {
		command,
		hasPrintedSummary: false,
	}
}

export default function vitePluginSrcOverlay(options: VitePluginSrcOverlayOptions): Plugin {
	const layers = createOverlayLayers({
		projectRoot: options.projectRoot,
		layerOptions: options.layers,
	})
	const resolveLayers = [...layers].reverse()
	const profileEnvName = options.profileEnvName ?? "MAGIC_PROFILE_LAYERED_OVERLAY"
	const isProfileEnabled = process.env[profileEnvName] === "true"
	const logicalPathCache = new Map<string, string | null>()
	const resolveRequestCache = new Map<string, string | null>()
	let currentCommand: OverlayProfileSession["command"] | null = null
	let profileStats = createOverlayProfileStats()
	let profileSession: OverlayProfileSession | null = null

	function buildTrackedResolveIndex(layer: OverlayLayer): Map<string, string> {
		const startTime = isProfileEnabled ? performance.now() : 0
		const resolveIndex = buildResolveIndex(layer.root)
		if (!isProfileEnabled) return resolveIndex

		profileStats.indexBuildRuns += 1
		profileStats.indexBuildTimeMs += performance.now() - startTime
		profileStats.layerIndexEntries[layer.name] = resolveIndex.size

		return resolveIndex
	}

	function rebuildResolutionIndexes(): void {
		logicalPathCache.clear()
		resolveRequestCache.clear()
		for (const layer of layers) {
			layer.resolveIndex = buildTrackedResolveIndex(layer)
		}
	}

	function resetProfileStats(): void {
		profileStats = createOverlayProfileStats()
	}

	function startProfileSession(command: OverlayProfileSession["command"]): void {
		if (!isProfileEnabled) return

		profileSession = createOverlayProfileSession(command)
		resetProfileStats()
		rebuildResolutionIndexes()
	}

	function printProfileStats(): void {
		if (!isProfileEnabled) return
		if (!profileSession) return
		if (profileSession.hasPrintedSummary) return
		profileSession.hasPrintedSummary = true

		const { indexBuildTimeMs } = profileStats
		const averageIndexBuildTimeMs =
			profileStats.indexBuildRuns === 0 ? 0 : indexBuildTimeMs / profileStats.indexBuildRuns

		console.info(`[layered-overlay] profile summary (${profileSession.command})`)
		console.info(
			`[layered-overlay] resolveIdCalls=${profileStats.resolveIdCalls} ` +
				`requestCacheHits=${profileStats.requestCacheHits} ` +
				`nonOverlaySkips=${profileStats.nonOverlaySkips}`,
		)
		console.info(
			`[layered-overlay] logicalPathCacheHits=${profileStats.logicalPathCacheHits} ` +
				`logicalPathCacheMisses=${profileStats.logicalPathCacheMisses} ` +
				`logicalImportPathMisses=${profileStats.logicalImportPathMisses}`,
		)
		console.info(
			`[layered-overlay] layerHits=${JSON.stringify(profileStats.layerHits)} ` +
				`resolveMisses=${profileStats.resolveMisses}`,
		)
		console.info(
			`[layered-overlay] indexBuildRuns=${profileStats.indexBuildRuns} ` +
				`indexBuildTimeMs=${indexBuildTimeMs.toFixed(2)} ` +
				`avgIndexBuildTimeMs=${averageIndexBuildTimeMs.toFixed(2)}`,
		)
		console.info(
			`[layered-overlay] layerIndexEntries=${JSON.stringify(profileStats.layerIndexEntries)}`,
		)
	}

	rebuildResolutionIndexes()

	function getLogicalPathFromAbsolutePath(filePath: string): string | null {
		const normalizedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
		if (logicalPathCache.has(normalizedPath)) {
			if (isProfileEnabled) profileStats.logicalPathCacheHits += 1
			return logicalPathCache.get(normalizedPath) ?? null
		}
		if (isProfileEnabled) profileStats.logicalPathCacheMisses += 1

		let logicalPath: string | null = null
		for (const layer of resolveLayers) {
			logicalPath = getLayerRelativePath(normalizedPath, layer)
			if (logicalPath) break
		}

		logicalPathCache.set(normalizedPath, logicalPath)

		return logicalPath
	}

	function getLogicalImportPath(
		sourcePath: string,
		importerLogicalPath: string | null,
	): string | null {
		// Build can expand logical imports to physical absolute paths before this hook runs.
		// Convert any configured layer path back to its logical path so resolution still
		// walks the full layer order instead of locking onto the physical importer layer.
		if (sourcePath.startsWith("@/")) return sourcePath.slice(2)
		const rootedLogicalPath = getLogicalPathFromRootedRequest(sourcePath, layers)
		if (rootedLogicalPath !== null) return rootedLogicalPath
		if (path.isAbsolute(sourcePath)) return getLogicalPathFromAbsolutePath(sourcePath)
		if (!isRelativeImport(sourcePath) || !importerLogicalPath) return null

		return path.normalize(path.join(path.dirname(importerLogicalPath), sourcePath))
	}

	function resolveFromLogicalPath(logicalPath: string): string | null {
		const normalizedLogicalPath = path.normalize(logicalPath)
		for (const layer of resolveLayers) {
			const candidate = layer.resolveIndex.get(normalizedLogicalPath)
			if (!candidate) continue
			if (isProfileEnabled)
				profileStats.layerHits[layer.name] = (profileStats.layerHits[layer.name] ?? 0) + 1
			return candidate
		}
		if (isProfileEnabled) profileStats.resolveMisses += 1

		return null
	}

	return {
		name: "vite-plugin-overlay:src",
		enforce: "pre",
		configResolved(config) {
			currentCommand = config.command
		},
		buildStart() {
			if (currentCommand !== "build") return
			startProfileSession("build")
		},
		resolveId(source, importer) {
			if (isProfileEnabled) profileStats.resolveIdCalls += 1
			if (source.startsWith("\0")) return null
			const sourceRequest = splitRequest(source)
			const importerRequest = importer ? splitRequest(importer).pathname : ""
			const importerLogicalPath = importerRequest
				? getLogicalPathFromAbsolutePath(importerRequest)
				: null
			if (!isOverlayCandidate(sourceRequest.pathname, importerLogicalPath, layers)) {
				if (isProfileEnabled) profileStats.nonOverlaySkips += 1
				return null
			}

			const requestCacheKey = `${sourceRequest.pathname}\0${importerRequest}`
			if (resolveRequestCache.has(requestCacheKey)) {
				if (isProfileEnabled) profileStats.requestCacheHits += 1
				const cachedResolvedPath = resolveRequestCache.get(requestCacheKey)
				if (!cachedResolvedPath) return null

				return `${cachedResolvedPath}${sourceRequest.suffix}`
			}
			const logicalImportPath = getLogicalImportPath(
				sourceRequest.pathname,
				importerLogicalPath,
			)
			if (!logicalImportPath) {
				if (isProfileEnabled) profileStats.logicalImportPathMisses += 1
				resolveRequestCache.set(requestCacheKey, null)
				return null
			}

			const resolvedFilePath = resolveFromLogicalPath(logicalImportPath)
			resolveRequestCache.set(requestCacheKey, resolvedFilePath)
			if (!resolvedFilePath) return null

			return `${resolvedFilePath}${sourceRequest.suffix}`
		},
		configureServer(server) {
			startProfileSession("serve")
			for (const layer of layers) {
				server.watcher.add(layer.root)
			}
			const shouldClearCache = (filePath: string): boolean =>
				layers.some((layer) => isSubPath(filePath, layer.root, layer.rootWithSeparator))
			const shouldReload = (filePath: string): boolean =>
				layers.some(
					(layer) =>
						layer.reloadOnChange &&
						isSubPath(filePath, layer.root, layer.rootWithSeparator),
				)
			const reload = (filePath: string) => {
				if (shouldClearCache(filePath)) rebuildResolutionIndexes()
				if (!shouldReload(filePath)) return
				server.ws.send({ type: "full-reload" })
			}

			server.watcher.on("add", reload)
			server.watcher.on("unlink", reload)
			server.watcher.on("addDir", reload)
			server.watcher.on("unlinkDir", reload)
			server.httpServer?.once("close", () => {
				printProfileStats()
			})
		},
		buildEnd() {
			if (currentCommand !== "build") return
			printProfileStats()
		},
	}
}
