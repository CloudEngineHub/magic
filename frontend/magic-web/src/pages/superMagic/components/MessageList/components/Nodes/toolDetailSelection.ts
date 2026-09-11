import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { DisabledDetailToolTypes } from "@/pages/superMagic/components/Detail/constants"

// 使用 Symbol 保持现有单参数回调契约，同时避免内部交互标记与工具详情字段重名或被序列化。
const TOOL_DETAIL_SELECTION_TARGET = Symbol("toolDetailSelectionTarget")

type ToolDetailSelectionTarget = "detail" | "file"
type ToolDetail = Record<string, unknown> & {
	[TOOL_DETAIL_SELECTION_TARGET]?: ToolDetailSelectionTarget
}

export type ToolCardInteractionTarget =
	| { type: "disabled" }
	| { type: "playback" }
	| { type: "file"; fileId: string }
	| { type: "design" }

const DESIGN_TOOL_NAMES = new Set([
	"create_design_project",
	"create_canvas_element",
	"update_canvas_element",
	"batch_create_canvas_elements",
	"batch_update_canvas_elements",
	"reorder_canvas_elements",
	"query_canvas_overview",
	"query_canvas_element",
	"generate_images_to_canvas",
	"search_images_to_canvas",
	"generate_videos_to_canvas",
	"query_video_generation",
	"create_canvas",
	"generate_canvas_images",
	"generate_canvas_videos",
])

interface SelectToolDetailOptions {
	detail: Record<string, unknown>
	onSelectDetail?: (detail: ToolDetail) => void
}

interface SelectSourceFileOptions extends SelectToolDetailOptions {
	fileId: string
}

export function resolveToolFileId(data: unknown): string | undefined {
	if (!data || typeof data !== "object" || Array.isArray(data)) return undefined

	const detailData = data as Record<string, unknown>
	const candidate = [detailData.source_file_id, detailData.target_file_id].find(
		(value): value is string => typeof value === "string" && value.length > 0,
	)
	return candidate
}

export function getToolCardInteractionTarget(
	toolName: string | undefined,
	detail: unknown,
): ToolCardInteractionTarget {
	if (
		!detail ||
		typeof detail !== "object" ||
		Array.isArray(detail) ||
		Object.keys(detail).length === 0
	) {
		return { type: "disabled" }
	}
	if (toolName && DisabledDetailToolTypes.includes(toolName)) {
		return { type: "disabled" }
	}
	if (toolName && DESIGN_TOOL_NAMES.has(toolName)) {
		return { type: "design" }
	}

	const detailRecord = detail as Record<string, unknown>
	if (detailRecord.type === "browser") {
		return { type: "playback" }
	}
	const fileId = resolveToolFileId(detailRecord.data)
	return fileId ? { type: "file", fileId } : { type: "playback" }
}

function markSelectionTarget(
	detail: Record<string, unknown>,
	target: ToolDetailSelectionTarget,
): ToolDetail {
	return { ...detail, isFromNode: true, [TOOL_DETAIL_SELECTION_TARGET]: target }
}

export function getToolDetailSelectionTarget(
	detail: unknown,
): ToolDetailSelectionTarget | undefined {
	if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined

	return (detail as ToolDetail)[TOOL_DETAIL_SELECTION_TARGET]
}

export function selectSourceFileFromTool({
	detail,
	fileId,
	onSelectDetail,
}: SelectSourceFileOptions) {
	pubsub.publish(PubSubEvents.Open_File_Tab, { fileId })
	pubsub.publish(PubSubEvents.Locate_File_In_Tree, fileId)
	onSelectDetail?.(markSelectionTarget(detail, "file"))
}

export function selectToolDetail({ detail, onSelectDetail }: SelectToolDetailOptions) {
	pubsub.publish(PubSubEvents.Open_Playback_Tab, detail)
	onSelectDetail?.(markSelectionTarget(detail, "detail"))
}
