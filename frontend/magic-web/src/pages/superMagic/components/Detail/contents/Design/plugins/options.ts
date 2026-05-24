import type { CanvasDesignPlugin } from "@/components/CanvasDesign/canvas/types"
import magicPluginKitStyles from "./shared/magic-plugin-kit/styles.css?raw"
import magicPluginKitRuntimeCode from "./shared/magic-plugin-kit/index.js?raw"
// eslint-disable-next-line import/extensions
import bootsTryonStyles from "./boots-tryon/index.css?raw"
import bootsTryonRuntimeCode from "./boots-tryon/index.js?raw"
import bootsTryonManifest from "./boots-tryon/manifest.json"

import sceneSwapStyles from "./scene-swap/index.css?raw"
import sceneSwapRuntimeCode from "./scene-swap/index.js?raw"
import sceneSwapManifest from "./scene-swap/manifest.json"

import virtualTryonStyles from "./virtual-tryon/index.css?raw"
import virtualTryonRuntimeCode from "./virtual-tryon/index.js?raw"
import virtualTryonManifest from "./virtual-tryon/manifest.json"

import realModelTryonStyles from "./real-model-tryon/index.css?raw"
import realModelTryonRuntimeCode from "./real-model-tryon/index.js?raw"
import realModelTryonManifest from "./real-model-tryon/manifest.json"
import dressUpTryonStyles from "./dress-up-tryon/index.css?raw"
import dressUpTryonRuntimeCode from "./dress-up-tryon/index.js?raw"
import dressUpTryonManifest from "./dress-up-tryon/manifest.json"

const virtualTryonEntryUrl = new URL("./virtual-tryon/index.js", import.meta.url).href
const virtualTryonResourceBaseUrl = new URL("./virtual-tryon/", import.meta.url).href
const bootsTryonEntryUrl = new URL("./boots-tryon/index.js", import.meta.url).href
const bootsTryonResourceBaseUrl = new URL("./boots-tryon/", import.meta.url).href
const sceneSwapEntryUrl = new URL("./scene-swap/index.js", import.meta.url).href
const sceneSwapResourceBaseUrl = new URL("./scene-swap/", import.meta.url).href
const realModelTryonEntryUrl = new URL("./real-model-tryon/index.js", import.meta.url).href
const realModelTryonResourceBaseUrl = new URL("./real-model-tryon/", import.meta.url).href
const dressUpTryonEntryUrl = new URL("./dress-up-tryon/index.js", import.meta.url).href
const dressUpTryonResourceBaseUrl = new URL("./dress-up-tryon/", import.meta.url).href

export const designBuiltinPlugins: CanvasDesignPlugin[] = [
	{
		...virtualTryonManifest,
		entry: `./virtual-tryon/${virtualTryonManifest.entry}`,
		runtimeUrl: virtualTryonEntryUrl,
		resourceBaseUrl: virtualTryonResourceBaseUrl,
		runtimeCode: virtualTryonRuntimeCode,
		styleCode: [virtualTryonStyles],
		resolveResourceUrl: (path) => new URL(path, virtualTryonResourceBaseUrl).href,
		source: "builtin",
	},
	{
		...dressUpTryonManifest,
		entry: `./dress-up-tryon/${dressUpTryonManifest.entry}`,
		runtimeUrl: dressUpTryonEntryUrl,
		resourceBaseUrl: dressUpTryonResourceBaseUrl,
		runtimeCode: `${magicPluginKitRuntimeCode}\n\n${dressUpTryonRuntimeCode}`,
		styleCode: [magicPluginKitStyles, dressUpTryonStyles],
		resolveResourceUrl: (path) => new URL(path, dressUpTryonResourceBaseUrl).href,
		source: "builtin",
	},
	{
		...realModelTryonManifest,
		entry: `./real-model-tryon/${realModelTryonManifest.entry}`,
		runtimeUrl: realModelTryonEntryUrl,
		resourceBaseUrl: realModelTryonResourceBaseUrl,
		runtimeCode: `${magicPluginKitRuntimeCode}\n\n${realModelTryonRuntimeCode}`,
		styleCode: [magicPluginKitStyles, realModelTryonStyles],
		resolveResourceUrl: (path) => new URL(path, realModelTryonResourceBaseUrl).href,
		source: "builtin",
	},
	{
		...bootsTryonManifest,
		entry: `./boots-tryon/${bootsTryonManifest.entry}`,
		runtimeUrl: bootsTryonEntryUrl,
		resourceBaseUrl: bootsTryonResourceBaseUrl,
		runtimeCode: `${magicPluginKitRuntimeCode}\n\n${bootsTryonRuntimeCode}`,
		styleCode: [magicPluginKitStyles, bootsTryonStyles],
		resolveResourceUrl: (path) => new URL(path, bootsTryonResourceBaseUrl).href,
		source: "builtin",
	},
	{
		...sceneSwapManifest,
		entry: `./scene-swap/${sceneSwapManifest.entry}`,
		runtimeUrl: sceneSwapEntryUrl,
		resourceBaseUrl: sceneSwapResourceBaseUrl,
		runtimeCode: `${magicPluginKitRuntimeCode}\n\n${sceneSwapRuntimeCode}`,
		styleCode: [magicPluginKitStyles, sceneSwapStyles],
		resolveResourceUrl: (path) => new URL(path, sceneSwapResourceBaseUrl).href,
		source: "builtin",
	},
]
