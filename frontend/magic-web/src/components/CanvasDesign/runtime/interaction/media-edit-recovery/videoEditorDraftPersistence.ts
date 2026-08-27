import type {
	GenerateVideoRequest,
	StoredVideoEditorDraft,
	StoredVideoModeInputDraft,
	VideoInputMode,
} from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum } from "../../document/types"

export interface VideoEditorDraftSnapshot {
	request: Partial<GenerateVideoRequest>
	modeDrafts: Partial<Record<VideoInputMode, StoredVideoModeInputDraft>>
}

export function persistVideoEditorDraft(options: {
	canvas: Canvas
	elementId: string
	contentId: string
	snapshot: VideoEditorDraftSnapshot
	includeInHistory?: boolean
}): StoredVideoEditorDraft | null {
	const { canvas, elementId, contentId, snapshot, includeInHistory = false } = options
	const element = canvas.elementManager.getElementData(elementId)
	if (element?.type !== ElementTypeEnum.Video) return null
	const content = element.contents.find((item) => item.contentId === contentId)
	if (!content) return null

	const currentDraft = content.videoEditorDraft
	if (
		JSON.stringify(currentDraft?.request) === JSON.stringify(snapshot.request) &&
		JSON.stringify(currentDraft?.modeDrafts) === JSON.stringify(snapshot.modeDrafts)
	) {
		return currentDraft ?? null
	}

	const draft: StoredVideoEditorDraft = {
		version: 1,
		request: snapshot.request,
		modeDrafts: snapshot.modeDrafts,
		updatedAt: Date.now(),
	}
	canvas.elementManager.update(
		elementId,
		{
			contents: element.contents.map((item) =>
				item.contentId === contentId ? { ...item, videoEditorDraft: draft } : item,
			),
		},
		includeInHistory ? undefined : { historyPolicy: "exclude" },
	)
	return draft
}
