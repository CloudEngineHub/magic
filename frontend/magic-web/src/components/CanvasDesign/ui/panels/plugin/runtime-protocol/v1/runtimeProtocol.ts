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

export const PLUGIN_RUNTIME_MESSAGE_TYPE = {
	Toast: "magic-canvas-plugin:toast",
	Close: "magic-canvas-plugin:close",
	Error: "magic-canvas-plugin:error",
	SetHeight: "magic-canvas-plugin:set-height",
	ResolveResource: "magic-canvas-plugin:resolve-resource",
	PickFiles: "magic-canvas-plugin:pick-files",
	PointerDown: "magic-canvas-plugin:pointer-down",
	CanvasAssetDragTarget: "magic-canvas-plugin:canvas-asset-drag-target",
	GetImageModels: "magic-canvas-plugin:get-image-models",
	GenerateAndPlace: "magic-canvas-plugin:generate-and-place",
	CompleteImagePrompt: "magic-canvas-plugin:complete-image-prompt",
	UploadFile: "magic-canvas-plugin:upload-file",
	ResolveFileAssets: "magic-canvas-plugin:resolve-file-assets",
	ReadCanvasClipboard: "magic-canvas-plugin:read-canvas-clipboard",
	FetchBlob: "magic-canvas-plugin:fetch-blob",
	StorageGet: "magic-canvas-plugin:storage-get",
	StorageSet: "magic-canvas-plugin:storage-set",
	StorageRemove: "magic-canvas-plugin:storage-remove",
	StorageGetSharedGenerationConfig: "magic-canvas-plugin:storage-get-shared-generation-config",
	StorageSetSharedGenerationConfig: "magic-canvas-plugin:storage-set-shared-generation-config",
	StorageRemoveSharedGenerationConfig:
		"magic-canvas-plugin:storage-remove-shared-generation-config",
} as const

export const PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE = {
	ResolveResource: "magic-canvas-plugin:resolve-resource-result",
	PickFiles: "magic-canvas-plugin:pick-files-result",
	GetImageModels: "magic-canvas-plugin:get-image-models-result",
	GenerateAndPlace: "magic-canvas-plugin:generate-and-place-result",
	CompleteImagePrompt: "magic-canvas-plugin:complete-image-prompt-result",
	UploadFile: "magic-canvas-plugin:upload-file-result",
	ResolveFileAssets: "magic-canvas-plugin:resolve-file-assets-result",
	ReadCanvasClipboard: "magic-canvas-plugin:read-canvas-clipboard-result",
	FetchBlob: "magic-canvas-plugin:fetch-blob-result",
	StorageGet: "magic-canvas-plugin:storage-get-result",
	StorageSet: "magic-canvas-plugin:storage-set-result",
	StorageRemove: "magic-canvas-plugin:storage-remove-result",
	StorageGetSharedGenerationConfig:
		"magic-canvas-plugin:storage-get-shared-generation-config-result",
	StorageSetSharedGenerationConfig:
		"magic-canvas-plugin:storage-set-shared-generation-config-result",
	StorageRemoveSharedGenerationConfig:
		"magic-canvas-plugin:storage-remove-shared-generation-config-result",
} as const

export type PluginRuntimeMessage =
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.Toast
			message: string
			toastType?: "info" | "success" | "warning" | "error"
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.Close
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.Error
			message: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.SetHeight
			height: number
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveResource
			requestId: string
			path: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.PickFiles
			requestId: string
			options?: PluginPickFilesOptions
			triggerPoint?: PluginPoint
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.PointerDown
	  }
	/** 插件 runtime 上报当前画布图片拖拽是否命中可投放目标 */
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.CanvasAssetDragTarget
			dragSessionId: string
			targetId: string | null
			mode?: PluginCanvasAssetDragTargetMode
			canDrop: boolean
			/** grid 模式下当前投放区剩余可导入数量，供宿主截断 resolve */
			importRemaining?: number
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.GetImageModels
			requestId: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.GenerateAndPlace
			requestId: string
			params: PluginGenerateAndPlaceParams
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.CompleteImagePrompt
			requestId: string
			params: PluginCompleteImagePromptParams
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.UploadFile
			requestId: string
			arrayBuffer: ArrayBuffer
			fileName: string
			mimeType: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveFileAssets
			requestId: string
			files: Array<{ path: string; fileName?: string }>
			options?: PluginPickFilesOptions
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.ReadCanvasClipboard
			requestId: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.FetchBlob
			requestId: string
			url: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGet
			requestId: string
			key: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSet
			requestId: string
			key: string
			value: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemove
			requestId: string
			key: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGetSharedGenerationConfig
			requestId: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSetSharedGenerationConfig
			requestId: string
			value: string
	  }
	| {
			type: typeof PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig
			requestId: string
	  }

export const PLUGIN_RUNTIME_RESULT_TYPE_BY_MESSAGE_TYPE = {
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveResource]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.ResolveResource,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.PickFiles]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.PickFiles,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.GetImageModels]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.GetImageModels,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.GenerateAndPlace]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.GenerateAndPlace,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.CompleteImagePrompt]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.CompleteImagePrompt,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.UploadFile]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.UploadFile,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveFileAssets]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.ResolveFileAssets,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ReadCanvasClipboard]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.ReadCanvasClipboard,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.FetchBlob]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.FetchBlob,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGet]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageGet,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSet]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageSet,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemove]: PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageRemove,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGetSharedGenerationConfig]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageGetSharedGenerationConfig,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSetSharedGenerationConfig]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageSetSharedGenerationConfig,
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig]:
		PLUGIN_RUNTIME_RESULT_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig,
} as const

const PLUGIN_RUNTIME_CAPABILITY_BY_MESSAGE_TYPE: Partial<
	Record<PluginRuntimeMessage["type"], CanvasDesignPluginCapability>
> = {
	[PLUGIN_RUNTIME_MESSAGE_TYPE.Toast]: "ui.toast",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.Close]: "ui.close",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.SetHeight]: "ui.setHeight",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveResource]: "resources.resolve",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.PickFiles]: "assets.pickFiles",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.CanvasAssetDragTarget]: "assets.pickFiles",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.GetImageModels]: "ai.getImageModels",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.GenerateAndPlace]: "ai.generateAndPlace",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.CompleteImagePrompt]: "ai.completeImagePrompt",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.UploadFile]: "assets.uploadFile",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveFileAssets]: "assets.pickFiles",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.ReadCanvasClipboard]: "assets.pickFiles",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.FetchBlob]: "assets.fetchBlob",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGet]: "plugin.storage",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSet]: "plugin.storage",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemove]: "plugin.storage",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGetSharedGenerationConfig]: "plugin.storage",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSetSharedGenerationConfig]: "plugin.storage",
	[PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig]: "plugin.storage",
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
	switch (record.type) {
		case PLUGIN_RUNTIME_MESSAGE_TYPE.Close:
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.Close,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.SetHeight:
			if (typeof record.height !== "number") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.SetHeight,
				height: record.height,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveResource:
			if (typeof record.requestId !== "string" || typeof record.path !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveResource,
				requestId: record.requestId,
				path: record.path,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.PickFiles:
			if (typeof record.requestId !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.PickFiles,
				requestId: record.requestId,
				options: parsePluginPickFilesOptions(record.options),
				triggerPoint: parsePluginPoint(record.triggerPoint),
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.PointerDown:
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.PointerDown,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.CanvasAssetDragTarget: {
			const dragSessionId =
				typeof record.dragSessionId === "string" ? record.dragSessionId.trim() : ""
			if (!dragSessionId) return null
			// 对 iframe 传回的目标信息做收窄，避免宿主保存非法 mode/targetId。
			const mode = record.mode === "slot" || record.mode === "grid" ? record.mode : undefined
			const importRemaining =
				typeof record.importRemaining === "number" &&
				Number.isFinite(record.importRemaining)
					? Math.max(0, Math.floor(record.importRemaining))
					: undefined
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.CanvasAssetDragTarget,
				dragSessionId,
				targetId: typeof record.targetId === "string" ? record.targetId : null,
				mode,
				canDrop: record.canDrop === true,
				importRemaining,
			}
		}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.GetImageModels:
			if (typeof record.requestId !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.GetImageModels,
				requestId: record.requestId,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.GenerateAndPlace:
			if (
				typeof record.requestId !== "string" ||
				!record.params ||
				typeof record.params !== "object"
			) {
				return null
			}
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.GenerateAndPlace,
				requestId: record.requestId,
				params: record.params as PluginGenerateAndPlaceParams,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.CompleteImagePrompt:
			if (
				typeof record.requestId !== "string" ||
				!record.params ||
				typeof record.params !== "object" ||
				typeof (record.params as Record<string, unknown>).user_prompt !== "string"
			) {
				return null
			}
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.CompleteImagePrompt,
				requestId: record.requestId,
				params: record.params as PluginCompleteImagePromptParams,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.UploadFile:
			if (
				typeof record.requestId !== "string" ||
				!(record.arrayBuffer instanceof ArrayBuffer) ||
				typeof record.fileName !== "string" ||
				typeof record.mimeType !== "string"
			) {
				return null
			}
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.UploadFile,
				requestId: record.requestId,
				arrayBuffer: record.arrayBuffer,
				fileName: record.fileName,
				mimeType: record.mimeType,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.FetchBlob:
			if (typeof record.requestId !== "string" || typeof record.url !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.FetchBlob,
				requestId: record.requestId,
				url: record.url,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.ReadCanvasClipboard:
			if (typeof record.requestId !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.ReadCanvasClipboard,
				requestId: record.requestId,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveFileAssets:
			if (typeof record.requestId !== "string" || !Array.isArray(record.files)) return null
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
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.ResolveFileAssets,
				requestId: record.requestId,
				files,
				options: parsePluginPickFilesOptions(record.options),
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGet:
			if (typeof record.requestId !== "string" || typeof record.key !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGet,
				requestId: record.requestId,
				key: record.key,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSet:
			if (
				typeof record.requestId !== "string" ||
				typeof record.key !== "string" ||
				typeof record.value !== "string"
			) {
				return null
			}
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSet,
				requestId: record.requestId,
				key: record.key,
				value: record.value,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemove:
			if (typeof record.requestId !== "string" || typeof record.key !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemove,
				requestId: record.requestId,
				key: record.key,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGetSharedGenerationConfig:
			if (typeof record.requestId !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageGetSharedGenerationConfig,
				requestId: record.requestId,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSetSharedGenerationConfig:
			if (typeof record.requestId !== "string" || typeof record.value !== "string")
				return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageSetSharedGenerationConfig,
				requestId: record.requestId,
				value: record.value,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig:
			if (typeof record.requestId !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.StorageRemoveSharedGenerationConfig,
				requestId: record.requestId,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.Error:
			if (typeof record.message !== "string") return null
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.Error,
				message: record.message,
			}
		case PLUGIN_RUNTIME_MESSAGE_TYPE.Toast:
			if (typeof record.message !== "string") return null
			const toastType =
				record.toastType === "success" ||
				record.toastType === "warning" ||
				record.toastType === "error" ||
				record.toastType === "info"
					? record.toastType
					: undefined
			return {
				type: PLUGIN_RUNTIME_MESSAGE_TYPE.Toast,
				message: record.message,
				toastType,
			}
		default:
			return null
	}
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
