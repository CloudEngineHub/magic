import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import {
	HTML_PERMISSION_GRANTS_CHANGED_EVENT,
	HTML_PERMISSION_GRANTS_CHANNEL_NAME,
} from "./HtmlPermissionGrantStore"

type HtmlPermissionGrantChange = {
	type: "changed"
	epoch: number
	revision: number
	cleared?: boolean
}

type HtmlPermissionGrantChangeListener = (change: unknown) => void

let permissionGrantChannel: BroadcastChannel | null = null
const permissionGrantChangeListeners = new Set<HtmlPermissionGrantChangeListener>()

export function registerHtmlPermissionGrantChangeListener(
	listener: HtmlPermissionGrantChangeListener,
): void {
	permissionGrantChangeListeners.add(listener)
}

export function createHtmlPermissionGrantBroadcastChannel(): BroadcastChannel | null {
	const target = globalThis.window
	const BroadcastChannelConstructor = target?.BroadcastChannel
	if (
		!target ||
		typeof BroadcastChannelConstructor !== "function" ||
		!(BroadcastChannelConstructor.prototype instanceof target.EventTarget)
	) {
		return null
	}
	try {
		return new BroadcastChannelConstructor(HTML_PERMISSION_GRANTS_CHANNEL_NAME)
	} catch {
		return null
	}
}

export function notifyPermissionGrantChange(
	change?: Omit<HtmlPermissionGrantChange, "type">,
): void {
	try {
		const target = globalThis.window
		if (target) target.dispatchEvent(new target.Event(HTML_PERMISSION_GRANTS_CHANGED_EVENT))
		if (!permissionGrantChannel) {
			permissionGrantChannel = createHtmlPermissionGrantBroadcastChannel()
			permissionGrantChannel?.addEventListener("message", (event) => {
				for (const listener of permissionGrantChangeListeners) listener(event.data)
			})
		}
		if (change) {
			const message = { type: "changed" as const, ...change }
			for (const listener of permissionGrantChangeListeners) listener(message)
			permissionGrantChannel?.postMessage(message)
		}
	} catch (error) {
		htmlMicroAppPreviewLogger.warn("Failed to notify permission grant change", {
			error: error instanceof Error ? error.message : String(error),
		})
	}
}
