import type { NodeProps } from "../types"
// import { useTranslation } from "react-i18next"
import { ToolsMap } from "./tools"
import { isEmpty, pick } from "lodash-es"
import { Suspense } from "react"
import { observer } from "mobx-react-lite"
import { superMagicStore } from "@/pages/superMagic/stores"
import DefaultTool from "./tools/DefaultTool"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { filterClickableMessageWithoutRevoked } from "@/pages/superMagic/utils/handleMessage"
import { getToolDesignProjectInfo } from "@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo"
import {
	getToolCardInteractionTarget,
	selectSourceFileFromTool,
	selectToolDetail,
} from "../toolDetailSelection"

function ToolCall(props: NodeProps) {
	const { onSelectDetail } = props
	const node = superMagicStore.getMessageNode(props?.node?.super_message_id) as
		| {
				tool?: {
					name?: string
					detail?: Record<string, unknown>
					[key: string]: unknown
				}
				[key: string]: unknown
		  }
		| undefined
	const tool = node?.tool
	// const { data, name } = tool?.detail || {}
	// const tabs = data?.groups || []

	// const { t } = useTranslation("super")
	const toolName = typeof tool?.name === "string" ? tool.name : ""

	const ToolComponent = ToolsMap?.[toolName] || DefaultTool

	// 调用onSelectDetail时检查是否为选中节点并添加isFromNode标记
	const handleSelectDetail = (detail: {
		data?: Record<string, unknown>
		[key: string]: unknown
	}) => {
		const target = getToolCardInteractionTarget(tool?.name, detail)
		if (target.type === "disabled") return

		if (target.type === "design") {
			const { designProjectId, designProject, elements } = getToolDesignProjectInfo(tool)
			if (!designProjectId) return
			pubsub.publish(PubSubEvents.Open_File_Tab, {
				...designProject,
				fileId: designProjectId,
			})
			if (elements.length > 0) {
				// 延迟等待tab打开
				setTimeout(() => {
					pubsub.publish(PubSubEvents.Super_Magic_Focus_Canvas_Element, {
						canvasDesignId: designProjectId,
						elementIds: elements.map((item) => item.id),
						selectElement: [elements[0].id],
						animated: false,
						padding: {
							top: "25%",
							right: "25%",
							bottom: "25%",
							left: "25%",
						},
					})
				}, 200)
			}
			return
		}
		// Prefer file navigation when the id exists in attachments; otherwise open playback.
		if (
			target.type === "file" &&
			selectSourceFileFromTool({
				detail,
				fileId: target.fileId,
				onSelectDetail,
			})
		) {
			return
		}

		selectToolDetail({ detail, onSelectDetail })
	}

	const onProxyClick = () => {
		const toolInfo = pick(tool, ["name", "url", "action", "remark", "id"])
		const newDetail = { ...tool?.detail, ...toolInfo }
		if (!filterClickableMessageWithoutRevoked(node, props?.node) || isEmpty(tool?.detail)) {
			return
		}

		handleSelectDetail?.(newDetail)
	}

	return (
		<Suspense fallback={null}>
			<ToolComponent {...props} onClick={onProxyClick} />
		</Suspense>
	)
}

export default observer(ToolCall)
