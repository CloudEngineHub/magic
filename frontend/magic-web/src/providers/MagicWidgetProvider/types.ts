import type { MagicWidget } from "@magic-web/widget-sdk"

export type MagicWidgetConfig = MagicWidget.WidgetConfig
export type MagicWidgetLayout = MagicWidget.Layout

export interface MagicWidgetEmbedContext {
	instanceId: string
	protocolVersion: number
	hostOrigin: string
}

export interface MagicWidgetContextValue {
	embedContext: MagicWidgetEmbedContext | null
	config: MagicWidgetConfig
}
