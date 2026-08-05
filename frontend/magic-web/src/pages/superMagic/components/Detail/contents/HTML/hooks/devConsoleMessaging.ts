import { DEVTOOLS_MSG } from "../components/DevConsole/types"

const PARENT_DESCRIPTOR_CACHE_KEY = "__MAGIC_DEVTOOLS_PARENT_DESCRIPTOR__"

const preserveParentDescriptorCode = `(() => {
	if (!window.${PARENT_DESCRIPTOR_CACHE_KEY}) {
		window.${PARENT_DESCRIPTOR_CACHE_KEY} = Object.getOwnPropertyDescriptor(window, "parent")
	}
})()`

const restoreParentDescriptorCode = `(() => {
	const descriptor = window.${PARENT_DESCRIPTOR_CACHE_KEY}
	if (descriptor) {
		Object.defineProperty(window, "parent", descriptor)
	}
	delete window.${PARENT_DESCRIPTOR_CACHE_KEY}
})()`

function sendCompatibilityEval(contentWindow: Window, code: string) {
	contentWindow.postMessage(
		{
			type: DEVTOOLS_MSG.EVAL,
			evalId: `devtools_parent_bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			code,
			timestamp: Date.now(),
		},
		"*",
	)
}

/**
 * Keeps the host message bridge available when toggling older cross-origin
 * html-sandbox runtimes. Those runtimes removed the shell's own `window.parent`
 * getter when DevTools was disabled, which also disabled element inspection.
 */
export function sendDevToolsToggle(contentWindow: Window | null | undefined, enabled: boolean) {
	if (!contentWindow) return

	if (enabled) {
		sendCompatibilityEval(contentWindow, preserveParentDescriptorCode)
	}

	contentWindow.postMessage({ type: DEVTOOLS_MSG.TOGGLE, enabled, timestamp: Date.now() }, "*")

	if (!enabled) {
		sendCompatibilityEval(contentWindow, restoreParentDescriptorCode)
	}
}
