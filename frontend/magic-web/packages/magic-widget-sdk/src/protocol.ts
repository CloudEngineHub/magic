import type { MagicWidget } from "./types"

export const WIDGET_PROTOCOL = "magic-widget"
export const WIDGET_PROTOCOL_VERSION = 1
export const WIDGET_QUERY_EMBED = "magicWidgetEmbed"
export const WIDGET_QUERY_INSTANCE_ID = "magicWidgetInstanceId"
export const WIDGET_QUERY_PROTOCOL_VERSION = "magicWidgetProtocolVersion"
export const WIDGET_QUERY_HOST_ORIGIN = "magicWidgetHostOrigin"
export const WIDGET_QUERY_DEPLOYMENT_CODE = "magicWidgetDeploymentCode"
export const WIDGET_QUERY_CONFIG = "magicWidgetConfig"

export type WidgetCommandName =
	"setInput" | "appendInput" | "clearInput" | "getInput" | "sendMessage" | "newConversation"

export interface WidgetReadyMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	type: "ready"
	capabilities: WidgetCommandName[]
}

export interface WidgetCommandMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	requestId: string
	type: "command"
	command: WidgetCommandName
	payload?: { content?: string }
}

export interface WidgetResponseMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	requestId: string
	type: "response"
	ok: boolean
	result?: { content?: string }
	error?: { code: string; message: string }
}

export interface WidgetConfigMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	requestId: string
	type: "config"
	config: MagicWidget.WidgetConfig
}

export interface WidgetConfigReadyMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	type: "config_ready"
}

export interface WidgetUiStateMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	type: "ui_state"
	state: {
		previewFullscreen: boolean
	}
}

export interface WidgetUiCommandMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	type: "ui_command"
	command: "dismiss_preview"
}

/** Carries one validated SuperMagic runtime event from the iframe to its host. */
export interface WidgetRuntimeEventMessage {
	protocol: typeof WIDGET_PROTOCOL
	version: typeof WIDGET_PROTOCOL_VERSION
	instanceId: string
	type: "event"
	event: MagicWidget.RuntimeEvent
}

export type WidgetProtocolMessage =
	| WidgetReadyMessage
	| WidgetCommandMessage
	| WidgetConfigMessage
	| WidgetConfigReadyMessage
	| WidgetUiStateMessage
	| WidgetUiCommandMessage
	| WidgetRuntimeEventMessage
	| WidgetResponseMessage

/** Checks the minimal discriminated shape before the bridge exposes a runtime event. */
function isRuntimeEvent(value: unknown): value is MagicWidget.RuntimeEvent {
	if (!value || typeof value !== "object") return false
	const event = value as Record<string, unknown>
	return (
		event.type === "message.stream.started" ||
		event.type === "toolCall.settled" ||
		event.type === "task.completed"
	)
}

/** Checks the stable envelope before either side consumes a cross-window message. */
export function isWidgetProtocolMessage(value: unknown): value is WidgetProtocolMessage {
	if (!value || typeof value !== "object") return false
	const message = value as Record<string, unknown>
	const isKnownType =
		message.type === "ready" ||
		message.type === "command" ||
		message.type === "config" ||
		message.type === "config_ready" ||
		message.type === "ui_state" ||
		message.type === "ui_command" ||
		message.type === "response" ||
		(message.type === "event" && isRuntimeEvent(message.event))

	return (
		message.protocol === WIDGET_PROTOCOL &&
		message.version === WIDGET_PROTOCOL_VERSION &&
		typeof message.instanceId === "string" &&
		isKnownType
	)
}
