import type { MagicWidgetConfig, MagicWidgetEmbedContext, MagicWidgetLayout } from "./types"

export const MAGIC_WIDGET_PROTOCOL = "magic-widget"
export const MAGIC_WIDGET_PROTOCOL_VERSION = 1
export const MAGIC_WIDGET_QUERY_CONFIG = "magicWidgetConfig"
const MAGIC_WIDGET_QUERY_EMBED = "magicWidgetEmbed"
const MAGIC_WIDGET_QUERY_INSTANCE_ID = "magicWidgetInstanceId"
const MAGIC_WIDGET_QUERY_PROTOCOL_VERSION = "magicWidgetProtocolVersion"
const MAGIC_WIDGET_QUERY_HOST_ORIGIN = "magicWidgetHostOrigin"
const MAX_INITIAL_CONFIG_LENGTH = 4_096
const CONFIG_KEYS = new Set(["layout", "shell", "conversation"])
const SHELL_CONFIG_KEYS = new Set(["appSidebar"])
const CONVERSATION_CONFIG_KEYS = new Set(["projectFiles", "topicHistory"])

/** Narrows untrusted Widget configuration values to plain records. */
function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`)
	}
	const prototype = Object.getPrototypeOf(value)
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error(`${label} must be a plain object`)
	}
	return value as Record<string, unknown>
}

/** Rejects unknown fields before configuration enters React state. */
function assertKnownKeys(value: Record<string, unknown>, keys: Set<string>, label: string): void {
	const unknownKey = Object.keys(value).find((key) => !keys.has(key))
	if (unknownKey) throw new Error(`${label}.${unknownKey} is not supported`)
}

/** Reads one optional boolean from an untrusted configuration section. */
function readOptionalBoolean(
	value: Record<string, unknown>,
	key: string,
	label: string,
): boolean | undefined {
	const field = value[key]
	if (field === undefined) return undefined
	if (typeof field !== "boolean") throw new Error(`${label}.${key} must be a boolean`)
	return field
}

/** Validates and clones the complete configuration snapshot sent by the SDK. */
export function normalizeMagicWidgetConfig(value: unknown): MagicWidgetConfig {
	const record = requirePlainObject(value, "config")
	assertKnownKeys(record, CONFIG_KEYS, "config")
	const layout = record.layout
	if (layout !== undefined && layout !== "desktop" && layout !== "mobile") {
		throw new Error("config.layout must be desktop or mobile")
	}

	let shell: MagicWidgetConfig["shell"]
	if (record.shell !== undefined) {
		const shellRecord = requirePlainObject(record.shell, "config.shell")
		assertKnownKeys(shellRecord, SHELL_CONFIG_KEYS, "config.shell")
		const appSidebar = readOptionalBoolean(shellRecord, "appSidebar", "config.shell")
		shell = appSidebar === undefined ? {} : { appSidebar }
	}

	let conversation: MagicWidgetConfig["conversation"]
	if (record.conversation !== undefined) {
		const conversationRecord = requirePlainObject(record.conversation, "config.conversation")
		assertKnownKeys(conversationRecord, CONVERSATION_CONFIG_KEYS, "config.conversation")
		const projectFiles = readOptionalBoolean(
			conversationRecord,
			"projectFiles",
			"config.conversation",
		)
		const topicHistory = readOptionalBoolean(
			conversationRecord,
			"topicHistory",
			"config.conversation",
		)
		conversation = {
			...(projectFiles === undefined ? {} : { projectFiles }),
			...(topicHistory === undefined ? {} : { topicHistory }),
		}
	}

	return {
		...(layout === undefined ? {} : { layout }),
		...(shell === undefined ? {} : { shell }),
		...(conversation === undefined ? {} : { conversation }),
	}
}

/** Reads the private embed identity only inside a real iframe document. */
export function getMagicWidgetEmbedContext(search: string): MagicWidgetEmbedContext | null {
	if (typeof window === "undefined" || window.parent === window) return null
	const params = new URLSearchParams(search)
	if (params.get(MAGIC_WIDGET_QUERY_EMBED) !== "1") return null
	const instanceId = params.get(MAGIC_WIDGET_QUERY_INSTANCE_ID)?.trim()
	const protocolVersion = Number(params.get(MAGIC_WIDGET_QUERY_PROTOCOL_VERSION))
	const hostOriginValue = params.get(MAGIC_WIDGET_QUERY_HOST_ORIGIN)
	if (!instanceId || protocolVersion !== MAGIC_WIDGET_PROTOCOL_VERSION || !hostOriginValue) {
		return null
	}

	try {
		const hostUrl = new URL(hostOriginValue)
		if (hostUrl.protocol !== "http:" && hostUrl.protocol !== "https:") return null
		return { instanceId, protocolVersion, hostOrigin: hostUrl.origin }
	} catch {
		return null
	}
}

/** Parses a bounded initial configuration query after embed identity validation succeeds. */
export function getMagicWidgetInitialConfig(
	search: string,
	embedContext: MagicWidgetEmbedContext | null,
): MagicWidgetConfig {
	if (!embedContext) return {}
	const serializedConfig = new URLSearchParams(search).get(MAGIC_WIDGET_QUERY_CONFIG)
	if (!serializedConfig || serializedConfig.length > MAX_INITIAL_CONFIG_LENGTH) return {}
	try {
		return normalizeMagicWidgetConfig(JSON.parse(serializedConfig))
	} catch {
		return {}
	}
}

/** Preserves legacy mobile query behavior when the SDK does not choose a layout. */
export function shouldForceMobileCrewConversation(search: string): boolean {
	const searchParams = new URLSearchParams(search)
	const view = searchParams.get("view")?.toLowerCase()
	const layout = searchParams.get("layout")?.toLowerCase()
	const mobile = searchParams.get("mobile")?.toLowerCase()
	return view === "mobile" || layout === "mobile" || mobile === "1" || mobile === "true"
}

/** Resolves the effective Crew content layout without changing the surrounding application shell. */
export function resolveMagicWidgetCrewLayout({
	configuredLayout,
	isMobileViewport,
	search,
}: {
	configuredLayout?: MagicWidgetLayout
	isMobileViewport: boolean
	search: string
}): MagicWidgetLayout {
	if (configuredLayout) return configuredLayout
	return isMobileViewport || shouldForceMobileCrewConversation(search) ? "mobile" : "desktop"
}
