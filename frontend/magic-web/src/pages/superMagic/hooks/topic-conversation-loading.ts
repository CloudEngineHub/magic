import { isObject } from "lodash-es"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"

interface MessageNodeSnapshot<TStatus = unknown> {
	status?: TStatus
	content?: unknown
	rich_text?: {
		content?: unknown
	}
	text?: {
		content?: unknown
	}
	[key: string]: unknown
}

interface ResolveTopicConversationLoadingStateParams {
	topicMessages: SuperMagicMessageItem[]
	getMessageNode: (appMessageId?: string) => unknown
	getOptimisticStatus: (message?: SuperMagicMessageItem) => unknown
}

function toMessageNodeSnapshot<TStatus = unknown>(
	node: unknown,
): MessageNodeSnapshot<TStatus> | undefined {
	if (!node || !isObject(node)) return undefined
	return node as MessageNodeSnapshot<TStatus>
}

function isUnconfirmedOptimisticUserMessage(
	message: SuperMagicMessageItem | undefined,
	optimisticStatus: unknown,
) {
	return (
		message?.role === "user" &&
		(optimisticStatus === "sending" || optimisticStatus === "failed")
	)
}

function findLastNonUserMessage(topicMessages: SuperMagicMessageItem[]) {
	for (let index = topicMessages.length - 1; index >= 0; index -= 1) {
		const message = topicMessages[index]
		if (message?.role !== "user") return message
	}
	return undefined
}

export function resolveTopicConversationLoadingState<TStatus = unknown>({
	topicMessages,
	getMessageNode,
	getOptimisticStatus,
}: ResolveTopicConversationLoadingStateParams) {
	const lastMessage = topicMessages[topicMessages.length - 1]
	const lastMessageWithRole = findLastNonUserMessage(topicMessages)
	const lastMessageNode = toMessageNodeSnapshot<TStatus>(
		getMessageNode(lastMessageWithRole?.app_message_id),
	)

	// Local optimistic user messages are transport state, not assistant generation.
	// Only after the sidecar disappears should the conversation enter the thinking/loading phase.
	if (isUnconfirmedOptimisticUserMessage(lastMessage, getOptimisticStatus(lastMessage))) {
		return {
			isLoading: false,
			lastMessage,
			lastMessageNode,
		}
	}

	if (topicMessages.length === 0) {
		return {
			isLoading: false,
			lastMessage,
			lastMessageNode,
		}
	}

	if (topicMessages.length === 1) {
		return {
			isLoading: true,
			lastMessage,
			lastMessageNode,
		}
	}

	return {
		isLoading:
			lastMessageNode?.status === "running" ||
			lastMessageNode?.status === "waiting" ||
			lastMessage?.type === "rich_text" ||
			isObject(lastMessageNode?.content) ||
			Boolean(lastMessageNode?.rich_text?.content) ||
			Boolean(lastMessageNode?.text?.content),
		lastMessage,
		lastMessageNode,
	}
}
