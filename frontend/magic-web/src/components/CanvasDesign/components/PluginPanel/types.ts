import type { PluginPickFilesOptions, PluginPoint } from "./runtime/v1"
import type { resolvePluginIcon } from "../../canvas/plugins/resolve"

export interface PluginWindowPosition {
	x: number
	y: number
}

export interface PluginView {
	label: string
	description: string
	icon: ReturnType<typeof resolvePluginIcon>
	srcDoc: string | null
}

export type PluginFilePickerType = "image" | "video" | "audio" | "file"

export interface PluginFileAsset {
	id: string
	path: string
	url: string
	src: string
	fileName: string
	type?: PluginFilePickerType
	width?: number
	height?: number
}

export interface PluginFilePickerRequest {
	requestId: string
	options?: PluginPickFilesOptions
	anchorPosition?: PluginPoint
}
