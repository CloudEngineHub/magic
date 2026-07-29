import type {
	CanvasDesignPlugin,
	CanvasDesignPluginConfig,
} from "@/components/CanvasDesign/runtime/document/types"
import type { BuiltinPluginSlug } from "./builtin-plugin-slugs"

type PluginManifest = Omit<
	CanvasDesignPluginConfig,
	"runtimeUrl" | "resourceBaseUrl" | "runtimeCode" | "styleCode" | "resolveResourceUrl"
>

const pluginManifestModules = import.meta.glob<PluginManifest>("./*/manifest.json", {
	eager: true,
	import: "default",
})

const pluginStyleModules = import.meta.glob<string>("./*/index.css", {
	eager: true,
	query: "?raw",
	import: "default",
})

const pluginRuntimeModules = import.meta.glob<string>("./*/index.js", {
	eager: true,
	query: "?raw",
	import: "default",
})

function pluginPath(slug: string, file: string) {
	return `./${slug}/${file}`
}

export function createBuiltinPlugin(
	slug: BuiltinPluginSlug,
	sharedRuntimeCode: string,
	sharedStyleCode: string,
): CanvasDesignPlugin {
	const manifest = pluginManifestModules[pluginPath(slug, "manifest.json")]
	const runtimeCode = pluginRuntimeModules[pluginPath(slug, "index.js")]
	const styleCode = pluginStyleModules[pluginPath(slug, "index.css")]

	if (!manifest) {
		throw new Error(`Builtin plugin "${slug}" is missing manifest.json`)
	}
	if (!runtimeCode) {
		throw new Error(`Builtin plugin "${slug}" is missing index.js`)
	}

	const resourceBaseUrl = new URL(`./${slug}/`, import.meta.url).href
	const runtimeUrl = new URL(`./${slug}/index.js`, import.meta.url).href

	return {
		...manifest,
		entry: `./${slug}/${manifest.entry}`,
		runtimeUrl,
		resourceBaseUrl,
		runtimeCode: `${sharedRuntimeCode}\n\n${runtimeCode}`,
		styleCode: [sharedStyleCode, styleCode ?? ""],
		resolveResourceUrl: (path) => new URL(path, resourceBaseUrl).href,
		source: "builtin",
	}
}

export function createBuiltinPlugins(
	slugs: readonly BuiltinPluginSlug[],
	sharedRuntimeCode: string,
	sharedStyleCode: string,
): CanvasDesignPlugin[] {
	return slugs.map((slug) => createBuiltinPlugin(slug, sharedRuntimeCode, sharedStyleCode))
}
