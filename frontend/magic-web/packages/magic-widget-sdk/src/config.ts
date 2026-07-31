import type { MagicWidget } from "./types"

const CONFIG_KEYS = new Set(["layout", "shell", "conversation"])
const SHELL_CONFIG_KEYS = new Set(["appSidebar"])
const CONVERSATION_CONFIG_KEYS = new Set(["projectFiles", "topicHistory", "previewMode"])
const PREVIEW_MODES = new Set<MagicWidget.PreviewMode>(["split", "fullscreen", "switchable"])

/** Creates a public configuration error without coupling validation to iframe transport. */
function createInvalidConfigError(message: string): MagicWidget.CommandError {
	const error = new Error(message) as MagicWidget.CommandError
	error.code = "INVALID_CONFIG"
	return error
}

/** Narrows configuration sections to plain records and rejects arrays or class instances. */
function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw createInvalidConfigError(`Magic widget ${label} must be an object`)
	}
	const prototype = Object.getPrototypeOf(value)
	if (prototype !== Object.prototype && prototype !== null) {
		throw createInvalidConfigError(`Magic widget ${label} must be a plain object`)
	}
	return value as Record<string, unknown>
}

/** Rejects undeclared fields so future configuration additions stay explicit and typed. */
function assertKnownKeys(value: Record<string, unknown>, keys: Set<string>, label: string): void {
	const unknownKey = Object.keys(value).find((key) => !keys.has(key))
	if (unknownKey) {
		throw createInvalidConfigError(`Magic widget ${label}.${unknownKey} is not supported`)
	}
}

/** Copies an optional boolean field after validating its runtime value. */
function readOptionalBoolean(
	value: Record<string, unknown>,
	key: string,
	label: string,
): boolean | undefined {
	const field = value[key]
	if (field === undefined) return undefined
	if (typeof field !== "boolean") {
		throw createInvalidConfigError(`Magic widget ${label}.${key} must be a boolean`)
	}
	return field
}

/** Copies the optional preview strategy after validating its public enum value. */
function readOptionalPreviewMode(
	value: Record<string, unknown>,
	key: string,
	label: string,
): MagicWidget.PreviewMode | undefined {
	const field = value[key]
	if (field === undefined) return undefined
	if (typeof field !== "string" || !PREVIEW_MODES.has(field as MagicWidget.PreviewMode)) {
		throw createInvalidConfigError(
			`Magic widget ${label}.${key} must be split, fullscreen, or switchable`,
		)
	}
	return field as MagicWidget.PreviewMode
}

/** Normalizes the shell section into an immutable SDK-owned snapshot. */
function normalizeShellConfig(value: unknown): MagicWidget.ShellConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.shell")
	assertKnownKeys(record, SHELL_CONFIG_KEYS, "config.shell")
	const appSidebar = readOptionalBoolean(record, "appSidebar", "config.shell")
	return appSidebar === undefined ? {} : { appSidebar }
}

/** Normalizes the conversation section into an immutable SDK-owned snapshot. */
function normalizeConversationConfig(value: unknown): MagicWidget.ConversationConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.conversation")
	assertKnownKeys(record, CONVERSATION_CONFIG_KEYS, "config.conversation")
	const projectFiles = readOptionalBoolean(record, "projectFiles", "config.conversation")
	const topicHistory = readOptionalBoolean(record, "topicHistory", "config.conversation")
	const previewMode = readOptionalPreviewMode(record, "previewMode", "config.conversation")
	return {
		...(projectFiles === undefined ? {} : { projectFiles }),
		...(topicHistory === undefined ? {} : { topicHistory }),
		...(previewMode === undefined ? {} : { previewMode }),
	}
}

/** Validates and clones a complete or partial public Widget configuration. */
export function normalizeWidgetConfig(value: unknown): MagicWidget.WidgetConfig {
	if (value === undefined) return {}
	const record = requirePlainObject(value, "config")
	assertKnownKeys(record, CONFIG_KEYS, "config")

	const layout = record.layout
	if (layout !== undefined && layout !== "desktop" && layout !== "mobile") {
		throw createInvalidConfigError(
			'Magic widget config.layout must be either "desktop" or "mobile"',
		)
	}

	const shell = normalizeShellConfig(record.shell)
	const conversation = normalizeConversationConfig(record.conversation)
	return {
		...(layout === undefined ? {} : { layout }),
		...(shell === undefined ? {} : { shell }),
		...(conversation === undefined ? {} : { conversation }),
	}
}

/** Applies a validated field-level update without mutating the previous snapshot. */
export function mergeWidgetConfig(
	current: MagicWidget.WidgetConfig,
	update: unknown,
): MagicWidget.WidgetConfig {
	const normalizedUpdate = normalizeWidgetConfig(update)
	return {
		...current,
		...normalizedUpdate,
		...(normalizedUpdate.shell
			? { shell: { ...current.shell, ...normalizedUpdate.shell } }
			: {}),
		...(normalizedUpdate.conversation
			? { conversation: { ...current.conversation, ...normalizedUpdate.conversation } }
			: {}),
	}
}

/** Serializes only validated configuration fields for the protected initial query. */
export function serializeWidgetConfig(config: MagicWidget.WidgetConfig): string {
	return JSON.stringify(normalizeWidgetConfig(config))
}
