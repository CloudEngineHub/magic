import type { AssetMediaType } from "@/apis"
import type { CanvasAssetMediaType } from "../../../../public/magic-types"
import type { CanvasAssetImportResult } from "../../../../runtime/resources/asset/CanvasAssetImportManager"
import type {
	VideoEditorConfig,
	VideoInputSlotInfo,
	VideoReferenceAssetKind,
} from "./video-editor-config.types"
import { resolveLinkedFrameRoleForSlotIndex } from "./linkedFrameBindings"

interface VideoAssetMediaCapabilities {
	image: boolean
	video: boolean
	audio: boolean
}

export interface VideoAssetMediaTypes {
	assetMediaTypes: AssetMediaType[]
	canvasMediaTypes: CanvasAssetMediaType[]
}

type AssetSelectionHandlers = Pick<
	VideoEditorConfig["handlers"],
	"replaceFrameImageAt" | "replaceReferenceImageAt" | "setLinkedFrameBindings"
>

const ASSET_MEDIA_TYPE_BY_KIND: Record<VideoReferenceAssetKind, AssetMediaType> = {
	image: "IMAGE",
	video: "VIDEO",
	audio: "AUDIO",
}

/** 将当前视频槽位的模型约束转换为素材查询及 Canvas 导入共用类型。 */
export function resolveVideoAssetMediaTypes(
	slot: VideoInputSlotInfo,
	capabilities: VideoAssetMediaCapabilities,
): VideoAssetMediaTypes {
	if (slot.inputTab === "frame") {
		return { assetMediaTypes: ["IMAGE"], canvasMediaTypes: ["image"] }
	}

	const configuredKinds = slot.referenceAssetKinds?.length
		? slot.referenceAssetKinds
		: slot.referenceAssetKind
			? [slot.referenceAssetKind]
			: undefined
	const kinds =
		configuredKinds ??
		([
			...(capabilities.image ? (["image"] as const) : []),
			...(capabilities.video ? (["video"] as const) : []),
			...(capabilities.audio ? (["audio"] as const) : []),
		] satisfies VideoReferenceAssetKind[])
	const canvasMediaTypes = Array.from(new Set(kinds))
	return {
		canvasMediaTypes,
		assetMediaTypes: canvasMediaTypes.map((kind) => ASSET_MEDIA_TYPE_BY_KIND[kind]),
	}
}

/** 将已导入并连线的素材写入用户打开弹窗时捕获的视频编辑器槽位。 */
export function applyImportedAssetToVideoSlot(options: {
	slot: VideoInputSlotInfo
	imported: CanvasAssetImportResult
	supportsStartFrame: boolean
	supportsEndFrame: boolean
	retainResourceSlot?: boolean
	handlers: AssetSelectionHandlers
}): void {
	const { slot, imported, handlers, retainResourceSlot = false } = options
	const fileInfo = {
		path: imported.workspacePath,
		src: imported.workspacePath,
		fileName: imported.fileName,
	}

	if (slot.inputTab === "reference") {
		const importedFileInfo = {
			...fileInfo,
			assetType: imported.mediaType,
		}
		// 素材库确认属于一次显式选择；资源列表仍去重，但 Prompt 允许追加多个 mention。
		handlers.replaceReferenceImageAt(
			slot.slotIndex,
			importedFileInfo,
			retainResourceSlot
				? { ensurePromptMention: true, retainResourceSlot: true }
				: { ensurePromptMention: true },
		)
		return
	}

	handlers.replaceFrameImageAt(slot.slotIndex, fileInfo)
	const frameRole = resolveLinkedFrameRoleForSlotIndex(
		slot.slotIndex,
		options.supportsStartFrame,
		options.supportsEndFrame,
	)
	handlers.setLinkedFrameBindings((previous) => {
		const next = [...previous]
		next[slot.slotIndex] = {
			framePath: imported.workspacePath,
			sourceConnectionId: imported.connectionId,
			sourcePath: imported.workspacePath,
			sourceKind: "image",
			sourceFileName: imported.fileName,
			frameRole,
		}
		return next
	})
}
