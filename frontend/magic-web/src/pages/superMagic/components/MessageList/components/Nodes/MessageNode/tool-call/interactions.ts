import { isEmpty, pick } from "lodash-es"
import { DisabledDetailToolTypes } from "@/pages/superMagic/components/Detail/constants"
import { getToolDesignProjectInfo } from "@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { ToolCallViewModel } from "./types"

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

interface HandleToolCallInteractionOptions {
	toolData: ToolCallViewModel
	onSelectDetail?: (detail: unknown) => void
}

export function handleToolCallInteraction({
	toolData,
	onSelectDetail,
}: HandleToolCallInteractionOptions) {
	const toolInfo = pick(toolData, ["name", "url", "action", "remark", "id"])
	const newDetail = { ...toolData.detail, ...toolInfo }

	if (
		(toolData.name && DisabledDetailToolTypes.includes(toolData.name)) ||
		isEmpty(toolData.detail)
	)
		return

	if (toolData.name && DESIGN_TOOL_NAMES.has(toolData.name)) {
		const { designProjectId, designProject, elements } = getToolDesignProjectInfo(toolData)
		const canvasDesignId = String(designProjectId || "")
		pubsub.publish(PubSubEvents.Open_File_Tab, {
			...designProject,
			fileId: canvasDesignId,
		})
		if (elements.length > 0 && canvasDesignId) {
			setTimeout(() => {
				pubsub.publish(PubSubEvents.Super_Magic_Focus_Canvas_Element, {
					canvasDesignId,
					elementIds: elements.map((item) => item.id),
					selectElement: [elements[0].id],
					animated: false,
					padding: { top: "25%", right: "25%", bottom: "25%", left: "25%" },
				})
			}, 200)
		}
		return
	}

	const detailData = newDetail as { data?: { source_file_id?: string } }
	if (detailData.data?.source_file_id) {
		pubsub.publish(PubSubEvents.Open_File_Tab, { fileId: detailData.data.source_file_id })
		pubsub.publish(PubSubEvents.Locate_File_In_Tree, detailData.data.source_file_id)
	} else {
		pubsub.publish(PubSubEvents.Open_Playback_Tab, detailData)
	}

	onSelectDetail?.({ ...newDetail, isFromNode: true })
}
