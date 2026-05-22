import type { CanvasDesignPlugin } from "@/components/CanvasDesign/canvas/types"

import bootsTryonStyles from "./boots-tryon/index.css?raw"
// eslint-disable-next-line import/extensions
import bootsTryonRuntimeCode from "./boots-tryon/index.js?raw"
import bootsTryonManifest from "./boots-tryon/manifest.json"
import sceneSwapStyles from "./scene-swap/index.css?raw"
// eslint-disable-next-line import/extensions
import sceneSwapRuntimeCode from "./scene-swap/index.js?raw"
import sceneSwapManifest from "./scene-swap/manifest.json"
import magicPluginKitStyles from "./shared/magic-plugin-kit/styles.css?raw"
// eslint-disable-next-line import/extensions
import magicPluginKitRuntimeCode from "./shared/magic-plugin-kit/index.js?raw"
import virtualTryonStyles from "./virtual-tryon/index.css?raw"
// eslint-disable-next-line import/extensions
import virtualTryonRuntimeCode from "./virtual-tryon/index.js?raw"
import virtualTryonManifest from "./virtual-tryon/manifest.json"

const virtualTryonEntryUrl = new URL("./virtual-tryon/index.js", import.meta.url).href
const virtualTryonResourceBaseUrl = new URL("./virtual-tryon/", import.meta.url).href
const bootsTryonEntryUrl = new URL("./boots-tryon/index.js", import.meta.url).href
const bootsTryonResourceBaseUrl = new URL("./boots-tryon/", import.meta.url).href
const sceneSwapEntryUrl = new URL("./scene-swap/index.js", import.meta.url).href
const sceneSwapResourceBaseUrl = new URL("./scene-swap/", import.meta.url).href

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
