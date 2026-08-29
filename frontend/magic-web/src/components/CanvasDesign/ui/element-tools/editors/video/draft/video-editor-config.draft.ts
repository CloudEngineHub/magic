import type { UploadFileResponse, VideoInputMode } from "../../../../../public/magic-types"
import type {
	LinkedFrameBinding,
	VideoModeInputDraft,
	VideoReferenceAssetInfo,
} from "../video-editor-config.types"

export function cloneFrameSlotInfos(
	frames?: Array<UploadFileResponse | undefined>,
): Array<UploadFileResponse | undefined> {
	return (frames || []).map((item) => (item ? { ...item } : item))
}

export function cloneVideoReferenceAssetInfos(
	infos?: VideoReferenceAssetInfo[],
): VideoReferenceAssetInfo[] {
	return (infos || []).map((item) => ({ ...item }))
}

export function cloneLinkedFrameBindings(
	bindings?: Array<LinkedFrameBinding | undefined>,
): Array<LinkedFrameBinding | undefined> {
	return (bindings || []).map((binding) => (binding ? { ...binding } : binding))
}

export function cloneModeDraftCache(
	src: Partial<Record<VideoInputMode, VideoModeInputDraft>>,
): Partial<Record<VideoInputMode, VideoModeInputDraft>> {
	const out: Partial<Record<VideoInputMode, VideoModeInputDraft>> = {}
	for (const mode of [
		"standard",
		"keyframe_guided",
		"image_reference",
		"omni_reference",
		"video_edit",
	] as const) {
		const draft = src[mode]
		if (!draft) continue
		out[mode] = {
			prompt: draft.prompt ?? "",
			activeInputTab: draft.activeInputTab ?? "frame",
			frameImageInfos: cloneFrameSlotInfos(draft.frameImageInfos),
			linkedFrameBindings: cloneLinkedFrameBindings(draft.linkedFrameBindings),
			referenceAssetInfos: cloneVideoReferenceAssetInfos(draft.referenceAssetInfos),
		}
	}
	return out
}

/** 将当前 UI 状态合并进各模式草稿（用于持久化到画布元素与 storage） */
export function mergeCurrentUiIntoModeDraftCache(
	base: Partial<Record<VideoInputMode, VideoModeInputDraft>>,
	selectedMode: VideoInputMode,
	prompt: string,
	activeInputTab: "frame" | "reference",
	frames: Array<UploadFileResponse | undefined>,
	refs: VideoReferenceAssetInfo[],
	linkedFrameBindings: Array<LinkedFrameBinding | undefined>,
): Partial<Record<VideoInputMode, VideoModeInputDraft>> {
	const out = cloneModeDraftCache(base)
	out[selectedMode] = {
		prompt,
		activeInputTab,
		frameImageInfos: cloneFrameSlotInfos(frames),
		linkedFrameBindings: cloneLinkedFrameBindings(linkedFrameBindings),
		referenceAssetInfos: cloneVideoReferenceAssetInfos(refs),
	}
	return out
}
