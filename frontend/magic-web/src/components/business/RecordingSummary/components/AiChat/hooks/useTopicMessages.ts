import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { reaction } from "mobx"
import { isEmpty, isObject } from "lodash-es"
import { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { registerStreamRecoveryOwner } from "@/pages/superMagic/services/streamRecoveryCoordinator"
import { superMagicStore } from "@/pages/superMagic/stores"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { SuperMagicApi } from "@/apis"

interface UseTopicMessagesParams {
	selectedTopic: Topic | null
	selectedWorkspace: { id: string } | null
	checkNowDebounced: () => void
}

interface UseTopicMessagesReturn {
	messages: any[]
	showLoading: boolean
	isShowLoadingInit: boolean
	handlePullMoreMessage: (topicInfo: Topic | null, callback?: () => void) => void
	updateTopicMessages: (options?: { writeIntent?: MessageWriteIntent }) => void
}

type MessageWriteIntent = "replace" | "merge" | "incremental"

interface PullMessageParams {
	conversation_id: string
	chat_topic_id: string
	page_token: string
	order: "asc" | "desc"
	limit?: number
	updatePageToken?: boolean
	writeIntent: MessageWriteIntent
	syncGeneration?: number
	callback?: () => void
}

interface PullMessageResult {
	didPullSucceed: boolean
	pulledItems: any[]
	response?: any
}

const FULL_TOPIC_SYNC_MESSAGE_COUNT = 100

export function useTopicMessages({
	selectedTopic,
	selectedWorkspace,
	checkNowDebounced,
}: UseTopicMessagesParams): UseTopicMessagesReturn {
	const topicNotHaveMoreMessageMap = useRef<Record<string, boolean>>({})
	const topicPageTokenMap = useRef<Record<string, string>>({})
	const selectedTopicRef = useRef(selectedTopic)
	const recoveryOwnerTokenRef = useRef(Symbol("recordingSummaryUseTopicMessages"))
	selectedTopicRef.current = selectedTopic
	const [showLoading, setShowLoading] = useState(false)
	const [isShowLoadingInit, setIsShowLoadingInit] = useState(false)

	// Clean up on unmount
	useEffect(() => {
		return () => {
			topicPageTokenMap.current = {}
		}
	}, [])

	const fetchMessagesPage = useMemoizedFn(
		async ({
			conversation_id,
			chat_topic_id,
			page_token,
			order,
			limit = 20,
			updatePageToken = true,
			callback,
		}: Omit<
			PullMessageParams,
			"writeIntent" | "syncGeneration"
		>): Promise<PullMessageResult> => {
			try {
				const response = await SuperMagicApi.getMessagesByConversationId({
					conversation_id,
					chat_topic_id,
					page_token,
					limit,
					order,
				})
				const pulledItems = response?.items || []
				const newMessage = pulledItems
					.filter((item: any) => {
						return (
							item?.seq?.message?.general_agent_card ||
							item?.seq?.message?.text?.content ||
							item?.seq?.message?.rich_text?.content
						)
					})
					.map((item: any) => {
						const data = item?.seq?.message?.general_agent_card
							? item?.seq?.message?.general_agent_card
							: item?.seq?.message
						return {
							...data,
							seq_id: item?.seq?.seq_id,
							messageStatus: item?.seq?.message?.status,
						}
					})
					.filter((item: any) => !isEmpty(item))
				const hasAttachments = newMessage.some(
					(item: any) =>
						item?.attachments?.length > 0 || item?.tool?.attachments?.length > 0,
				)
				if (hasAttachments) {
					checkNowDebounced()
				}
				if (updatePageToken && response?.page_token) {
					topicPageTokenMap.current[chat_topic_id] = response.page_token
				}
				callback?.()
				return { didPullSucceed: true, pulledItems, response }
			} catch (error) {
				console.error("[RecordingSummary useTopicMessages] pullMessage failed", {
					error,
					chat_topic_id,
					conversation_id,
					page_token,
					order,
					limit,
				})
				return { didPullSucceed: false, pulledItems: [] }
			}
		},
	)

	const pullMessage = useMemoizedFn(
		async ({
			conversation_id,
			chat_topic_id,
			page_token,
			order,
			limit = 20,
			updatePageToken = true,
			writeIntent,
			syncGeneration,
			callback,
		}: PullMessageParams): Promise<PullMessageResult> => {
			if (
				topicNotHaveMoreMessageMap.current[chat_topic_id] &&
				page_token &&
				updatePageToken
			) {
				console.log("没有更多消息")
				return { didPullSucceed: true, pulledItems: [] }
			}
			const pullResult = await fetchMessagesPage({
				conversation_id,
				chat_topic_id,
				page_token,
				limit,
				order,
				updatePageToken,
				callback,
			})
			if (!pullResult.didPullSucceed) return pullResult

			if (writeIntent === "incremental") {
				pullResult.pulledItems
					.slice()
					.reverse()
					.forEach((item: any) => {
						superMagicStore.enqueueMessage(chat_topic_id, item)
					})
			} else {
				superMagicStore.initializeMessages(chat_topic_id, pullResult.pulledItems, {
					mode: writeIntent,
					syncGeneration,
				})
			}
			return pullResult
		},
	)

	const recoverTopicMessages = useMemoizedFn(
		async ({
			conversationId,
			topicId,
			syncGeneration,
		}: {
			conversationId: string
			topicId: string
			syncGeneration: number
		}): Promise<PullMessageResult> => {
			const pulledItems: any[] = []
			const visitedPageTokens = new Set<string>()
			let pageToken = ""
			let latestResponse: any

			while (true) {
				const pageResult = await fetchMessagesPage({
					conversation_id: conversationId,
					chat_topic_id: topicId,
					page_token: pageToken,
					order: "desc",
					limit: FULL_TOPIC_SYNC_MESSAGE_COUNT,
					updatePageToken: false,
				})
				if (!pageResult.didPullSucceed) return pageResult

				pulledItems.push(...pageResult.pulledItems)
				latestResponse = pageResult.response
				if (!latestResponse?.has_more) break

				const nextPageToken = String(latestResponse?.page_token || "")
				if (!nextPageToken || visitedPageTokens.has(nextPageToken)) {
					return { didPullSucceed: false, pulledItems: [] }
				}
				visitedPageTokens.add(nextPageToken)
				pageToken = nextPageToken
			}

			superMagicStore.initializeMessages(topicId, pulledItems, {
				mode: "replace",
				syncGeneration,
			})
			return { didPullSucceed: true, pulledItems, response: latestResponse }
		},
	)

	const updateTopicMessages = useMemoizedFn(
		({ writeIntent = "replace" }: { writeIntent?: MessageWriteIntent } = {}) => {
			if (selectedTopic?.id && selectedWorkspace?.id) {
				pullMessage({
					conversation_id: selectedTopic?.chat_conversation_id,
					chat_topic_id: selectedTopic?.chat_topic_id,
					page_token: "",
					order: "desc",
					limit: FULL_TOPIC_SYNC_MESSAGE_COUNT,
					updatePageToken: true,
					writeIntent,
				})
			}
		},
	)

	const handlePullMoreMessage = useMemoizedFn(
		(topicInfo: Topic | null, callback?: () => void) => {
			if (selectedWorkspace?.id && topicInfo) {
				pullMessage({
					conversation_id: topicInfo.chat_conversation_id,
					chat_topic_id: topicInfo.chat_topic_id,
					page_token: topicPageTokenMap.current[topicInfo?.chat_topic_id] || "",
					order: "desc",
					limit: 100,
					updatePageToken: true,
					writeIntent: "merge",
					callback,
				})
			}
		},
	)

	// Subscribe to WebSocket messages
	useEffect(() => {
		const handleNewMessage = (data: any) => {
			console.log("我接受到的 ws 消息", data)
			const { topic_id: chat_topic_id = "" } = data.message || {}

			if (selectedTopic?.chat_conversation_id && chat_topic_id) {
				pullMessage({
					conversation_id: selectedTopic?.chat_conversation_id,
					chat_topic_id: chat_topic_id,
					page_token: "",
					order: "desc",
					limit: 10,
					updatePageToken: false,
					writeIntent: "incremental",
				})
			}
		}
		pubsub.subscribe(PubSubEvents.Super_Magic_New_Message_V2, handleNewMessage)
		return () => {
			pubsub?.unsubscribe(PubSubEvents.Super_Magic_New_Message_V2, handleNewMessage)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedTopic])

	// Update messages when topic changes
	useEffect(() => {
		superMagicStore.setActiveTopicId(selectedTopic?.chat_topic_id || null)
		updateTopicMessages()
	}, [
		selectedTopic?.chat_conversation_id,
		selectedTopic?.chat_topic_id,
		selectedTopic?.id,
		selectedWorkspace?.id,
		updateTopicMessages,
	])

	useEffect(() => {
		const topicId = selectedTopic?.chat_topic_id
		const conversationId = selectedTopic?.chat_conversation_id
		if (!selectedWorkspace?.id || !topicId || !conversationId) return

		return registerStreamRecoveryOwner({
			ownerToken: recoveryOwnerTokenRef.current,
			topicId,
			conversationId,
			getTaskStatus: () => {
				const currentTopic = selectedTopicRef.current
				if (currentTopic?.chat_topic_id !== topicId) return undefined
				return currentTopic.task_status || currentTopic.status
			},
			recover: ({ syncGeneration }) =>
				recoverTopicMessages({ conversationId, topicId, syncGeneration }),
		})
	}, [
		recoverTopicMessages,
		selectedTopic?.chat_conversation_id,
		selectedTopic?.chat_topic_id,
		selectedTopic?.id,
		selectedWorkspace?.id,
	])

	// Handle message refresh after revoke
	useEffect(() => {
		const handleRefreshTopicMessages = () =>
			updateTopicMessages({
				writeIntent: "replace",
			})
		pubsub.subscribe(PubSubEvents.Refresh_Topic_Messages, handleRefreshTopicMessages)

		return () => {
			pubsub?.unsubscribe(PubSubEvents.Refresh_Topic_Messages, handleRefreshTopicMessages)
		}
	}, [updateTopicMessages])

	// Calculate current messages
	const messages = selectedTopic?.chat_topic_id
		? superMagicStore.messages?.get(selectedTopic?.chat_topic_id) || []
		: []

	// Monitor message status for loading state
	useEffect(() => {
		return reaction(
			() => superMagicStore.messages?.get(selectedTopic?.chat_topic_id || "") || [],
			(topicMessages) => {
				if (topicMessages.length > 1) {
					const lastMessageWithRole = topicMessages.findLast(
						(message) => message.role !== "user",
					)
					const lastMessage = topicMessages?.[topicMessages.length - 1]
					const lastMessageNode = superMagicStore.getMessageNode(
						lastMessageWithRole?.app_message_id,
					)

					const isLoading =
						lastMessageNode?.status === "running" ||
						lastMessageNode?.status === "waiting" ||
						lastMessage?.type === "rich_text" ||
						isObject(lastMessageNode?.content) ||
						Boolean(lastMessageNode?.rich_text?.content) ||
						Boolean(lastMessageNode?.text?.content)

					setShowLoading(isLoading)
					setIsShowLoadingInit(true)
				} else if (topicMessages?.length === 1) {
					setShowLoading(true)
				}
			},
		)
	}, [selectedTopic?.chat_topic_id])

	return {
		messages,
		showLoading,
		isShowLoadingInit,
		handlePullMoreMessage,
		updateTopicMessages,
	}
}
