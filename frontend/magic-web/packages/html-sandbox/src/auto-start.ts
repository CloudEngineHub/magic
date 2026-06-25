import { startIframeRuntime } from "./index"

export * from "./index"

declare global {
	interface Window {
		__MAGIC_HTML_SANDBOX_RUNTIME_STARTED__?: boolean
	}
}

if (typeof window !== "undefined" && !window.__MAGIC_HTML_SANDBOX_RUNTIME_STARTED__) {
	window.__MAGIC_HTML_SANDBOX_RUNTIME_STARTED__ = true
	startIframeRuntime()
}
