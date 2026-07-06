import type {
	CompleteImagePromptRequest,
	GenerateImageRequest,
} from "../../../../../public/magic-types"
import type {
	CanvasDesignPlugin,
	CanvasDesignPluginCapability,
} from "../../../../../runtime/document/types"

export type PluginFilePickerType = "image" | "video" | "audio" | "file"

export interface PluginPoint {
	x: number
	y: number
}

export interface PluginPickFilesOptions {
	type?: PluginFilePickerType
	multiple?: boolean
	maxCount?: number
	accept?: string[]
}

export interface PluginGenerateAndPlaceParams extends Partial<GenerateImageRequest> {
	width?: number
	height?: number
	count?: number
	select?: boolean
}

export interface PluginCompleteImagePromptParams extends Omit<
	CompleteImagePromptRequest,
	"project_id"
> {
	user_prompt: string
}

/** 插件图片投放目标类型：slot 替换单图，grid 追加多图 */
export type PluginCanvasAssetDragTargetMode = "slot" | "grid"

export type PluginRuntimeMessage =
	| {
			type: "magic-canvas-plugin:toast"
			message: string
			toastType?: "info" | "success" | "warning" | "error"
	  }
	| {
			type: "magic-canvas-plugin:close"
	  }
	| {
			type: "magic-canvas-plugin:error"
			message: string
	  }
	| {
			type: "magic-canvas-plugin:set-height"
			height: number
	  }
	| {
			type: "magic-canvas-plugin:resolve-resource"
			requestId: string
			path: string
	  }
	| {
			type: "magic-canvas-plugin:pick-files"
			requestId: string
			options?: PluginPickFilesOptions
			triggerPoint?: PluginPoint
	  }
	| {
			type: "magic-canvas-plugin:pointer-down"
	  }
	/** 插件 runtime 上报当前画布图片拖拽是否命中可投放目标 */
	| {
			type: "magic-canvas-plugin:canvas-asset-drag-target"
			dragSessionId: string
			targetId: string | null
			mode?: PluginCanvasAssetDragTargetMode
			canDrop: boolean
			/** grid 模式下当前投放区剩余可导入数量，供宿主截断 resolve */
			importRemaining?: number
	  }
	| {
			type: "magic-canvas-plugin:get-image-models"
			requestId: string
	  }
	| {
			type: "magic-canvas-plugin:generate-and-place"
			requestId: string
			params: PluginGenerateAndPlaceParams
	  }
	| {
			type: "magic-canvas-plugin:complete-image-prompt"
			requestId: string
			params: PluginCompleteImagePromptParams
	  }
	| {
			type: "magic-canvas-plugin:upload-file"
			requestId: string
			arrayBuffer: ArrayBuffer
			fileName: string
			mimeType: string
	  }
	| {
			type: "magic-canvas-plugin:resolve-file-assets"
			requestId: string
			files: Array<{ path: string; fileName?: string }>
			options?: PluginPickFilesOptions
	  }
	| {
			type: "magic-canvas-plugin:read-canvas-clipboard"
			requestId: string
	  }
	| {
			type: "magic-canvas-plugin:fetch-blob"
			requestId: string
			url: string
	  }
	| {
			type: "magic-canvas-plugin:storage-get"
			requestId: string
			key: string
	  }
	| {
			type: "magic-canvas-plugin:storage-set"
			requestId: string
			key: string
			value: string
	  }
	| {
			type: "magic-canvas-plugin:storage-remove"
			requestId: string
			key: string
	  }
	| {
			type: "magic-canvas-plugin:storage-get-shared-generation-config"
			requestId: string
	  }
	| {
			type: "magic-canvas-plugin:storage-set-shared-generation-config"
			requestId: string
			value: string
	  }
	| {
			type: "magic-canvas-plugin:storage-remove-shared-generation-config"
			requestId: string
	  }

export const PLUGIN_RUNTIME_RESULT_TYPE_BY_MESSAGE_TYPE = {
	"magic-canvas-plugin:resolve-resource": "magic-canvas-plugin:resolve-resource-result",
	"magic-canvas-plugin:pick-files": "magic-canvas-plugin:pick-files-result",
	"magic-canvas-plugin:get-image-models": "magic-canvas-plugin:get-image-models-result",
	"magic-canvas-plugin:generate-and-place": "magic-canvas-plugin:generate-and-place-result",
	"magic-canvas-plugin:complete-image-prompt": "magic-canvas-plugin:complete-image-prompt-result",
	"magic-canvas-plugin:upload-file": "magic-canvas-plugin:upload-file-result",
	"magic-canvas-plugin:resolve-file-assets": "magic-canvas-plugin:resolve-file-assets-result",
	"magic-canvas-plugin:read-canvas-clipboard": "magic-canvas-plugin:read-canvas-clipboard-result",
	"magic-canvas-plugin:fetch-blob": "magic-canvas-plugin:fetch-blob-result",
	"magic-canvas-plugin:storage-get": "magic-canvas-plugin:storage-get-result",
	"magic-canvas-plugin:storage-set": "magic-canvas-plugin:storage-set-result",
	"magic-canvas-plugin:storage-remove": "magic-canvas-plugin:storage-remove-result",
	"magic-canvas-plugin:storage-get-shared-generation-config":
		"magic-canvas-plugin:storage-get-shared-generation-config-result",
	"magic-canvas-plugin:storage-set-shared-generation-config":
		"magic-canvas-plugin:storage-set-shared-generation-config-result",
	"magic-canvas-plugin:storage-remove-shared-generation-config":
		"magic-canvas-plugin:storage-remove-shared-generation-config-result",
} as const

const PLUGIN_RUNTIME_CAPABILITY_BY_MESSAGE_TYPE: Partial<
	Record<PluginRuntimeMessage["type"], CanvasDesignPluginCapability>
> = {
	"magic-canvas-plugin:toast": "ui.toast",
	"magic-canvas-plugin:close": "ui.close",
	"magic-canvas-plugin:set-height": "ui.setHeight",
	"magic-canvas-plugin:resolve-resource": "resources.resolve",
	"magic-canvas-plugin:pick-files": "assets.pickFiles",
	"magic-canvas-plugin:canvas-asset-drag-target": "assets.pickFiles",
	"magic-canvas-plugin:get-image-models": "ai.getImageModels",
	"magic-canvas-plugin:generate-and-place": "ai.generateAndPlace",
	"magic-canvas-plugin:complete-image-prompt": "ai.completeImagePrompt",
	"magic-canvas-plugin:upload-file": "assets.uploadFile",
	"magic-canvas-plugin:resolve-file-assets": "assets.pickFiles",
	"magic-canvas-plugin:read-canvas-clipboard": "assets.pickFiles",
	"magic-canvas-plugin:fetch-blob": "assets.fetchBlob",
	"magic-canvas-plugin:storage-get": "plugin.storage",
	"magic-canvas-plugin:storage-set": "plugin.storage",
	"magic-canvas-plugin:storage-remove": "plugin.storage",
	"magic-canvas-plugin:storage-get-shared-generation-config": "plugin.storage",
	"magic-canvas-plugin:storage-set-shared-generation-config": "plugin.storage",
	"magic-canvas-plugin:storage-remove-shared-generation-config": "plugin.storage",
}

export function createPluginChannelToken(): string {
	return createOpaqueRuntimeId("plugin")
}

/** 单次画布图片外部拖拽会话 ID，由宿主生成并在 drag-move / drag-target 间传递 */
export function createCanvasAssetDragSessionId(): string {
	return createOpaqueRuntimeId("canvas-asset-drag")
}

function createOpaqueRuntimeId(prefix: string): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID()
	}
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getPluginRuntimeMessageCapability(
	type: PluginRuntimeMessage["type"],
): CanvasDesignPluginCapability | undefined {
	return PLUGIN_RUNTIME_CAPABILITY_BY_MESSAGE_TYPE[type]
}

export function getPluginRuntimeResultType(type: PluginRuntimeMessage["type"]): string | undefined {
	return PLUGIN_RUNTIME_RESULT_TYPE_BY_MESSAGE_TYPE[
		type as keyof typeof PLUGIN_RUNTIME_RESULT_TYPE_BY_MESSAGE_TYPE
	]
}

export function pluginHasCapability(
	plugin: Pick<CanvasDesignPlugin, "capabilities">,
	capability: CanvasDesignPluginCapability,
): boolean {
	return plugin.capabilities?.includes(capability) ?? false
}

export function parsePluginRuntimeMessage(
	data: unknown,
	expectedChannelToken: string,
): PluginRuntimeMessage | null {
	if (!data || typeof data !== "object") return null
	const record = data as Record<string, unknown>
	if (record.channelToken !== expectedChannelToken) return null
	if (record.type === "magic-canvas-plugin:close") {
		return {
			type: "magic-canvas-plugin:close",
		}
	}
	if (record.type === "magic-canvas-plugin:set-height" && typeof record.height === "number") {
		return {
			type: "magic-canvas-plugin:set-height",
			height: record.height,
		}
	}
	if (
		record.type === "magic-canvas-plugin:resolve-resource" &&
		typeof record.requestId === "string" &&
		typeof record.path === "string"
	) {
		return {
			type: "magic-canvas-plugin:resolve-resource",
			requestId: record.requestId,
			path: record.path,
		}
	}
	if (record.type === "magic-canvas-plugin:pick-files" && typeof record.requestId === "string") {
		return {
			type: "magic-canvas-plugin:pick-files",
			requestId: record.requestId,
			options: parsePluginPickFilesOptions(record.options),
			triggerPoint: parsePluginPoint(record.triggerPoint),
		}
	}
	if (record.type === "magic-canvas-plugin:pointer-down") {
		return {
			type: "magic-canvas-plugin:pointer-down",
		}
	}
	if (record.type === "magic-canvas-plugin:canvas-asset-drag-target") {
		const dragSessionId =
			typeof record.dragSessionId === "string" ? record.dragSessionId.trim() : ""
		if (!dragSessionId) return null
		// 对 iframe 传回的目标信息做收窄，避免宿主保存非法 mode/targetId。
		const mode = record.mode === "slot" || record.mode === "grid" ? record.mode : undefined
		const importRemaining =
			typeof record.importRemaining === "number" && Number.isFinite(record.importRemaining)
				? Math.max(0, Math.floor(record.importRemaining))
				: undefined
		return {
			type: "magic-canvas-plugin:canvas-asset-drag-target",
			dragSessionId,
			targetId: typeof record.targetId === "string" ? record.targetId : null,
			mode,
			canDrop: record.canDrop === true,
			importRemaining,
		}
	}
	if (
		record.type === "magic-canvas-plugin:get-image-models" &&
		typeof record.requestId === "string"
	) {
		return {
			type: "magic-canvas-plugin:get-image-models",
			requestId: record.requestId,
		}
	}
	if (
		record.type === "magic-canvas-plugin:generate-and-place" &&
		typeof record.requestId === "string" &&
		record.params &&
		typeof record.params === "object"
	) {
		return {
			type: "magic-canvas-plugin:generate-and-place",
			requestId: record.requestId,
			params: record.params as PluginGenerateAndPlaceParams,
		}
	}
	if (
		record.type === "magic-canvas-plugin:complete-image-prompt" &&
		typeof record.requestId === "string" &&
		record.params &&
		typeof record.params === "object" &&
		typeof (record.params as Record<string, unknown>).user_prompt === "string"
	) {
		return {
			type: "magic-canvas-plugin:complete-image-prompt",
			requestId: record.requestId,
			params: record.params as PluginCompleteImagePromptParams,
		}
	}
	if (
		record.type === "magic-canvas-plugin:upload-file" &&
		typeof record.requestId === "string" &&
		record.arrayBuffer instanceof ArrayBuffer &&
		typeof record.fileName === "string" &&
		typeof record.mimeType === "string"
	) {
		return {
			type: "magic-canvas-plugin:upload-file",
			requestId: record.requestId,
			arrayBuffer: record.arrayBuffer,
			fileName: record.fileName,
			mimeType: record.mimeType,
		}
	}
	if (
		record.type === "magic-canvas-plugin:fetch-blob" &&
		typeof record.requestId === "string" &&
		typeof record.url === "string"
	) {
		return {
			type: "magic-canvas-plugin:fetch-blob",
			requestId: record.requestId,
			url: record.url,
		}
	}
	if (
		record.type === "magic-canvas-plugin:read-canvas-clipboard" &&
		typeof record.requestId === "string"
	) {
		return {
			type: "magic-canvas-plugin:read-canvas-clipboard",
			requestId: record.requestId,
		}
	}
	if (
		record.type === "magic-canvas-plugin:resolve-file-assets" &&
		typeof record.requestId === "string" &&
		Array.isArray(record.files)
	) {
		const files = record.files
			.filter(
				(file): file is { path: string; fileName?: string } =>
					Boolean(file) &&
					typeof file === "object" &&
					typeof (file as Record<string, unknown>).path === "string",
			)
			.map((file) => ({
				path: file.path,
				fileName:
					typeof file.fileName === "string" && file.fileName.trim()
						? file.fileName
						: undefined,
			}))
		return {
			type: "magic-canvas-plugin:resolve-file-assets",
			requestId: record.requestId,
			files,
			options: parsePluginPickFilesOptions(record.options),
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-get" &&
		typeof record.requestId === "string" &&
		typeof record.key === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-get",
			requestId: record.requestId,
			key: record.key,
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-set" &&
		typeof record.requestId === "string" &&
		typeof record.key === "string" &&
		typeof record.value === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-set",
			requestId: record.requestId,
			key: record.key,
			value: record.value,
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-remove" &&
		typeof record.requestId === "string" &&
		typeof record.key === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-remove",
			requestId: record.requestId,
			key: record.key,
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-get-shared-generation-config" &&
		typeof record.requestId === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-get-shared-generation-config",
			requestId: record.requestId,
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-set-shared-generation-config" &&
		typeof record.requestId === "string" &&
		typeof record.value === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-set-shared-generation-config",
			requestId: record.requestId,
			value: record.value,
		}
	}
	if (
		record.type === "magic-canvas-plugin:storage-remove-shared-generation-config" &&
		typeof record.requestId === "string"
	) {
		return {
			type: "magic-canvas-plugin:storage-remove-shared-generation-config",
			requestId: record.requestId,
		}
	}
	if (record.type === "magic-canvas-plugin:error" && typeof record.message === "string") {
		return {
			type: "magic-canvas-plugin:error",
			message: record.message,
		}
	}
	if (record.type === "magic-canvas-plugin:toast" && typeof record.message === "string") {
		const toastType =
			record.toastType === "success" ||
			record.toastType === "warning" ||
			record.toastType === "error" ||
			record.toastType === "info"
				? record.toastType
				: undefined
		return {
			type: "magic-canvas-plugin:toast",
			message: record.message,
			toastType,
		}
	}
	return null
}

function parsePluginPoint(point: unknown): PluginPoint | undefined {
	if (!point || typeof point !== "object") return undefined
	const record = point as Record<string, unknown>
	if (typeof record.x !== "number" || typeof record.y !== "number") return undefined
	return {
		x: record.x,
		y: record.y,
	}
}

function parsePluginPickFilesOptions(options: unknown): PluginPickFilesOptions | undefined {
	if (!options || typeof options !== "object") return undefined
	const record = options as Record<string, unknown>
	const type =
		record.type === "image" ||
		record.type === "video" ||
		record.type === "audio" ||
		record.type === "file"
			? record.type
			: undefined
	return {
		type,
		multiple: typeof record.multiple === "boolean" ? record.multiple : undefined,
		maxCount: typeof record.maxCount === "number" ? record.maxCount : undefined,
		accept: Array.isArray(record.accept)
			? record.accept.filter((item): item is string => typeof item === "string")
			: undefined,
	}
}
