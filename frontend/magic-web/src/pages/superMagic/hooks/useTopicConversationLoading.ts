import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { reaction } from "mobx"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import { optimisticMessageStore } from "@/pages/superMagic/stores/optimisticMessageStore"
import { projectVisibleMessagesByRevokedTail } from "@/pages/superMagic/utils/project-visible-messages-by-revoked-tail"
import { resolveTopicConversationLoadingState } from "./topic-conversation-loading"

interface TopicMessagesChangePayload<TStatus = unknown> {
	isLoading: boolean
	lastMessage?: SuperMagicMessageItem
	lastMessageNode?: {
		status?: TStatus
		[key: string]: unknown
	}
	selectedTopic?: Topic | null
	topicMessages: SuperMagicMessageItem[]
}

interface UseTopicConversationLoadingParams<TStatus = unknown> {
	hideLoadingWhenBufferHasContent?: boolean
	onConversationGeneratingChange?: (isGenerating: boolean) => void
	onTopicMessagesChange?: (payload: TopicMessagesChangePayload<TStatus>) => void
	selectedTopic?: Topic | null
}

export function useTopicConversationLoading<TStatus = unknown>({
	hideLoadingWhenBufferHasContent = false,
	onConversationGeneratingChange,
	onTopicMessagesChange,
	selectedTopic,
}: UseTopicConversationLoadingParams<TStatus>) {
	const currentTopicId = selectedTopic?.chat_topic_id || ""
	const selectedTopicStatus = selectedTopic?.task_status || selectedTopic?.status
	const [showLoading, setShowLoading] = useState(false)
	const [messageState, setMessageState] = useState<{
		topicId: string
		messages: SuperMagicMessageItem[]
	}>(() => {
		const canonicalMessages = (superMagicStore.messages?.get(currentTopicId) ||
			[]) as SuperMagicMessageItem[]
		return {
			topicId: currentTopicId,
			messages: projectVisibleMessagesByRevokedTail(canonicalMessages),
		}
	})

	const getOptimisticMessageStatus = useMemoizedFn((message?: SuperMagicMessageItem) => {
		if (!message || message.role !== "user") return undefined
		optimisticMessageStore.hydrateFromStorage()
		return optimisticMessageStore.getStatus(
			selectedTopic?.chat_topic_id,
			message.app_message_id,
		)
	})

	const handleTopicMessagesChange = useMemoizedFn((topicMessages: SuperMagicMessageItem[]) => {
		const resolvedState = resolveTopicConversationLoadingState({
			topicMessages,
			getMessageNode: (superMessageId) => superMagicStore.getMessageNode(superMessageId),
			getOptimisticStatus: getOptimisticMessageStatus,
		})
		const { lastMessage, lastMessageNode } = resolvedState
		// waiting_for_user 表示 Topic 已把控制权交还用户；即使最后一条消息仍保留
		// running/waiting 的历史节点状态，也不能继续维持全局对话 Loading。
		const isLoading =
			selectedTopicStatus === TaskStatus.WAITING_FOR_USER ? false : resolvedState.isLoading

		setShowLoading(isLoading)

		if (topicMessages.length > 1) {
			onTopicMessagesChange?.({
				isLoading,
				lastMessage,
				lastMessageNode:
					lastMessageNode as TopicMessagesChangePayload<TStatus>["lastMessageNode"],
				selectedTopic,
				topicMessages,
			})
		}
	})

	useEffect(() => {
		const currentCanonicalMessages = (superMagicStore.messages?.get(currentTopicId) ||
			[]) as SuperMagicMessageItem[]
		const currentTopicMessages = projectVisibleMessagesByRevokedTail(currentCanonicalMessages)

		// 调用方依赖返回的 messages 做渲染；
		// 将 topicId 与 messages 一起存入局部 state，防止切换话题时短暂暴露前一话题的消息缓存。
		setMessageState({
			topicId: currentTopicId,
			messages: currentTopicMessages,
		})
		handleTopicMessagesChange(currentTopicMessages)
	}, [handleTopicMessagesChange, currentTopicId, selectedTopicStatus])

	useEffect(() => {
		return reaction(
			() => ({
				// Read the visible projection inside the tracked expression so in-place
				// revoked-status changes also update UI consumers without mutating Store.
				messages: projectVisibleMessagesByRevokedTail(
					(superMagicStore.messages?.get(currentTopicId) ||
						[]) as SuperMagicMessageItem[],
				),
				// 触碰 sidecar map 让 MobX 追踪它作为依赖；
				// 仅 optimistic 状态变化时，主消息数组引用不变。
				_sidecar: optimisticMessageStore.topicOptimisticMap[currentTopicId],
			}),
			({ messages: topicMessages }) => {
				const nextTopicMessages = topicMessages as SuperMagicMessageItem[]
				setMessageState((prev) => {
					// 始终产生新的数组引用，让下游消费者能重新渲染，
					// 即使 MobX observable 数组标识未变。
					if (prev.topicId === currentTopicId && prev.messages === nextTopicMessages) {
						return { topicId: currentTopicId, messages: nextTopicMessages.slice() }
					}
					return { topicId: currentTopicId, messages: nextTopicMessages }
				})
				handleTopicMessagesChange(nextTopicMessages)
			},
		)
	}, [handleTopicMessagesChange, currentTopicId])

	useEffect(() => {
		if (!hideLoadingWhenBufferHasContent) {
			return
		}

		return reaction(
			() => superMagicStore.buffer.get(currentTopicId),
			(next) => {
				if (next && next.length > 0) {
					setShowLoading(false)
				}
			},
		)
	}, [currentTopicId, hideLoadingWhenBufferHasContent])

	useEffect(() => {
		setShowLoading(false)
		onConversationGeneratingChange?.(false)
	}, [currentTopicId, onConversationGeneratingChange])

	useEffect(() => {
		onConversationGeneratingChange?.(showLoading)

		return () => {
			onConversationGeneratingChange?.(false)
		}
	}, [onConversationGeneratingChange, showLoading])

	return {
		// Re-validate topic ownership before returning to prevent exposing the previous topic's messages during switch.
		messages: messageState.topicId === currentTopicId ? messageState.messages : [],
		showLoading,
	}
}
