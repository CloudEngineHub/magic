import type { CanvasDesignPlugin } from "@/components/CanvasDesign/canvas/types"

import virtualTryonStyles from "./virtual-tryon/index.css?raw"
// eslint-disable-next-line import/extensions
import virtualTryonRuntimeCode from "./virtual-tryon/index.js?raw"
import virtualTryonManifest from "./virtual-tryon/manifest.json"

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
]
