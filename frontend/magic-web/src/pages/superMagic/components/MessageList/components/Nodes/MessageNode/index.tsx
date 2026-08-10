import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import { superMagicStore } from "@/pages/superMagic/stores"
import type { NodeProps } from "../types"
import { AttachmentSection } from "./sections/AttachmentSection"
import { ContentSection } from "./sections/ContentSection"
import { ReasoningSection } from "./sections/ReasoningSection"
import { ToolCallContainer } from "./tool-call/ToolCallContainer"
import { isRenderableToolCall } from "./tool-call/types"

const MessageNode = observer(function MessageNode(props: NodeProps) {
	const node = (superMagicStore.getRenderedMessageNode?.(
		props.node?.super_message_id,
		props.node?.topic_id,
	) ?? superMagicStore.getMessageNode(props.node?.super_message_id)) as
		Record<string, unknown> | undefined
	const topicId = props.node?.topic_id || ""
	const correlationId = props.node?.correlation_id || ""
	const messageId = props.node?.app_message_id || ""
	const ownerSuperMessageId = String(node?.super_message_id || props.node?.super_message_id || "")
	const streamState =
		superMagicStore.getStreamState(topicId, correlationId)?.stage ||
		superMagicStore.getStreamState(topicId, messageId)?.stage
	const rawContent = typeof node?.content === "string" ? node.content : ""
	const hasAssistantContent = node?.role === "assistant" && !/^\s*$/.test(rawContent)
	const renderableToolCalls = (Array.isArray(node?.tool_calls) ? node.tool_calls : []).filter(
		isRenderableToolCall,
	)

	if (node?.role === "tool") {
		return (
			<div className="mb-3">
				<AttachmentSection
					node={node}
					fallbackNode={props.node}
					prevSuperMessageId={props.prevNode?.super_message_id}
					onFileClick={props.onFileClick}
					onSelectDetail={props.onSelectDetail}
				/>
			</div>
		)
	}

	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2",
				hasAssistantContent &&
					"rounded-lg transition-[background-color,box-shadow] group-hover:bg-muted group-hover:shadow-[-2px_0_0_5px_rgb(var(--muted-rgb))]",
			)}
		>
			<ReasoningSection
				node={node}
				messageId={messageId}
				streamState={streamState}
				onMouseEnter={props.onMouseEnter}
				onMouseLeave={props.onMouseLeave}
			/>
			<ContentSection
				node={node}
				streamState={streamState}
				onMouseEnter={props.onMouseEnter}
				onMouseLeave={props.onMouseLeave}
			/>
			{renderableToolCalls.map((toolCall) =>
				toolCall.function.name === "run_sdk_snippet" ? null : (
					<ToolCallContainer
						key={toolCall.id}
						toolCall={toolCall}
						topicId={topicId}
						ownerSuperMessageId={ownerSuperMessageId}
						selectedTopic={props.selectedTopic}
						isShare={props.isShare}
						correlationId={correlationId || messageId}
						onSelectDetail={props.onSelectDetail}
						onMouseEnter={props.onMouseEnter}
						onMouseLeave={props.onMouseLeave}
					/>
				),
			)}
			<AttachmentSection
				node={node}
				fallbackNode={props.node}
				prevSuperMessageId={props.prevNode?.super_message_id}
				onFileClick={props.onFileClick}
				onSelectDetail={props.onSelectDetail}
			/>
		</div>
	)
})

MessageNode.displayName = "MessageNode"

export default MessageNode
