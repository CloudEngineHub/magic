import type { OutputBundle, OutputChunk } from "rollup"
import { describe, expect, it } from "vitest"
import { collectWarmupAssets } from "../collect-warmup-assets"

/**
 * Creates a minimal Rollup chunk fixture for warm-up collection tests.
 */
function createChunk(input: {
	fileName: string
	facadeModuleId?: string | null
	moduleIds?: string[]
	imports?: string[]
	dynamicImports?: string[]
	css?: string[]
}): OutputChunk {
	return {
		type: "chunk",
		fileName: input.fileName,
		name: input.fileName,
		facadeModuleId: input.facadeModuleId ?? null,
		moduleIds: input.moduleIds ?? [],
		imports: input.imports ?? [],
		dynamicImports: input.dynamicImports ?? [],
		viteMetadata: { importedCss: new Set(input.css ?? []) },
	} as unknown as OutputChunk
}

/**
 * Builds an OutputBundle keyed by chunk file names to mirror Rollup output shape.
 */
function createBundle(chunks: OutputChunk[]): OutputBundle {
	return Object.fromEntries(chunks.map((chunk) => [chunk.fileName, chunk])) as OutputBundle
}

describe("collectWarmupAssets", () => {
	it("matches start chunks by facadeModuleId and collects static imports and CSS", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/TopicPage-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/TopicPage.tsx",
				imports: ["assets/shared-d4e5f6.js"],
				css: ["assets/TopicPage-a1b2c3.css"],
			}),
			createChunk({
				fileName: "assets/shared-d4e5f6.js",
				moduleIds: ["/repo/src/shared/helpers.ts"],
				css: ["assets/shared-d4e5f6.css"],
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/TopicPage"],
			}),
		).toEqual([
			"/assets/TopicPage-a1b2c3.css",
			"/assets/TopicPage-a1b2c3.js",
			"/assets/shared-d4e5f6.css",
			"/assets/shared-d4e5f6.js",
		])
	})

	it("matches start chunks by moduleIds when a core module is merged into another chunk", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/merged-a1b2c3.js",
				moduleIds: ["/repo/src/pages/core/WorkspacePage.tsx", "/repo/src/shared/view.ts"],
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/WorkspacePage"],
			}),
		).toEqual(["/assets/merged-a1b2c3.js"])
	})

	it("does not collect dynamic imports by default", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/TopicPage-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/TopicPage.tsx",
				dynamicImports: ["assets/Dialog-d4e5f6.js"],
			}),
			createChunk({
				fileName: "assets/Dialog-d4e5f6.js",
				facadeModuleId: "/repo/src/pages/core/Dialog.tsx",
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/TopicPage"],
			}),
		).toEqual(["/assets/TopicPage-a1b2c3.js"])
	})

	it("collects only matched dynamic imports when dynamic depth is explicitly enabled", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/TopicPage-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/TopicPage.tsx",
				dynamicImports: ["assets/Editor-d4e5f6.js", "assets/Preview-g7h8i9.js"],
			}),
			createChunk({
				fileName: "assets/Editor-d4e5f6.js",
				facadeModuleId: "/repo/src/pages/core/Editor.tsx",
			}),
			createChunk({
				fileName: "assets/Preview-g7h8i9.js",
				facadeModuleId: "/repo/src/pages/core/Preview.tsx",
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/TopicPage"],
				includeDynamicDepth: 1,
				dynamicModuleMatchers: ["src/pages/core/Editor"],
			}),
		).toEqual(["/assets/Editor-d4e5f6.js", "/assets/TopicPage-a1b2c3.js"])
	})

	it("collects all reachable dynamic imports when no dynamic matcher is configured", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/TopicPage-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/TopicPage.tsx",
				dynamicImports: ["assets/Editor-d4e5f6.js"],
			}),
			createChunk({
				fileName: "assets/Editor-d4e5f6.js",
				facadeModuleId: "/repo/src/pages/core/Editor.tsx",
				dynamicImports: ["assets/Toolbar-g7h8i9.js"],
			}),
			createChunk({
				fileName: "assets/Toolbar-g7h8i9.js",
				facadeModuleId: "/repo/src/pages/core/Toolbar.tsx",
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/TopicPage"],
				includeDynamicDepth: 2,
			}),
		).toEqual([
			"/assets/Editor-d4e5f6.js",
			"/assets/Toolbar-g7h8i9.js",
			"/assets/TopicPage-a1b2c3.js",
		])
	})

	it("deduplicates assets, sorts output, and applies maxAssets", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/b-page-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/PageB.tsx",
				imports: ["assets/shared-d4e5f6.js"],
			}),
			createChunk({
				fileName: "assets/a-page-a1b2c3.js",
				facadeModuleId: "/repo/src/pages/core/PageA.tsx",
				imports: ["assets/shared-d4e5f6.js"],
			}),
			createChunk({
				fileName: "assets/shared-d4e5f6.js",
				moduleIds: ["/repo/src/shared/helpers.ts"],
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/Page"],
				maxAssets: 2,
			}),
		).toEqual(["/assets/a-page-a1b2c3.js", "/assets/b-page-a1b2c3.js"])
	})

	it("normalizes Windows-style module ids before matching", () => {
		const bundle = createBundle([
			createChunk({
				fileName: "assets/TopicPage-a1b2c3.js",
				facadeModuleId: "C:\\repo\\src\\pages\\core\\TopicPage.tsx",
			}),
		])

		expect(
			collectWarmupAssets(bundle, {
				moduleMatchers: ["src/pages/core/TopicPage"],
			}),
		).toEqual(["/assets/TopicPage-a1b2c3.js"])
	})
})
