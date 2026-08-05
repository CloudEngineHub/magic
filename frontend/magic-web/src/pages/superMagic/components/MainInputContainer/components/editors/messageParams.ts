import type { JSONContent } from "@tiptap/core"
import type { HandleSendParams } from "@/pages/superMagic/services/messageSendFlowService"
import type { QueueMessageInput } from "./types"

export function buildQueueMessageInput(
	params: HandleSendParams,
	fallbackContent: JSONContent,
): QueueMessageInput {
	return {
		content: params.value ?? fallbackContent,
		mentionItems: params.mentionItems,
		selectedModel: params.selectedModel,
		selectedImageModel: params.selectedImageModel,
		selectedVideoModel: params.selectedVideoModel,
		topicMode: params.topicMode,
	}
}
