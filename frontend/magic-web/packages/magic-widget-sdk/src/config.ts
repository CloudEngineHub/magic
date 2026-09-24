import type { MagicWidget } from "./types"

const CONFIG_KEYS = new Set([
	"layout",
	"shell",
	"conversation",
	"responsive",
	"header",
	"panel",
	"bottom",
	"window",
])
const SHELL_CONFIG_KEYS = new Set(["appSidebar"])
const CONVERSATION_CONFIG_KEYS = new Set([
	"projectFiles",
	"topicHistory",
	"autoHire",
	"previewMode",
])
const RESPONSIVE_CONFIG_KEYS = new Set(["mobileDetection"])
const HEADER_CONFIG_KEYS = new Set(["visible", "title", "topicName", "actions"])
const HEADER_TOPIC_NAME_KEYS = new Set(["mode", "text"])
const HEADER_ACTION_NAME_FLAGS = {
	fullscreen: true,
	pin: true,
	newTopic: true,
	history: true,
	share: true,
	more: true,
	close: true,
} as const satisfies Record<MagicWidget.HeaderActionName, true>

/** Header action names shared by protocol checks, config validation, and the iframe shell. */
export const WIDGET_HEADER_ACTION_NAMES = Object.keys(
	HEADER_ACTION_NAME_FLAGS,
) as MagicWidget.HeaderActionName[]

const HEADER_ACTION_KEYS = new Set<MagicWidget.HeaderActionName>(WIDGET_HEADER_ACTION_NAMES)
const PANEL_CONFIG_KEYS = new Set([
	"projectFiles",
	"uploadFiles",
	"otherProjectFiles",
	"digitalEmployees",
	"microApps",
	"workflows",
	"connectors",
	"skills",
	"canvasElements",
])
const BOTTOM_CAPABILITY_KEYS = new Set(["internetSearch", "plugin", "upload", "voice"])
const BOTTOM_CONFIG_KEYS = new Set([...BOTTOM_CAPABILITY_KEYS, "model"])
const CAPABILITY_CONFIG_KEYS = new Set(["enabled", "buttonVisible"])
const MODEL_BUTTON_KEYS = new Set(["buttonVisible"])
const WINDOW_CONFIG_KEYS = new Set(["closable"])
const PREVIEW_MODES = new Set<MagicWidget.PreviewMode>(["split", "fullscreen", "switchable"])
const MOBILE_DETECTION_MODES = new Set<MagicWidget.MobileDetection>([
	"viewport",
	"device-and-viewport",
])

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

/** Copies the optional mobile detection strategy after validating its public enum value. */
function readOptionalMobileDetection(
	value: Record<string, unknown>,
	key: string,
	label: string,
): MagicWidget.MobileDetection | undefined {
	const field = value[key]
	if (field === undefined) return undefined
	if (
		typeof field !== "string" ||
		!MOBILE_DETECTION_MODES.has(field as MagicWidget.MobileDetection)
	) {
		throw createInvalidConfigError(
			`Magic widget ${label}.${key} must be viewport or device-and-viewport`,
		)
	}
	return field as MagicWidget.MobileDetection
}

/** Copies a bounded optional text value used by host-visible Widget labels. */
function readOptionalText(
	value: Record<string, unknown>,
	key: string,
	label: string,
	maxLength = 512,
): string | undefined {
	const field = value[key]
	if (field === undefined) return undefined
	if (typeof field !== "string" || field.length > maxLength) {
		throw createInvalidConfigError(
			`Magic widget ${label}.${key} must be a string of at most ${maxLength} characters`,
		)
	}
	return field
}

/** Trims a visible label and rejects whitespace so callers do not see a later silent fallback. */
function readOptionalDisplayText(
	value: Record<string, unknown>,
	key: string,
	label: string,
	maxLength = 512,
): string | undefined {
	const field = readOptionalText(value, key, label, maxLength)
	if (field === undefined) return undefined
	const trimmed = field.trim()
	if (!trimmed) {
		throw createInvalidConfigError(`Magic widget ${label}.${key} must not be blank`)
	}
	return trimmed
}

/** Normalizes the optional two-line header labels without coupling them to React rendering. */
function normalizeHeaderConfig(value: unknown): MagicWidget.HeaderConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.header")
	assertKnownKeys(record, HEADER_CONFIG_KEYS, "config.header")
	const visible = readOptionalBoolean(record, "visible", "config.header")
	const title = readOptionalDisplayText(record, "title", "config.header")
	let actions: MagicWidget.HeaderConfig["actions"]
	if (record.actions !== undefined) {
		const actionRecord = requirePlainObject(record.actions, "config.header.actions")
		assertKnownKeys(actionRecord, HEADER_ACTION_KEYS, "config.header.actions")
		actions = Object.fromEntries(
			Array.from(HEADER_ACTION_KEYS)
				.map((key) => [
					key,
					readOptionalBoolean(actionRecord, key, "config.header.actions"),
				])
				.filter(([, field]) => field !== undefined),
		) as MagicWidget.HeaderConfig["actions"]
	}
	let topicName: MagicWidget.HeaderConfig["topicName"]
	if (record.topicName !== undefined) {
		const topicRecord = requirePlainObject(record.topicName, "config.header.topicName")
		assertKnownKeys(topicRecord, HEADER_TOPIC_NAME_KEYS, "config.header.topicName")
		const mode = topicRecord.mode
		if (mode !== undefined && mode !== "current" && mode !== "hidden" && mode !== "static") {
			throw createInvalidConfigError(
				"Magic widget config.header.topicName.mode must be current, hidden, or static",
			)
		}
		const text = readOptionalDisplayText(topicRecord, "text", "config.header.topicName")
		if (mode === "static" && text === undefined) {
			throw createInvalidConfigError(
				"Magic widget config.header.topicName.text is required for static mode",
			)
		}
		topicName = {
			...(mode === undefined ? {} : { mode }),
			...(text === undefined ? {} : { text }),
		}
	}
	return {
		...(visible === undefined ? {} : { visible }),
		...(title === undefined ? {} : { title }),
		...(actions === undefined ? {} : { actions }),
		...(topicName === undefined ? {} : { topicName }),
	}
}

/** Normalizes business panel visibility without exposing technical component names. */
function normalizePanelConfig(value: unknown): MagicWidget.WidgetPanelConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.panel")
	assertKnownKeys(record, PANEL_CONFIG_KEYS, "config.panel")
	return Object.fromEntries(
		Array.from(PANEL_CONFIG_KEYS)
			.map((key) => [key, readOptionalBoolean(record, key, "config.panel")])
			.filter(([, field]) => field !== undefined),
	) as MagicWidget.WidgetPanelConfig
}

/** Normalizes one bottom capability and its independent button visibility. */
function normalizeCapabilityConfig(value: unknown, label: string): MagicWidget.CapabilityConfig {
	const record = requirePlainObject(value, label)
	assertKnownKeys(record, CAPABILITY_CONFIG_KEYS, label)
	const enabled = readOptionalBoolean(record, "enabled", label)
	const buttonVisible = readOptionalBoolean(record, "buttonVisible", label)
	return {
		...(enabled === undefined ? {} : { enabled }),
		...(buttonVisible === undefined ? {} : { buttonVisible }),
	}
}

/** Normalizes model-picker visibility separately from mention-panel agent entries. */
function normalizeModelButtonConfig(value: unknown): MagicWidget.ModelButtonConfig {
	const record = requirePlainObject(value, "config.bottom.model")
	assertKnownKeys(record, MODEL_BUTTON_KEYS, "config.bottom.model")
	const buttonVisible = readOptionalBoolean(record, "buttonVisible", "config.bottom.model")
	return buttonVisible === undefined ? {} : { buttonVisible }
}

/** Normalizes all bottom capabilities while keeping omitted entries backward compatible. */
function normalizeBottomConfig(value: unknown): MagicWidget.WidgetBottomConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.bottom")
	assertKnownKeys(record, BOTTOM_CONFIG_KEYS, "config.bottom")
	return Object.fromEntries(
		Array.from(BOTTOM_CONFIG_KEYS)
			.filter((key) => record[key] !== undefined)
			.map((key) => [
				key,
				key === "model"
					? normalizeModelButtonConfig(record[key])
					: normalizeCapabilityConfig(record[key], `config.bottom.${key}`),
			]),
	) as MagicWidget.WidgetBottomConfig
}

/** Normalizes inline close-button visibility independently from floating lifecycle controls. */
function normalizeWindowConfig(value: unknown): MagicWidget.WidgetWindowConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.window")
	assertKnownKeys(record, WINDOW_CONFIG_KEYS, "config.window")
	const closable = readOptionalBoolean(record, "closable", "config.window")
	return closable === undefined ? {} : { closable }
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
	const autoHire = readOptionalBoolean(record, "autoHire", "config.conversation")
	const previewMode = readOptionalPreviewMode(record, "previewMode", "config.conversation")
	return {
		...(projectFiles === undefined ? {} : { projectFiles }),
		...(topicHistory === undefined ? {} : { topicHistory }),
		...(autoHire === undefined ? {} : { autoHire }),
		...(previewMode === undefined ? {} : { previewMode }),
	}
}

/** Normalizes responsive behavior without changing legacy viewport defaults. */
function normalizeResponsiveConfig(value: unknown): MagicWidget.ResponsiveConfig | undefined {
	if (value === undefined) return undefined
	const record = requirePlainObject(value, "config.responsive")
	assertKnownKeys(record, RESPONSIVE_CONFIG_KEYS, "config.responsive")
	const mobileDetection = readOptionalMobileDetection(
		record,
		"mobileDetection",
		"config.responsive",
	)
	return mobileDetection === undefined ? {} : { mobileDetection }
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
	const responsive = normalizeResponsiveConfig(record.responsive)
	const header = normalizeHeaderConfig(record.header)
	const panel = normalizePanelConfig(record.panel)
	const bottom = normalizeBottomConfig(record.bottom)
	const windowConfig = normalizeWindowConfig(record.window)
	return {
		...(layout === undefined ? {} : { layout }),
		...(shell === undefined ? {} : { shell }),
		...(conversation === undefined ? {} : { conversation }),
		...(responsive === undefined ? {} : { responsive }),
		...(header === undefined ? {} : { header }),
		...(panel === undefined ? {} : { panel }),
		...(bottom === undefined ? {} : { bottom }),
		...(windowConfig === undefined ? {} : { window: windowConfig }),
	}
}

/** Applies backward-compatible mobile defaults before the Widget creates its initial iframe. */
export function resolveInitialWidgetConfig(value: unknown): MagicWidget.WidgetConfig {
	const normalizedConfig = normalizeWidgetConfig(value)
	return {
		layout: "mobile",
		...normalizedConfig,
		responsive: {
			mobileDetection: "viewport",
			...normalizedConfig.responsive,
		},
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
		...(normalizedUpdate.responsive
			? { responsive: { ...current.responsive, ...normalizedUpdate.responsive } }
			: {}),
		...(normalizedUpdate.header
			? {
					header: {
						...current.header,
						...normalizedUpdate.header,
						...(normalizedUpdate.header.topicName
							? {
									topicName: {
										...current.header?.topicName,
										...normalizedUpdate.header.topicName,
									},
								}
							: {}),
						...(normalizedUpdate.header.actions
							? {
									actions: {
										...current.header?.actions,
										...normalizedUpdate.header.actions,
									},
								}
							: {}),
					},
				}
			: {}),
		...(normalizedUpdate.panel
			? { panel: { ...current.panel, ...normalizedUpdate.panel } }
			: {}),
		...(normalizedUpdate.bottom
			? {
					bottom: {
						...current.bottom,
						...normalizedUpdate.bottom,
						...Object.fromEntries(
							Object.entries(normalizedUpdate.bottom).map(([key, value]) => [
								key,
								{
									...(current.bottom?.[
										key as keyof MagicWidget.WidgetBottomConfig
									] ?? {}),
									...value,
								},
							]),
						),
					},
				}
			: {}),
		...(normalizedUpdate.window
			? { window: { ...current.window, ...normalizedUpdate.window } }
			: {}),
	}
}

/** Serializes only validated configuration fields for the protected initial query. */
export function serializeWidgetConfig(config: MagicWidget.WidgetConfig): string {
	return JSON.stringify(normalizeWidgetConfig(config))
}
