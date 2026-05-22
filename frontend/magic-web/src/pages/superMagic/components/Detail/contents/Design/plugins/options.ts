import type { CanvasDesignPlugin } from "@/components/CanvasDesign/canvas/types"

import magicPluginKitStyles from "./shared/magic-plugin-kit/styles.css?raw"
// eslint-disable-next-line import/extensions
import magicPluginKitRuntimeCode from "./shared/magic-plugin-kit/index.js?raw"
import bootsTryonStyles from "./boots-tryon/index.css?raw"
// eslint-disable-next-line import/extensions
import bootsTryonRuntimeCode from "./boots-tryon/index.js?raw"
import bootsTryonManifest from "./boots-tryon/manifest.json"
import virtualTryonStyles from "./virtual-tryon/index.css?raw"
// eslint-disable-next-line import/extensions
import virtualTryonRuntimeCode from "./virtual-tryon/index.js?raw"
import virtualTryonManifest from "./virtual-tryon/manifest.json"

const bootsTryonEntryUrl = new URL("./boots-tryon/index.js", import.meta.url).href
const bootsTryonResourceBaseUrl = new URL("./boots-tryon/", import.meta.url).href
const virtualTryonEntryUrl = new URL("./virtual-tryon/index.js", import.meta.url).href
const virtualTryonResourceBaseUrl = new URL("./virtual-tryon/", import.meta.url).href

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
]
