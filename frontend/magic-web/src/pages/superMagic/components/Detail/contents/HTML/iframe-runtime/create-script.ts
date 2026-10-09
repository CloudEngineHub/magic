// eslint-disable-next-line import/no-unresolved -- Compiled by the app/test Vite plugin.
import scripts from "virtual:magic-iframe-runtime"
import type telemetry from "./telemetry"
import type contentMetrics from "./content-metrics"
import type serviceWorker from "./service-worker"
import type legacyCookie from "./legacy-cookie"
import type legacyStorage from "./legacy-storage"
import type legacyIndexedDB from "./legacy-indexed-db"
import type navigation from "./navigation"

interface Installers {
	telemetry: typeof telemetry
	"content-metrics": typeof contentMetrics
	"service-worker": typeof serviceWorker
	"legacy-cookie": typeof legacyCookie
	"legacy-storage": typeof legacyStorage
	"legacy-indexed-db": typeof legacyIndexedDB
	navigation: typeof navigation
}

/** Parameters are data, never source fragments. HTML parses </script> before JS. */
export function createIframeRuntimeScript<K extends keyof Installers>(
	name: K,
	options: Parameters<Installers[K]>[0],
): string {
	const script = scripts[name]
	if (!script) throw new Error(`Missing compiled iframe installer: ${name}`)
	const data = JSON.stringify(options).replace(
		/[<>&\u2028\u2029]/g,
		(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
	)
	return `${script}(${data});`
}
