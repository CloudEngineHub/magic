import { useMemoizedFn } from "ahooks"
import { isEmpty } from "lodash-es"
import { useEffect, useRef, useState } from "react"
import { SuperMagicApi } from "@/apis"
import { registerStreamRecoveryOwner } from "@/pages/superMagic/services/streamRecoveryCoordinator"
import { superMagicStore } from "@/pages/superMagic/stores"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { TaskStatus, Topic } from "../pages/Workspace/types"

// 完全同步时单次拉取的消息数量
const FULL_TOPIC_SYNC_MESSAGE_COUNT = 100

// 实时增量同步时每次拉取的消息数量
const LIVE_INCREMENTAL_SYNC_MESSAGE_COUNT = 10

// 常驻轮询只补最近增量；完整分页仅保留给显式 recovery。
const POLLING_SYNC_MESSAGE_COUNT = 20

// 前台恢复时第一段回拉窗口：先用中等窗口补最近消息，尽量一次命中大多数休眠场景。
const FOREGROUND_RECOVERY_FIRST_PAGE_MESSAGE_COUNT = 200

// 前台恢复时第二段回拉窗口：若第一段仍未追平到休眠前锚点，再放大一次窗口兜底。
const FOREGROUND_RECOVERY_SECOND_PAGE_MESSAGE_COUNT = 400

// 前台恢复防抖时间（毫秒），避免重复触发同步
const FOREGROUND_SYNC_DEDUPE_MS = 1000

// 合并同一轮持久消息事件，避免用户消息和 Agent 最终消息各自触发一次相同的小窗口回拉。
const LIVE_INCREMENTAL_SYNC_DEBOUNCE_MS = 200

interface UseTopicMessagesParams {
	selectedTopic: Topic | null
	checkNowDebounced?: () => void
}

interface PullMessageParams {
	conversation_id: string
	chat_topic_id: string
	page_token: string
	order: "asc" | "desc"
	limit?: number
	updatePageToken?: boolean
	writeIntent: "replace" | "merge" | "incremental"
	syncGeneration?: number
	callback?: () => void
}

interface PullMessageResult {
	didPullSucceed: boolean
	pulledItems: any[]
	response?: any
}

interface ForegroundRecoveryAnchorState {
	baseAnchor?: string
	latestCommittedAnchor?: string
}

/**
 * 过滤前台恢复场景下的消息项，避免彻底无效的空节点进入恢复聚合结果。
 * 该过滤只用于恢复补拉，不影响 WS、轮询、切话题和加载更多的原始写入链路。
 */
function shouldIncludeFetchedMessage(item: any) {
	const message = item?.seq?.message
	if (!message?.app_message_id) return false
	// 休眠恢复时服务端常会先返回“半成品”节点，这里只过滤彻底无效的数据，
	// 同时保留 v1 / v2 历史消息格式的兼容判断。
	const hasRenderablePayload =
		message?.type ||
		message?.general_agent_card ||
		message?.text?.content ||
		message?.rich_text?.content
	return Boolean(hasRenderablePayload)
}

/**
 * 对分页回拉结果按 app_message_id 去重，避免两段恢复窗口存在重叠时重复写入同一条消息。
 */
function dedupePulledItemsByAppMessageId(items: any[]) {
	const seenAppMessageIds = new Set<string>()
	return items.filter((item) => {
		const appMessageId = item?.seq?.message?.app_message_id
		if (!appMessageId || seenAppMessageIds.has(appMessageId)) return false
		seenAppMessageIds.add(appMessageId)
		return true
	})
}

/**
 * 判断前台恢复是否还需要继续向更早的分页扩展。
 * 只要当前聚合结果还没覆盖到恢复锚点，就继续拉第二段窗口。
 */
function shouldContinueForegroundRecovery(pulledItems: any[], recoveryAnchorAppMessageId?: string) {
	// 恢复补拉只关心“是否已经追平到离开前最后一条本地可见消息”：
	// 只要新回拉结果已经包含这个锚点，就说明锚点之后的缺口已被补齐，无需继续向更老分页扩散。
	if (!recoveryAnchorAppMessageId) return false
	return !pulledItems.some(
		(item) => item?.seq?.message?.app_message_id === recoveryAnchorAppMessageId,
	)
}

/**
 * 管理当前话题的消息拉取、增量同步、前台恢复和分页加载。
 */
export function useTopicMessages({ selectedTopic, checkNowDebounced }: UseTopicMessagesParams) {
	// topic_id和page_token的映射
	const topicPageTokenMap = useRef<Record<string, string>>({})
	const topicNotHaveMoreMessageMap = useRef<Record<string, boolean>>({})
	// Track which topics have completed their initial load
	const initialLoadedTopicsRef = useRef<Set<string>>(new Set())
	const selectedTopicRef = useRef(selectedTopic)
	const recoveryOwnerTokenRef = useRef(Symbol("useTopicMessages"))
	const foregroundTopicSyncRef = useRef<{ topicId: string; generation: number } | null>(null)
	const lastForegroundSyncAtRef = useRef(0)
	const foregroundRecoveryAnchorRef = useRef<Record<string, ForegroundRecoveryAnchorState>>({})
	const historyPullInFlightTopicsRef = useRef<Set<string>>(new Set())
	const lastHistoryPageTokenMapRef = useRef<Record<string, string>>({})
	const finishedPollingCompletedTopicsRef = useRef<Set<string>>(new Set())
	selectedTopicRef.current = selectedTopic

	const [isMessagesInitialLoading, setIsMessagesInitialLoading] = useState(() =>
		Boolean(selectedTopic?.chat_topic_id),
	)
	/** 当前选中话题本轮拉取已结束（写入 store 或请求结束），用于避免切换话题时读到空消息列表 */
	const [isSelectedTopicMessagesReady, setIsSelectedTopicMessagesReady] = useState(
		() => !selectedTopic?.id,
	)

	/**
	 * 读取当前 topic 在 messages 列表中最靠前的一条消息 id。
	 * 该值代表当前已经真正落地到 UI 主列表中的最新消息边界。
	 */
	const getTopicLatestMessageAnchor = useMemoizedFn((topicId?: string) => {
		if (!topicId) return ""
		const currentMessages = superMagicStore.messages.get(topicId) || []
		// store 内消息按 desc 排序，数组首项就是当前已落地列表中的最新消息。
		return currentMessages[0]?.app_message_id || ""
	})

	/**
	 * 在页面进入 hidden 时记录一个“离开瞬间”的基准锚点。
	 * 它代表用户明确看到过的最后一条消息，是恢复补拉的正确性下界。
	 */
	const setForegroundRecoveryBaseAnchor = useMemoizedFn((topicId?: string) => {
		if (!topicId) return
		const baseAnchor = getTopicLatestMessageAnchor(topicId)
		if (!baseAnchor) return
		foregroundRecoveryAnchorRef.current[topicId] = {
			baseAnchor,
			// 初始时最新已落地锚点与基准锚点一致；后续若 hidden 期间继续落地新消息，再推进它。
			latestCommittedAnchor: baseAnchor,
		}
	})

	/**
	 * 当页面已经 hidden，但轮询/WS 仍成功把消息落到了 messages 时，推进隐藏期最新锚点。
	 * 这样既保留 hidden 瞬间的正确性边界，又避免长时间 hidden 后锚点过旧。
	 */
	const updateForegroundRecoveryCommittedAnchor = useMemoizedFn((topicId?: string) => {
		if (!topicId || document.visibilityState !== "hidden") return
		const latestCommittedAnchor = getTopicLatestMessageAnchor(topicId)
		if (!latestCommittedAnchor) return
		const previousAnchorState = foregroundRecoveryAnchorRef.current[topicId]
		foregroundRecoveryAnchorRef.current[topicId] = {
			baseAnchor: previousAnchorState?.baseAnchor || latestCommittedAnchor,
			latestCommittedAnchor,
		}
	})

	/**
	 * 只请求一页消息，不直接写入 store。
	 * 前台恢复会复用这层能力，先聚合两段分页结果，再一次性重建列表。
	 */
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
				const renderableMessages = pulledItems
					.filter(shouldIncludeFetchedMessage)
					?.map((item: any) => {
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
				const hasAttachments = renderableMessages.some(
					(item: any) =>
						item?.attachments?.length > 0 || item?.tool?.attachments?.length > 0,
				)
				if (hasAttachments) {
					checkNowDebounced?.()
				}
				if (updatePageToken) {
					// 历史分页必须同时记录 token 和终页状态；仅保留旧 token 会让布局滚动
					// 在 has_more=false 后继续重复请求最后一页。
					if (response?.has_more === false) {
						topicNotHaveMoreMessageMap.current[chat_topic_id] = true
						delete topicPageTokenMap.current[chat_topic_id]
					} else {
						topicNotHaveMoreMessageMap.current[chat_topic_id] = false
						if (response?.page_token) {
							topicPageTokenMap.current[chat_topic_id] = response.page_token
						}
					}
				}

				callback?.()
				return {
					didPullSucceed: true,
					pulledItems,
					response,
				}
			} catch (error) {
				console.error("[useTopicMessages] pullMessage failed", {
					error,
					chat_topic_id,
					conversation_id,
					page_token,
					order,
					limit,
				})
				return {
					didPullSucceed: false,
					pulledItems: [],
				}
			}
		},
	)

	/**
	 * 发起一次消息拉取，并按原有语义把结果写回 store。
	 * 非恢复场景仍复用这条主路径，避免改动 WS、轮询、切话题等既有行为。
	 */
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
				if (selectedTopicRef.current?.chat_topic_id === chat_topic_id)
					setIsSelectedTopicMessagesReady(true)
				return { didPullSucceed: true, pulledItems: [] }
			}
			const pullResult = await fetchMessagesPage({
				conversation_id,
				chat_topic_id,
				page_token,
				order,
				limit,
				updatePageToken,
				callback,
			})
			if (!pullResult.didPullSucceed) return pullResult
			if (writeIntent === "incremental") {
				// 增量模式保留现有 messages/buffer 状态，只把最新节点逐条灌进 store，
				// 让现有的去重、流式和 buffer 逻辑继续生效。
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
			updateForegroundRecoveryCommittedAnchor(chat_topic_id)
			if (!initialLoadedTopicsRef.current.has(chat_topic_id)) {
				initialLoadedTopicsRef.current.add(chat_topic_id)
				setIsMessagesInitialLoading(false)
			}
			if (selectedTopicRef.current?.chat_topic_id === chat_topic_id) {
				setIsSelectedTopicMessagesReady(true)
			}
			return pullResult
		},
	)

	/**
	 * Store watchdog recovery 必须拿到完整 authoritative snapshot 后才能一次性 replace。
	 * 任一分页失败或服务端声明 has_more 却不给下一页 token 时，都返回失败且不提交 partial。
	 */
	const recoverTopicMessages = useMemoizedFn(
		async ({
			conversationId,
			topicId,
			syncGeneration,
			limit = FULL_TOPIC_SYNC_MESSAGE_COUNT,
		}: {
			conversationId: string
			topicId: string
			syncGeneration: number
			limit?: number
		}): Promise<PullMessageResult> => {
			const pulledItems: any[] = []
			const visitedPageTokens = new Set<string>()
			let pageToken = ""
			let latestResponse: any

			// eslint-disable-next-line no-constant-condition
			while (true) {
				const pageResult = await fetchMessagesPage({
					conversation_id: conversationId,
					chat_topic_id: topicId,
					page_token: pageToken,
					order: "desc",
					limit,
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
			return {
				didPullSucceed: true,
				pulledItems,
				response: latestResponse,
			}
		},
	)

	/**
	 * 获取前台恢复的目标锚点。
	 * 若 hidden 后页面还持续渲染过新内容，则优先对齐“隐藏期最新已落地锚点”；
	 * 否则退回 hidden 瞬间的基准锚点，最后再兜底使用当前列表顶部消息。
	 */
	const getCurrentTopicRecoveryAnchor = useMemoizedFn((topicId?: string) => {
		if (!topicId) return ""
		const cachedAnchorState = foregroundRecoveryAnchorRef.current[topicId]
		if (cachedAnchorState?.latestCommittedAnchor) return cachedAnchorState.latestCommittedAnchor
		if (cachedAnchorState?.baseAnchor) return cachedAnchorState.baseAnchor
		return getTopicLatestMessageAnchor(topicId)
	})

	/**
	 * 只有当前话题仍处于“可能存在未追平增量”的状态时，才允许执行前台恢复。
	 * 对已经完成且 store 内无 buffer / 流式残留的会话，切回页面无需再额外打一轮恢复请求。
	 */
	const shouldRunForegroundRecovery = useMemoizedFn((topic?: Topic | null) => {
		if (!topic?.chat_topic_id) return false
		const topicId = topic.chat_topic_id
		const topicMeta = superMagicStore.topicMeta.get(topicId)
		// buffer 存的是队列对象，不是数组；恢复判断只需要知道是否还有未消费消息。
		const hasBufferedMessages = (superMagicStore.buffer.get(topicId)?.messages?.length ?? 0) > 0
		const legacyTopicStatus = (topic as Topic & { status?: TaskStatus }).status
		const topicTaskStatus = topic.task_status || legacyTopicStatus
		return (
			topicTaskStatus === TaskStatus.RUNNING ||
			hasBufferedMessages ||
			Boolean(topicMeta?.isStream) ||
			Boolean(topicMeta?.isStreamLoading)
		)
	})

	const cancelForegroundTopicSync = useMemoizedFn((topicId?: string) => {
		const inFlightSync = foregroundTopicSyncRef.current
		if (!inFlightSync || (topicId && inFlightSync.topicId !== topicId)) return
		foregroundTopicSyncRef.current = null
		superMagicStore.cancelTopicSync(inFlightSync.topicId, inFlightSync.generation)
	})

	/**
	 * 拉取当前选中话题的消息。
	 * 除前台恢复外，其余场景继续使用既有的一次请求模型。
	 */
	const updateTopicMessages = useMemoizedFn(
		({
			writeIntent = "replace",
			messageCount = FULL_TOPIC_SYNC_MESSAGE_COUNT,
		}: {
			writeIntent?: PullMessageParams["writeIntent"]
			messageCount?: number
		} = {}) => {
			// if (selectedTopic?.id && selectedWorkspace) {
			if (selectedTopic?.id) {
				pullMessage({
					conversation_id: selectedTopic.chat_conversation_id,
					chat_topic_id: selectedTopic.chat_topic_id,
					page_token: "",
					order: "desc",
					limit: messageCount,
					updatePageToken: true,
					writeIntent,
				})
			}
		},
	)

	/**
	 * 当前处于前台时同步当前选中话题的消息列表。
	 *
	 * 这里不再按“离开时长”估算窗口，而是按固定两段回拉：
	 * 1. 先拉最近 200 条，覆盖绝大多数短时休眠/切页场景；
	 * 2. 若仍未追平隐藏期最新已落地锚点（没有则退回 hidden 基准锚点），
	 *    再用服务端返回的 page_token 补一段 400 条。
	 *
	 * 两段之后仍未追平且服务端仍声明 has_more 时，本轮按失败结束并保留旧列表。
	 */
	const syncSelectedTopicOnForeground = useMemoizedFn(async () => {
		const currentSelectedTopic = selectedTopicRef.current
		if (!currentSelectedTopic?.id || document.visibilityState !== "visible") return
		if (foregroundTopicSyncRef.current) return
		if (!shouldRunForegroundRecovery(currentSelectedTopic)) {
			// 当前会话已经稳定收尾时，hidden -> visible 不需要再触发恢复补拉；
			// 同时清理掉这次 hidden 周期留下的锚点，避免后续切页继续误判为待恢复。
			delete foregroundRecoveryAnchorRef.current[currentSelectedTopic.chat_topic_id]
			return
		}
		const now = Date.now()
		// 某些浏览器在切回前台时会连续触发 visibilitychange，
		// 这里做一个很轻的去重，避免同一轮恢复打出多次全量回拉。
		if (now - lastForegroundSyncAtRef.current < FOREGROUND_SYNC_DEDUPE_MS) return
		lastForegroundSyncAtRef.current = now
		const topicId = currentSelectedTopic.chat_topic_id
		const syncGeneration = superMagicStore.beginTopicSync(topicId)
		const inFlightSync = { topicId, generation: syncGeneration }
		foregroundTopicSyncRef.current = inFlightSync
		const isCurrentForegroundOwner = () =>
			foregroundTopicSyncRef.current === inFlightSync &&
			selectedTopicRef.current?.chat_topic_id === topicId
		const completeFailedSync = () => {
			if (!isCurrentForegroundOwner()) return
			if (!superMagicStore.isTopicSyncCurrent(topicId, syncGeneration)) return
			const currentTopic = selectedTopicRef.current
			superMagicStore.completeTopicSync(topicId, syncGeneration, {
				succeeded: false,
				taskStatus: currentTopic?.task_status || currentTopic?.status,
				renderStrategy: "foreground-instant",
			})
		}
		const recoveryAnchorAppMessageId = getCurrentTopicRecoveryAnchor(topicId)
		try {
			let aggregatedPulledItems: any[] = []
			const firstPageResult = await fetchMessagesPage({
				conversation_id: currentSelectedTopic.chat_conversation_id,
				chat_topic_id: topicId,
				page_token: "",
				order: "desc",
				limit: FOREGROUND_RECOVERY_FIRST_PAGE_MESSAGE_COUNT,
				updatePageToken: true,
			})
			aggregatedPulledItems = dedupePulledItemsByAppMessageId([
				...firstPageResult.pulledItems.filter(shouldIncludeFetchedMessage),
			])
			if (!firstPageResult.didPullSucceed) {
				completeFailedSync()
				return
			}

			const didReachAnchorOnFirstPage = Boolean(
				recoveryAnchorAppMessageId &&
				!shouldContinueForegroundRecovery(
					firstPageResult.pulledItems,
					recoveryAnchorAppMessageId,
				),
			)
			const isFirstPageServerComplete = !firstPageResult.response?.has_more
			const shouldFetchSecondPage = !didReachAnchorOnFirstPage && !isFirstPageServerComplete
			if (shouldFetchSecondPage) {
				const nextPageToken = String(firstPageResult.response?.page_token || "")
				if (!nextPageToken) {
					completeFailedSync()
					return
				}
				const secondPageResult = await fetchMessagesPage({
					conversation_id: currentSelectedTopic.chat_conversation_id,
					chat_topic_id: topicId,
					page_token: nextPageToken,
					order: "desc",
					limit: FOREGROUND_RECOVERY_SECOND_PAGE_MESSAGE_COUNT,
					updatePageToken: true,
				})
				if (!secondPageResult.didPullSucceed) {
					completeFailedSync()
					return
				}
				aggregatedPulledItems = dedupePulledItemsByAppMessageId([
					...aggregatedPulledItems,
					...secondPageResult.pulledItems.filter(shouldIncludeFetchedMessage),
				])
				const didReachAnchorOnSecondPage = Boolean(
					recoveryAnchorAppMessageId &&
					!shouldContinueForegroundRecovery(
						aggregatedPulledItems,
						recoveryAnchorAppMessageId,
					),
				)
				const isSecondPageServerComplete = !secondPageResult.response?.has_more
				if (!didReachAnchorOnSecondPage && !isSecondPageServerComplete) {
					completeFailedSync()
					return
				}
			}

			// 前台恢复是“权威快照重建”场景，因此把两段分页结果先聚合后一次性写回。
			// 旧 generation 的 payload 仍进入 Store 做消息版本裁决，但无权替换 membership。
			superMagicStore.initializeMessages(topicId, aggregatedPulledItems, {
				mode: "replace",
				syncGeneration,
			})
			if (!isCurrentForegroundOwner()) return
			if (!superMagicStore.isTopicSyncCurrent(topicId, syncGeneration)) return
			const latestSelectedTopic = selectedTopicRef.current
			superMagicStore.completeTopicSync(topicId, syncGeneration, {
				succeeded: true,
				taskStatus: latestSelectedTopic?.task_status || latestSelectedTopic?.status,
				latestSeqId: superMagicStore.getLatestMessageSeqId(topicId),
				renderStrategy: "foreground-instant",
			})

			if (!initialLoadedTopicsRef.current.has(topicId)) {
				initialLoadedTopicsRef.current.add(topicId)
				setIsMessagesInitialLoading(false)
			}
			setIsSelectedTopicMessagesReady(true)
			delete foregroundRecoveryAnchorRef.current[topicId]
		} catch {
			if (foregroundTopicSyncRef.current === inFlightSync) {
				cancelForegroundTopicSync(topicId)
			}
		} finally {
			if (foregroundTopicSyncRef.current === inFlightSync) {
				foregroundTopicSyncRef.current = null
			}
		}
	})

	/**
	 * 手动加载更早的历史消息，继续复用服务端返回的 page_token。
	 */
	const handlePullMoreMessage = useMemoizedFn(
		async (topicInfo: Topic | null, callback?: () => void) => {
			// if (selectedWorkspace && topicInfo) {
			if (topicInfo) {
				const topicId = topicInfo.chat_topic_id
				const pageToken = topicPageTokenMap.current[topicId] || ""
				if (
					topicNotHaveMoreMessageMap.current[topicId] ||
					historyPullInFlightTopicsRef.current.has(topicId) ||
					lastHistoryPageTokenMapRef.current[topicId] === pageToken
				) {
					return
				}

				historyPullInFlightTopicsRef.current.add(topicId)
				lastHistoryPageTokenMapRef.current[topicId] = pageToken
				// Capture the viewport before awaiting HTTP so the subsequent merge can restore it.
				callback?.()
				try {
					const pullResult = await pullMessage({
						conversation_id: topicInfo.chat_conversation_id,
						chat_topic_id: topicId,
						page_token: pageToken,
						order: "desc",
						limit: 100,
						updatePageToken: true,
						writeIntent: "merge",
					})
					if (!pullResult.didPullSucceed) {
						delete lastHistoryPageTokenMapRef.current[topicId]
					}
				} finally {
					historyPullInFlightTopicsRef.current.delete(topicId)
				}
			}
		},
	)

	// Initialize messages when topic changes
	useEffect(() => {
		const topicId = selectedTopic?.chat_topic_id
		superMagicStore.setActiveTopicId(selectedTopic?.chat_topic_id || null)
		setIsSelectedTopicMessagesReady(false)
		if (topicId && !initialLoadedTopicsRef.current.has(topicId)) {
			setIsMessagesInitialLoading(true)
		} else {
			setIsMessagesInitialLoading(false)
		}
		updateTopicMessages()
		return () => {
			cancelForegroundTopicSync(topicId)
		}
	}, [
		cancelForegroundTopicSync,
		selectedTopic?.chat_conversation_id,
		selectedTopic?.chat_topic_id,
		selectedTopic?.id,
		updateTopicMessages,
	])

	useEffect(() => {
		const topicId = selectedTopic?.chat_topic_id
		const conversationId = selectedTopic?.chat_conversation_id
		if (!topicId || !conversationId) return

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
	])

	// Subscribe to WebSocket new message events
	useEffect(() => {
		let disposed = false
		let liveSyncTimer: number | null = null
		let liveSyncInFlight = false
		let liveSyncPending = false

		const scheduleLiveIncrementalSync = () => {
			if (liveSyncTimer !== null) window.clearTimeout(liveSyncTimer)
			liveSyncTimer = window.setTimeout(async () => {
				liveSyncTimer = null
				if (disposed) return
				if (liveSyncInFlight) {
					liveSyncPending = true
					return
				}

				const currentTopic = selectedTopicRef.current
				if (!currentTopic?.chat_conversation_id || !currentTopic.chat_topic_id) return
				liveSyncInFlight = true
				liveSyncPending = false
				try {
					await pullMessage({
						conversation_id: currentTopic.chat_conversation_id,
						chat_topic_id: currentTopic.chat_topic_id,
						page_token: "",
						order: "desc",
						limit: LIVE_INCREMENTAL_SYNC_MESSAGE_COUNT,
						updatePageToken: false,
						writeIntent: "incremental",
					})
				} finally {
					liveSyncInFlight = false
					if (!disposed && liveSyncPending) scheduleLiveIncrementalSync()
				}
			}, LIVE_INCREMENTAL_SYNC_DEBOUNCE_MS)
		}

		/**
		 * 处理 WS 新消息事件。
		 * 同一 Topic 的短时持久消息事件合并为一次小窗口增量回拉。
		 */
		const handleNewMessage = (data: any) => {
			console.log("我接受到的 ws 消息", data)
			const { topic_id: chat_topic_id = "" } = data.message || {}
			const currentTopic = selectedTopicRef.current
			if (!currentTopic?.chat_conversation_id || chat_topic_id !== currentTopic.chat_topic_id)
				return
			if (data.conversation_id && data.conversation_id !== currentTopic.chat_conversation_id)
				return
			scheduleLiveIncrementalSync()
		}
		pubsub.subscribe(PubSubEvents.Super_Magic_New_Message_V2, handleNewMessage)
		return () => {
			disposed = true
			if (liveSyncTimer !== null) window.clearTimeout(liveSyncTimer)
			pubsub?.unsubscribe(PubSubEvents.Super_Magic_New_Message_V2, handleNewMessage)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedTopic?.chat_conversation_id, selectedTopic?.chat_topic_id])

	useEffect(() => {
		/**
		 * 处理页面前后台切换。
		 * hidden 时记录恢复锚点，visible 时触发前台补拉。
		 */
		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				if (selectedTopicRef.current?.chat_topic_id) {
					// hidden 时先记录一个“离开瞬间”的基准锚点；
					// 若 hidden 期间轮询/WS 继续把新消息落到了主列表，再由 pullMessage 推进最新已落地锚点。
					setForegroundRecoveryBaseAnchor(selectedTopicRef.current.chat_topic_id)
				}
				return
			}
			if (document.visibilityState !== "visible") return
			syncSelectedTopicOnForeground()
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
	}, [setForegroundRecoveryBaseAnchor, syncSelectedTopicOnForeground])

	// Timer: poll messages every 20 seconds
	useEffect(() => {
		let disposed = false
		let inFlightPollingSync: { topicId: string; generation: number } | null = null

		const cancelInFlightPollingSync = () => {
			if (!inFlightPollingSync) return
			const { topicId, generation } = inFlightPollingSync
			inFlightPollingSync = null
			superMagicStore.cancelTopicSync(topicId, generation)
		}

		const hasActiveTopicSync = () =>
			Array.from(superMagicStore.topicMeta.entries()).some(
				([topicId, topicMeta]) =>
					topicMeta.syncState === "syncing" &&
					superMagicStore.isTopicSyncCurrent(topicId, topicMeta.syncGeneration),
			)

		const timer = setInterval(() => {
			const currentTopic = selectedTopicRef.current
			if (
				currentTopic?.id &&
				currentTopic.chat_conversation_id &&
				currentTopic.chat_topic_id
			) {
				const topicId = currentTopic.chat_topic_id
				const taskStatus = currentTopic.task_status || currentTopic.status
				const pollingParams = {
					conversation_id: currentTopic.chat_conversation_id,
					chat_topic_id: topicId,
					page_token: "",
					order: "desc" as const,
					// 轮询兜底保持中等窗口，兼顾稳定性和请求成本。
					limit: POLLING_SYNC_MESSAGE_COUNT,
					updatePageToken: false,
					writeIntent: "incremental" as const,
				}

				if (taskStatus !== TaskStatus.FINISHED) {
					finishedPollingCompletedTopicsRef.current.delete(topicId)
					// Active chunks are the primary realtime source. The Store watchdog owns stalled
					// stream recovery, so resident polling would only duplicate healthy traffic.
					if (superMagicStore.isTopicStreaming(topicId)) return
					void pullMessage(pollingParams)
					return
				}
				if (typeof superMagicStore.beginTopicSync !== "function") {
					void pullMessage(pollingParams)
					return
				}
				if (finishedPollingCompletedTopicsRef.current.has(topicId)) return

				// finished polling 只确认最近增量和任务完成屏障，不能复用完整历史 recovery。
				// generation 必须单飞且不能抢占已有权威同步，避免慢请求持续作废彼此。
				if (inFlightPollingSync || hasActiveTopicSync()) return
				const syncGeneration = superMagicStore.beginTopicSync(topicId)
				inFlightPollingSync = { topicId, generation: syncGeneration }

				void pullMessage(pollingParams)
					.then((pullResult) => {
						if (disposed || inFlightPollingSync?.generation !== syncGeneration) return
						if (!superMagicStore.isTopicSyncCurrent(topicId, syncGeneration)) return
						const currentTopic = selectedTopicRef.current
						const currentTaskStatus = currentTopic?.task_status || currentTopic?.status
						if (
							currentTopic?.chat_topic_id !== topicId ||
							currentTaskStatus !== TaskStatus.FINISHED
						) {
							superMagicStore.cancelTopicSync(topicId, syncGeneration)
							return
						}
						const didComplete = superMagicStore.completeTopicSync(
							topicId,
							syncGeneration,
							{
								succeeded: pullResult.didPullSucceed,
								taskStatus: currentTaskStatus,
								latestSeqId: pullResult.didPullSucceed
									? superMagicStore.getLatestMessageSeqId(topicId)
									: undefined,
							},
						)
						if (pullResult.didPullSucceed && didComplete) {
							finishedPollingCompletedTopicsRef.current.add(topicId)
						}
					})
					.catch(() => {
						// HTTP 后处理或 Store 写入异常时释放 generation；失败同步不能成为完成屏障。
						if (disposed || inFlightPollingSync?.generation !== syncGeneration) return
						superMagicStore.cancelTopicSync(topicId, syncGeneration)
					})
					.finally(() => {
						if (inFlightPollingSync?.generation === syncGeneration) {
							inFlightPollingSync = null
						}
					})
			}
		}, 20 * 1000)

		// Cleanup timer
		return () => {
			disposed = true
			clearInterval(timer)
			cancelInFlightPollingSync()
		}
	}, [pullMessage, selectedTopic])

	// Handle refresh topic messages after revoke
	useEffect(() => {
		const handleRefreshTopicMessages = () =>
			updateTopicMessages({
				// Revoke refresh is an authoritative snapshot: replace preserves the server's
				// complete canonical membership, while visible-branch filtering stays in UI projection.
				writeIntent: "replace",
				messageCount: 500,
			})

		pubsub.subscribe(PubSubEvents.Refresh_Topic_Messages, handleRefreshTopicMessages)

		return () => {
			pubsub?.unsubscribe(PubSubEvents.Refresh_Topic_Messages, handleRefreshTopicMessages)
		}
	}, [updateTopicMessages])

	// Cleanup on component unmount
	useEffect(() => {
		return () => {
			// Cleanup topic_id and page_token mapping
			topicPageTokenMap.current = {}
			topicNotHaveMoreMessageMap.current = {}
			historyPullInFlightTopicsRef.current.clear()
			lastHistoryPageTokenMapRef.current = {}
			finishedPollingCompletedTopicsRef.current.clear()
		}
	}, [])

	return {
		pullMessage,
		updateTopicMessages,
		handlePullMoreMessage,
		topicPageTokenMap,
		isMessagesInitialLoading,
		isSelectedTopicMessagesReady,
	}
}
