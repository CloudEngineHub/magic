import { loader } from "@monaco-editor/react"
import { env } from "@/utils/env"

/** Configure Monaco's CDN path once before the lazy editor components mount. */
export function configureMonacoLoader() {
	loader.config({
		paths: {
			vs: `${env("MAGIC_CDNHOST")}/monaco-editor/0.52.2/min/vs`,
		},
	})
}

configureMonacoLoader()
