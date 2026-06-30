import type { Rollup } from "vite"

// Reuse Vite's Rollup-compatible bundle types so this plugin does not require a direct rollup dependency.
type OutputBundle = Rollup.OutputBundle
type OutputChunk = Rollup.OutputChunk

export interface WarmupAssetConfig {
	moduleMatchers: string[]
	maxAssets?: number
	includeDynamicDepth?: number
	dynamicModuleMatchers?: string[]
}

interface ViteChunkMetadata {
	importedCss?: Set<string>
}

/**
 * Collects warm-up asset URLs from configured core page chunks and their static dependencies.
 */
export function collectWarmupAssets(
	bundle: OutputBundle,
	config: WarmupAssetConfig,
): string[] {
	const assets = new Set<string>()
	const visited = new Set<string>()
	const startChunks = findStartChunks(bundle, config.moduleMatchers)

	for (const chunk of startChunks) {
		collectChunkClosure(bundle, chunk.fileName, config, assets, visited, 0)
	}

	return Array.from(assets)
		.sort()
		.slice(0, config.maxAssets ?? assets.size)
}

/**
 * Finds build output chunks that contain any configured source module matcher.
 */
function findStartChunks(bundle: OutputBundle, moduleMatchers: string[]): OutputChunk[] {
	return Object.values(bundle).filter((item): item is OutputChunk => {
		if (!isChunk(item)) return false
		return matchesModule(item, moduleMatchers)
	})
}

/**
 * Recursively collects a chunk, its CSS, and its static imports into the warm-up set.
 */
function collectChunkClosure(
	bundle: OutputBundle,
	fileName: string,
	config: WarmupAssetConfig,
	assets: Set<string>,
	visited: Set<string>,
	dynamicDepth: number,
): void {
	const visitKey = `${fileName}:${dynamicDepth}`
	if (visited.has(visitKey)) return
	visited.add(visitKey)

	const item = bundle[fileName]
	if (!isChunk(item)) return

	assets.add(toPublicUrl(item.fileName))
	for (const cssFile of getImportedCssFiles(item)) {
		assets.add(toPublicUrl(cssFile))
	}

	for (const importedFileName of item.imports) {
		collectChunkClosure(bundle, importedFileName, config, assets, visited, dynamicDepth)
	}

	const includeDynamicDepth = config.includeDynamicDepth ?? 0
	if (dynamicDepth >= includeDynamicDepth) return

	for (const dynamicFileName of item.dynamicImports) {
		const dynamicItem = bundle[dynamicFileName]
		if (!isChunk(dynamicItem)) continue
		if (!shouldIncludeDynamicChunk(dynamicItem, config.dynamicModuleMatchers)) continue
		collectChunkClosure(bundle, dynamicFileName, config, assets, visited, dynamicDepth + 1)
	}
}

/**
 * Includes all reachable dynamic chunks unless callers provide explicit module matchers.
 */
function shouldIncludeDynamicChunk(
	chunk: OutputChunk,
	dynamicModuleMatchers: string[] | undefined,
): boolean {
	if (!dynamicModuleMatchers?.length) return true
	return matchesModule(chunk, dynamicModuleMatchers)
}

/**
 * Checks whether a chunk contains one of the configured normalized module path fragments.
 */
function matchesModule(chunk: OutputChunk, moduleMatchers: string[]): boolean {
	if (!moduleMatchers.length) return false

	const candidates = [chunk.facadeModuleId, ...chunk.moduleIds]
		.filter((id): id is string => Boolean(id))
		.map(normalizeModuleId)

	return moduleMatchers.some((matcher) => {
		const normalizedMatcher = normalizeModuleId(matcher)
		return candidates.some((id) => id.includes(normalizedMatcher))
	})
}

/**
 * Narrows a Rollup output item to a JavaScript chunk.
 */
function isChunk(item: OutputBundle[string] | undefined): item is OutputChunk {
	return Boolean(item && item.type === "chunk")
}

/**
 * Normalizes module identifiers so path matching is stable across operating systems.
 */
function normalizeModuleId(id: string): string {
	return id.replace(/\\/g, "/")
}

/**
 * Converts a bundle file name to the absolute public URL used by the service worker.
 */
function toPublicUrl(fileName: string): string {
	return `/${fileName.replace(/^\/+/, "")}`
}

/**
 * Reads Vite CSS metadata that Rollup types do not expose directly.
 */
function getImportedCssFiles(chunk: OutputChunk): string[] {
	const metadata = chunk.viteMetadata as ViteChunkMetadata | undefined
	return Array.from(metadata?.importedCss ?? [])
}
