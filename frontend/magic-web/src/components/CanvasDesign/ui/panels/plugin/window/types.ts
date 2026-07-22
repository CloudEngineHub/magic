import type { PluginPickFilesOptions, PluginPoint } from "../runtime-protocol/v1/index"
import type { resolvePluginIcon } from "../../../../runtime/plugins/resolve"
import type { CanvasElementClipboardOperation } from "../../../../runtime/resources/clipboard/CanvasElementClipboard"
import {
	CANVAS_ELEMENT_CLIPBOARD_SOURCE,
	CANVAS_ELEMENT_CLIPBOARD_VERSION,
} from "../../../../runtime/resources/clipboard/CanvasElementClipboard"

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
	/** Host 内部提示字段：当 asset 来自画布图片时，记录原始画布元素 id。 */
	sourceElementId?: string
}

export interface PluginFilePickerRequest {
	requestId: string
	options?: PluginPickFilesOptions
	anchorPosition?: PluginPoint
}

/** 画布剪贴板中单条媒体文件的 metadata（由 Host read-canvas-clipboard 回传）。 */
export interface PluginCanvasClipboardFileMetadata {
	id: string
	elementId: string
	filename: string
	mimeType: string
	fileSize: number
	role: "element-media" | "canvas-export"
	sourceRef?: {
		src?: string
		ossUrl?: string
		expiresAt?: string
	}
}

/** 画布剪贴板 payload（不含 elements / Blob，供 postMessage 传递）。 */
export interface PluginCanvasClipboardPayload {
	source: typeof CANVAS_ELEMENT_CLIPBOARD_SOURCE
	version: typeof CANVAS_ELEMENT_CLIPBOARD_VERSION
	operation: CanvasElementClipboardOperation
	files: PluginCanvasClipboardFileMetadata[]
}

/** Host read-canvas-clipboard 的完整响应。copy-as-png 时 uploadedAssets 可能非空。 */
export interface PluginCanvasClipboardReadResult {
	payload: PluginCanvasClipboardPayload | null
	uploadedAssets: PluginFileAsset[]
}
