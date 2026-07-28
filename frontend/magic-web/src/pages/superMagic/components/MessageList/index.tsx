import { useMemoizedFn } from "ahooks"
import {
	type MutableRefObject,
	type ReactNode,
	type Ref,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	ScrollEdgeFadeOverlays,
	useScrollEdgeFadeMask,
	type ScrollEdgeFadeColor,
} from "@/components/base-mobile/ScrollEdgeFade"
import LoadingMessage from "../LoadingMessage"
import Empty from "./components/Empty"
import BackToLatestButton from "./components/BackToLatestButton"
import MessageListFallback from "./components/MessageListFallback"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { cn } from "@/lib/utils"
import { MessageStatus, TaskStatus, Topic } from "../../pages/Workspace/types"
import { messageFilter } from "../../utils/handleMessage"
import { useTranslation } from "react-i18next"
import { IconArrowBackUp, IconChevronsDown, IconChevronsUp } from "@tabler/icons-react"
import { SuperMagicMessageItem } from "./type"
import { Node } from "./components/Nodes"
import { observer } from "mobx-react-lite"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { superMagicStore } from "../../stores"
import { optimisticMessageStore } from "../../stores/optimisticMessageStore"
import { SuperMagicApi } from "@/apis"
import { messagesConverter, getMessageNodeKey, createCheckIsLastMessage } from "./helpers"
import { buildMessageKeysAndTurnGroups } from "./message-turn-groups"
import {
	MessageTurnGroupList,
	USER_MESSAGE_ROW_CLASS,
	getUserMessageStickyTopClass,
	USER_MESSAGE_STICKY_OVERLAY_CLASS,
} from "./MessageTurnGroupList"
import magicToast from "@/components/base/MagicToaster/utils"
import { useIsMobile } from "@/hooks/useIsMobile"
import { Button } from "@/components/shadcn-ui/button"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { useAutoScroll } from "./hooks/useAutoScroll"
import RevokedEditableUserMessage from "./components/RevokedEditableUserMessage"
import type { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import {
	useExportSelectionStore,
	MAX_EXPORT_COUNT,
	getSelectableTurnKeys,
} from "./hooks/useExportSelection"
import { ExportToolbar } from "./components/ExportToolbar"
import { ExportPreviewModal } from "./components/ExportPreviewModal"
import { extractTurns } from "./export/extractMessageContent"

import { MessageListProvider, useMessageListContext } from "./context"
import MessageRenderErrorBoundary from "./components/MessageRenderErrorBoundary"
import MessageRenderContent from "./components/MessageRenderContent"
import { projectVisibleMessagesByRevokedTail } from "../../utils/project-visible-messages-by-revoked-tail"

export { MessageListProvider }

export interface MessageListExportApi {
	enter: () => void
	exit: () => void
	isActive: () => boolean
}

interface MessageListProps {
	data: Array<SuperMagicMessageItem>
	isShare?: boolean
	setSelectedDetail?: (detail: any) => void
	className?: string
	isEmptyStatus?: boolean
	selectedTopic: Topic | null
	handlePullMoreMessage?: (selectedTopic: Topic | null, callback?: () => void) => void
	showLoading?: boolean
	currentTopicStatus?: TaskStatus
	handleSendMsg?: (content: string, options?: any) => void
	children?: ReactNode | ((item: any, index: number) => ReactNode)
	onFileClick?: (fileItem: any) => void
	/** Extra classes; set [--sticky-message-mask-bg] / [--sticky-message-mask-fade-from] to tune mask */
	stickyMessageClassName?: string
	/** True while the initial message fetch is in-flight; suppresses the empty fallback */
	isMessagesLoading?: boolean
	fallbackRender?: ReactNode
	/** Override BackToLatestButton position (e.g. clear bottom fade above editor) */
	backToLatestButtonClassName?: string
	enableRevokedUserMessageReedit?: boolean
	topicModelStore?: ReturnType<typeof createSuperMagicTopicModelStore>
	/** Enable message-export selection mode. Caller drives entry via exportApiRef. */
	enableExport?: boolean
	/** Receives an imperative handle to drive export selection mode. */
	exportApiRef?: (api: MessageListExportApi | null) => void
	/** Title used as export document header / default file name. */
	exportTitle?: string
	/** Optional ref to the ScrollArea viewport (mobile TopicPage scroll coordination). */
	viewportRef?: Ref<HTMLDivElement | null>
	/**
	 * Top/bottom scroll edge fade on mobile (prototype ChatScreen).
	 * Pass `false` to disable; default enables on mobile when not share.
	 */
	scrollEdgeFade?: boolean | { fadeColor?: ScrollEdgeFadeColor }
}

/**
 * Writes the same scroll viewport element into every provided ref callback/object.
 */
function assignScrollViewportRef(
	element: HTMLDivElement | null,
	...refs: Array<Ref<HTMLDivElement | null> | undefined>
) {
	for (const ref of refs) {
		if (!ref) continue
		if (typeof ref === "function") {
			ref(element)
			continue
		}
		// RefObject.current is readonly in types; callers pass useRef() which is mutable at runtime.
		;(ref as MutableRefObject<HTMLDivElement | null>).current = element
	}
}

// Shared base classes for the revoked-messages action buttons
const revokedActionButton = cn(
	"inline-flex h-6 items-center gap-1 px-2.5 py-1",
	"cursor-pointer rounded-lg text-xs leading-4",
	"border border-border bg-background text-foreground",
	"hover:bg-fill hover:text-foreground",
	"active:bg-fill-secondary",
	"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
	"disabled:pointer-events-none disabled:opacity-50",
)

const MessageList = observer(
	({
		data,
		isShare = false,
		setSelectedDetail,
		selectedTopic,
		className,
		isEmptyStatus = false,
		handlePullMoreMessage,
		showLoading,
		currentTopicStatus,
		handleSendMsg,
		onFileClick,
		stickyMessageClassName,
		children,
		backToLatestButtonClassName,
		enableRevokedUserMessageReedit = false,
		topicModelStore,
		enableExport = false,
		exportApiRef,
		exportTitle,
		viewportRef,
		scrollEdgeFade,
		isMessagesLoading,
	}: MessageListProps) => {
		const { t } = useTranslation("super")
		const isMobile = useIsMobile()

		const exportStore = useExportSelectionStore()

		const nodesPanelRef = useRef<HTMLDivElement | null>(null)
		/** Scroll edge fade is mobile-only; desktop TopicMessagePanel / share pages stay unchanged. */
		const scrollEdgeFadeConfig = useMemo(() => {
			if (!isMobile || isShare) return null
			if (scrollEdgeFade === false) return null
			if (typeof scrollEdgeFade === "object") {
				return {
					fadeColor:
						scrollEdgeFade.fadeColor ?? ("mobile-background" as ScrollEdgeFadeColor),
				}
			}
			return { fadeColor: "mobile-background" as ScrollEdgeFadeColor }
		}, [scrollEdgeFade, isMobile, isShare])

		const {
			scrollRef: fadeScrollRef,
			showTopMask,
			showBottomMask,
		} = useScrollEdgeFadeMask({
			contentDeps: [
				data.length,
				showLoading,
				isMessagesLoading,
				isEmptyStatus,
				selectedTopic?.id,
			],
		})

		/** Keeps auto-scroll, edge-fade hook, and optional parent ref on one viewport node. */
		const setScrollViewportRef = useCallback(
			(element: HTMLDivElement | null) => {
				nodesPanelRef.current = element
				if (scrollEdgeFadeConfig) fadeScrollRef.current = element
				assignScrollViewportRef(element, viewportRef)
			},
			[viewportRef, scrollEdgeFadeConfig, fadeScrollRef],
		)
		const renderedMessageKeysRef = useRef<Set<string>>(new Set())
		const canAnimateNewMessagesRef = useRef(false)
		const currentTopicKeyRef = useRef<string>("")

		const isStreamLoading = superMagicStore.isTopicStreaming(selectedTopic?.chat_topic_id || "")

		// When entering revoked-edit mode, read the set of failed messages recorded at undo success.
		// These messages are hidden from display first; actual deletion happens after user confirms sending the new message.
		const hiddenRevokedOptimisticMessageIds =
			optimisticMessageStore.getHiddenRevokedOptimisticMessageIds(
				selectedTopic?.chat_topic_id,
			)
		const hiddenRevokedOptimisticMessageIdSet = useMemo(
			() => new Set(hiddenRevokedOptimisticMessageIds),
			[hiddenRevokedOptimisticMessageIds],
		)
		// Store retains revoked facts for recovery and editing; this component only renders
		// the current visible branch, including an active revoked tail when one exists.
		const visibleData = projectVisibleMessagesByRevokedTail(data)

		// Locate the starting index of the active revoked tail in the visible branch.
		const revokedSegmentStartIndex = useMemo(
			() =>
				visibleData.findIndex(
					(node: SuperMagicMessageItem) => node?.status === MessageStatus.REVOKED,
				),
			[visibleData],
		)

		// After all revoked messages are restored (revokedSegmentStartIndex becomes -1), clear the hidden set,
		// ensuring failed messages and revoked messages restore in the same render cycle.
		useEffect(() => {
			if (revokedSegmentStartIndex < 0 && selectedTopic?.chat_topic_id) {
				optimisticMessageStore.clearHiddenRevokedOptimisticMessageIds(
					selectedTopic.chat_topic_id,
				)
			}
		}, [revokedSegmentStartIndex, selectedTopic?.chat_topic_id])

		const mainDisplayData = useMemo(() => {
			if (revokedSegmentStartIndex < 0) return visibleData

			// After entering revoked-edit mode, hide subsequent failed optimistic messages recorded at undo;
			// the main message stream only keeps stable messages before the revoke point.
			return visibleData.filter((node, index) => {
				if (hiddenRevokedOptimisticMessageIdSet.has(node?.app_message_id || "")) {
					return false
				}
				return index < revokedSegmentStartIndex
			})
		}, [hiddenRevokedOptimisticMessageIdSet, revokedSegmentStartIndex, visibleData])

		const revokedBranchData = useMemo(() => {
			if (revokedSegmentStartIndex < 0) {
				return visibleData.filter((node) => node?.status === MessageStatus.REVOKED)
			}

			// The revoked-edit preview area still shows normal messages from the old branch in current list order;
			// failed optimistic messages stay hidden until user confirms send, then cleaned up in background.
			return visibleData.filter((node, index) => {
				if (hiddenRevokedOptimisticMessageIdSet.has(node?.app_message_id || "")) {
					return false
				}
				if (index >= revokedSegmentStartIndex) return true
				return false
			})
		}, [hiddenRevokedOptimisticMessageIdSet, revokedSegmentStartIndex, visibleData])

		const { messages, messageKeys, messageTurnGroups } = useMemo(() => {
			const messages = messagesConverter(mainDisplayData)
			const { messageKeys, messageTurnGroups } = buildMessageKeysAndTurnGroups(messages)
			return { messages, messageKeys, messageTurnGroups }
		}, [mainDisplayData])

		const currentTopicKey = selectedTopic?.chat_topic_id || ""
		if (currentTopicKeyRef.current !== currentTopicKey) {
			currentTopicKeyRef.current = currentTopicKey
			renderedMessageKeysRef.current = new Set(messageKeys)
			canAnimateNewMessagesRef.current = false
		}

		const entryAnimationMeta = useMemo(() => {
			const insertedKeySet = new Set<string>()
			const insertedOrderMap = new Map<string, number>()
			if (!canAnimateNewMessagesRef.current) {
				return { insertedKeySet, insertedOrderMap }
			}

			let order = 0
			for (const key of messageKeys) {
				if (!renderedMessageKeysRef.current.has(key)) {
					insertedKeySet.add(key)
					insertedOrderMap.set(key, order++)
				}
			}
			return { insertedKeySet, insertedOrderMap }
		}, [messageKeys])

		const userMessageStickyTopClass = getUserMessageStickyTopClass(isMobile)

		useEffect(() => {
			canAnimateNewMessagesRef.current = true
		}, [currentTopicKey])

		useEffect(() => {
			renderedMessageKeysRef.current = new Set(messageKeys)
		}, [messageKeys])

		const { showBackToLatest, scrollToBottom, notifyPullMoreStarted } = useAutoScroll({
			containerRef: nodesPanelRef,
			topicKey: selectedTopic?.chat_topic_id || "",
			onPullMore: () => {
				handlePullMoreMessage?.(selectedTopic, () => {
					notifyPullMoreStarted()
				})
			},
		})

		const isLastMessageError = useMemo(() => {
			const lastNode = mainDisplayData?.[mainDisplayData?.length - 1]
			const n = superMagicStore.getMessageNode(lastNode?.app_message_id)
			return n?.status === TaskStatus.ERROR
		}, [mainDisplayData])

		const showAiGeneratedTip =
			(mainDisplayData.length > 0 &&
				!showLoading &&
				currentTopicStatus !== TaskStatus.RUNNING) ||
			isLastMessageError

		const revokedDisplayMessages = useMemo<Array<SuperMagicMessageItem>>(
			() => messagesConverter(revokedBranchData, false) as Array<SuperMagicMessageItem>,
			[revokedBranchData],
		)

		// 撤回编辑区只保留第一条用户消息作为可编辑主体，其余 revoked 消息继续留在下面的预览区。
		const firstRevokedUserMessage =
			revokedDisplayMessages.find((node) => node?.role === "user") || null
		const firstRevokedUserMessageIndex = useMemo(
			() =>
				firstRevokedUserMessage
					? revokedDisplayMessages.findIndex(
							(node) =>
								node?.app_message_id === firstRevokedUserMessage.app_message_id,
						)
					: -1,
			[firstRevokedUserMessage, revokedDisplayMessages],
		)

		const maskedRevokedMessages = useMemo(() => {
			if (!firstRevokedUserMessage)
				return revokedDisplayMessages.map((node, index) => ({ node, index }))

			return revokedDisplayMessages
				.map((node, index) => ({ node, index }))
				.filter(
					({ node }) => node?.app_message_id !== firstRevokedUserMessage.app_message_id,
				)
		}, [firstRevokedUserMessage, revokedDisplayMessages])

		const firstRevokedUserMessageKey = firstRevokedUserMessage
			? getMessageNodeKey(firstRevokedUserMessage) ||
				`${firstRevokedUserMessage?.role || "message"}-${firstRevokedUserMessageIndex}`
			: null

		const checkIsLastMessage = useMemoizedFn(createCheckIsLastMessage(messages))

		const selectableTurnKeys = useMemo(
			() => (enableExport ? getSelectableTurnKeys(messageTurnGroups) : []),
			[enableExport, messageTurnGroups],
		)

		useEffect(() => {
			exportStore.onWarn = (warning) => {
				if (warning.type === "limit") {
					magicToast.warning(
						t("export.limitReached", {
							defaultValue: "最多选择 {{max}} 条对话",
							max: warning.limit,
						}) as string,
					)
				} else {
					magicToast.info(
						t("export.truncated", {
							defaultValue: "已选中前 {{max}} 条对话",
							max: warning.limit,
						}) as string,
					)
				}
			}
		}, [exportStore, t])

		useEffect(() => {
			if (!enableExport) return
			const api: MessageListExportApi = {
				enter: () => exportStore.enter(),
				exit: () => exportStore.exit(),
				isActive: () => exportStore.exportMode,
			}
			exportApiRef?.(api)
			return () => exportApiRef?.(null)
		}, [enableExport, exportApiRef, exportStore])

		// Exit export mode when topic changes
		useEffect(() => {
			exportStore.exit()
		}, [currentTopicKey, exportStore])

		const handleToggleSelect = useMemoizedFn((key: string) => exportStore.toggle(key))
		const handleOpenPreview = useMemoizedFn(() => {
			if (exportStore.count === 0) return
			exportStore.openPreview()
		})

		const parentCtx = useMessageListContext()
		const workspaceFilesList = parentCtx.projectFilesStore?.workspaceFilesList

		const exportTurns = useMemo(() => {
			if (!exportStore.previewOpen) return []
			return extractTurns(messageTurnGroups, new Set(exportStore.selectedKeys), {
				includeToolCall: exportStore.includeToolCall,
				resolveNode: (id) => superMagicStore.getMessageNode(id),
				workspaceFilesList,
			})
		}, [
			exportStore.previewOpen,
			exportStore.selectedKeys,
			exportStore.includeToolCall,
			messageTurnGroups,
			workspaceFilesList,
		])

		const exportLimitReached = exportStore.count >= MAX_EXPORT_COUNT
		const exportModeActive = enableExport && exportStore.exportMode

		const exportEnterRequest = useMemoizedFn(() => exportStore.enter())
		const augmentedMessageListContext = useMemo(
			() => ({
				...parentCtx,
				allowExport: enableExport,
				exportModeActive,
				onExportRequest: enableExport ? exportEnterRequest : undefined,
			}),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[
				parentCtx.allowRevoke,
				parentCtx.allowUserMessageCopy,
				parentCtx.allowScheduleTaskCreate,
				parentCtx.allowMessageTooltip,
				parentCtx.allowConversationCopy,
				parentCtx.allowCreateNewTopic,
				parentCtx.exportModeActive,
				parentCtx.onTopicSwitch,
				parentCtx.renderAssistantAvatar,
				parentCtx.showTaskCompletedBadge,
				enableExport,
				exportModeActive,
				exportEnterRequest,
			],
		)

		/** 是否展开已撤销消息 */
		const [isRevokedMessagesExpanded, setIsRevokedMessagesExpanded] = useState(false)
		/** 是否强制隐藏已撤销消息 */
		const [forceHideRevokedMessages, setForceHideRevokedMessages] = useState(false)
		const [isCancelRevokedLoading, setIsCancelRevokedLoading] = useState(false)
		const [isFirstRevokedUserMessagePendingSend, setIsFirstRevokedUserMessagePendingSend] =
			useState(false)

		/** 展开或收起已撤销消息 */
		const handleRevokedMessagesExpanded = useMemoizedFn(() => {
			setIsRevokedMessagesExpanded((prev) => !prev)
		})

		useEffect(() => {
			setIsFirstRevokedUserMessagePendingSend(false)
		}, [firstRevokedUserMessageKey])

		/** 取消撤销已撤销消息 */
		const handleCancelRevokedMessages = useMemoizedFn(async () => {
			if (!selectedTopic?.id || isCancelRevokedLoading) return
			try {
				setIsCancelRevokedLoading(true)
				await SuperMagicApi.cancelUndoMessage({ topic_id: selectedTopic.id })
				magicToast.success(t("warningCard.cancelUndoMessageSuccess"))
				pubsub.publish(PubSubEvents.Show_Revoked_Messages)
				pubsub.publish(PubSubEvents.Refresh_Topic_Messages)
			} catch (error) {
				console.error("handleCancelRevokedMessages error:", error)
			} finally {
				setIsCancelRevokedLoading(false)
			}
		})

		useEffect(() => {
			pubsub.subscribe(PubSubEvents.Hide_Revoked_Messages, () => {
				setForceHideRevokedMessages(true)
			})
			pubsub.subscribe(PubSubEvents.Show_Revoked_Messages, () => {
				setForceHideRevokedMessages(false)
			})
			return () => {
				pubsub?.unsubscribe(PubSubEvents.Hide_Revoked_Messages)
				pubsub?.unsubscribe(PubSubEvents.Show_Revoked_Messages)
			}
		}, [])

		const renderNodeContent = (
			node: SuperMagicMessageItem,
			index: number,
			options?: {
				disableEntryAnimation?: boolean
				previousNode?: SuperMagicMessageItem
			},
		): ReactNode => {
			const nodeKey = getMessageNodeKey(node) || `${node?.role || "message"}-${index}`
			const firstRevokedUserMessageKey = firstRevokedUserMessage
				? getMessageNodeKey(firstRevokedUserMessage) ||
					`${firstRevokedUserMessage?.role || "message"}-${firstRevokedUserMessageIndex}`
				: null
			const isFirstRevokedUserMessage = nodeKey === firstRevokedUserMessageKey

			if (!children) {
				const isNewlyInserted =
					!options?.disableEntryAnimation &&
					Boolean(nodeKey) &&
					entryAnimationMeta.insertedKeySet.has(nodeKey)
				const entryAnimationOrder = isNewlyInserted
					? entryAnimationMeta.insertedOrderMap.get(nodeKey) || 0
					: 0

				const previousNode = options?.previousNode || messages?.[index - 1]
				return (
					<Node
						role={node?.role || "user"}
						node={node}
						prevNode={previousNode}
						isFirst={previousNode?.role === "user" && node?.role === "assistant"}
						checkIsLastMessage={checkIsLastMessage}
						selectedTopic={selectedTopic}
						onSelectDetail={setSelectedDetail}
						isSelected={node?.topic_id === selectedTopic?.id}
						onFileClick={onFileClick}
						isNewlyInserted={isNewlyInserted}
						entryAnimationOrder={entryAnimationOrder}
						isFirstRevokedUserMessage={isFirstRevokedUserMessage}
						isShare={isShare}
					/>
				)
			}
			if (typeof children === "function") return children(node, index)
			if (children) return children
			return null
		}

		const renderNodes = (
			node: SuperMagicMessageItem,
			index: number,
			options?: {
				disableEntryAnimation?: boolean
				disableUserSticky?: boolean
				previousNode?: SuperMagicMessageItem
			},
		) => {
			const nodeKey = getMessageNodeKey(node) || `${node?.role || "message"}-${index}`
			const isUser = node?.role !== "assistant" && node?.role !== "tool"

			return (
				<div
					key={nodeKey}
					data-message-id={nodeKey}
					data-message-role={node?.role || "user"}
					className={cn("relative", isUser && USER_MESSAGE_ROW_CLASS)}
				>
					<MessageRenderErrorBoundary
						messageKey={nodeKey}
						resetKey={
							typeof node?.content === "string"
								? node.content
								: typeof node?.status === "string"
									? node.status
									: undefined
						}
					>
						<MessageRenderContent
							render={() => renderNodeContent(node, index, options)}
						/>
					</MessageRenderErrorBoundary>
				</div>
			)
		}

		return (
			<MessageListProvider value={augmentedMessageListContext}>
				<div
					className={cn(
						"relative flex h-full w-full flex-1 flex-col overflow-hidden",
						"message-list-container",
						className,
					)}
				>
					{enableExport && exportStore.exportMode && (
						<div className="px-2 pt-2">
							<ExportToolbar
								store={exportStore}
								selectableKeys={selectableTurnKeys}
								onNext={handleOpenPreview}
							/>
						</div>
					)}
					<ScrollArea
						className={cn(
							"h-full w-full",
							isMobile
								? "[&>[data-slot='scroll-area-viewport']>div]:px-4"
								: "[&>[data-slot='scroll-area-viewport']>div]:pl-2 [&>[data-slot='scroll-area-viewport']>div]:pr-3",
							"[&>[data-slot='scroll-area-viewport']>div]:pt-0",
							"[&>[data-slot='scroll-area-viewport']>div]:pb-2",
							"[&>[data-slot='scroll-area-viewport']>div]:!flex",
							"[&>[data-slot='scroll-area-viewport']>div]:!flex-col",
							"[&>[data-slot='scroll-area-viewport']>div]:!gap-2",
							"[&>[data-slot='scroll-area-viewport']>div]:!max-w-3xl",
							"[&>[data-slot='scroll-area-viewport']>div]:!min-w-[unset]",
							"[&>[data-slot='scroll-area-viewport']>div]:!mx-auto",
							isMobile
								? "[&>[data-slot='scroll-area-viewport']>div:first-child]:mt-[10px]"
								: "[&>[data-slot='scroll-area-viewport']>div:first-child]:mt-[50px]",
						)}
						viewportRef={setScrollViewportRef}
					>
						{visibleData.length > 0 || !isEmptyStatus ? (
							<>
								<MessageTurnGroupList
									groups={messageTurnGroups}
									isMobile={isMobile}
									stickyMessageClassName={stickyMessageClassName}
									renderNode={({ node, index }) => renderNodeContent(node, index)}
									exportMode={enableExport && exportStore.exportMode}
									selectedKeys={exportStore.selectedKeys}
									onToggleSelect={handleToggleSelect}
									limitReached={exportLimitReached}
								/>
								{revokedDisplayMessages.length > 0 && !forceHideRevokedMessages && (
									<section className="relative flex flex-col gap-2">
										{firstRevokedUserMessage &&
											(() => {
												const firstRevokedUserMessageKey =
													getMessageNodeKey(firstRevokedUserMessage) ||
													`${firstRevokedUserMessage?.role || "message"}-${firstRevokedUserMessageIndex}`
												const firstRevokedPreviousNode =
													firstRevokedUserMessageIndex > 0
														? revokedDisplayMessages[
																firstRevokedUserMessageIndex - 1
															]
														: undefined
												const firstRevokedUserMessageContent = (
													<MessageRenderErrorBoundary
														messageKey={firstRevokedUserMessageKey}
														resetKey={
															typeof firstRevokedUserMessage?.content ===
															"string"
																? firstRevokedUserMessage.content
																: typeof firstRevokedUserMessage?.status ===
																	  "string"
																	? firstRevokedUserMessage.status
																	: undefined
														}
													>
														{enableRevokedUserMessageReedit &&
														!isMobile ? (
															<RevokedEditableUserMessage
																node={firstRevokedUserMessage}
																selectedTopic={selectedTopic}
																showLoading={showLoading}
																messagesLength={visibleData.length}
																hiddenOptimisticMessageIds={
																	hiddenRevokedOptimisticMessageIds
																}
																onFileClick={onFileClick}
																topicModelStore={topicModelStore}
																onPendingSendChange={
																	setIsFirstRevokedUserMessagePendingSend
																}
																fallbackContent={
																	<MessageRenderContent
																		render={() =>
																			renderNodeContent(
																				firstRevokedUserMessage,
																				firstRevokedUserMessageIndex,
																				{
																					disableEntryAnimation: true,
																					previousNode:
																						firstRevokedPreviousNode,
																				},
																			)
																		}
																	/>
																}
															/>
														) : (
															<MessageRenderContent
																render={() =>
																	renderNodeContent(
																		firstRevokedUserMessage,
																		firstRevokedUserMessageIndex,
																		{
																			disableEntryAnimation: true,
																			previousNode:
																				firstRevokedPreviousNode,
																		},
																	)
																}
															/>
														)}
													</MessageRenderErrorBoundary>
												)

												const revokedUserMessageWrapperClassName = isMobile
													? "relative mb-2"
													: cn(
															USER_MESSAGE_STICKY_OVERLAY_CLASS,
															userMessageStickyTopClass,
															stickyMessageClassName,
														)

												return (
													<div
														{...(isMobile
															? {}
															: {
																	"data-sticky-message-id":
																		firstRevokedUserMessageKey,
																})}
														className={
															revokedUserMessageWrapperClassName
														}
													>
														<div
															data-message-id={
																firstRevokedUserMessageKey
															}
															data-message-role={
																firstRevokedUserMessage?.role ||
																"user"
															}
															className="relative"
														>
															{firstRevokedUserMessageContent}
														</div>
													</div>
												)
											})()}
										{!isFirstRevokedUserMessagePendingSend &&
										maskedRevokedMessages.length > 0 ? (
											<div
												className={cn(
													"relative max-h-[600px] flex-shrink-0 overflow-hidden",
													isRevokedMessagesExpanded &&
														"max-h-none overflow-visible",
												)}
											>
												<div
													className={cn(
														"relative overflow-hidden rounded-lg p-4",
														"[&::after]:absolute [&::after]:inset-0 [&::after]:z-[1] [&::after]:content-['']",
														"[&::after]:pointer-events-none [&::after]:bg-white/50 dark:[&::after]:bg-black/30",
													)}
												>
													{maskedRevokedMessages.map(({ node, index }) =>
														renderNodes(node, index, {
															disableEntryAnimation: true,
															disableUserSticky: true,
															previousNode:
																index > 0
																	? revokedDisplayMessages[
																			index - 1
																		]
																	: undefined,
														}),
													)}
												</div>
												<div
													className={cn(
														"pointer-events-none absolute inset-0 z-[2] flex items-end",
														"bg-[linear-gradient(to_bottom,transparent_0%,transparent_50%,rgb(var(--sidebar-rgb))_100%)]",
														isRevokedMessagesExpanded &&
															"static bg-none",
													)}
												>
													<div
														className={cn(
															"pointer-events-auto flex w-full gap-1 pb-2.5 pt-2.5",
															"bg-sidebar",
														)}
													>
														<IconArrowBackUp size={22} />
														<div className="flex flex-col gap-2.5">
															<div className="text-sm leading-5 text-foreground">
																{t(
																	"warningCard.undoMessageContentTip",
																)}
															</div>
															<div className="flex gap-2.5">
																<Button
																	className={revokedActionButton}
																	onClick={
																		handleRevokedMessagesExpanded
																	}
																>
																	<div>
																		{isRevokedMessagesExpanded
																			? t(
																					"warningCard.collapseContent",
																				)
																			: t(
																					"warningCard.expandContent",
																				)}
																	</div>
																	{isRevokedMessagesExpanded ? (
																		<IconChevronsUp size={16} />
																	) : (
																		<IconChevronsDown
																			size={16}
																		/>
																	)}
																</Button>
																<Button
																	className={revokedActionButton}
																	onClick={
																		handleCancelRevokedMessages
																	}
																>
																	{isCancelRevokedLoading ? (
																		<Spinner
																			className="animate-spin"
																			size={16}
																		/>
																	) : null}
																	{t(
																		"warningCard.restoreContent",
																	)}
																</Button>
															</div>
														</div>
													</div>
												</div>
											</div>
										) : null}
										{!isFirstRevokedUserMessagePendingSend &&
										maskedRevokedMessages.length === 0 ? (
											<div className="flex items-start gap-1 rounded-lg bg-sidebar pb-2.5 pt-2.5">
												<IconArrowBackUp size={22} />
												<div className="flex flex-col gap-2.5">
													<div className="text-sm leading-5 text-foreground">
														{t("warningCard.undoMessageContentTip")}
													</div>
													<Button
														className={revokedActionButton}
														onClick={handleCancelRevokedMessages}
													>
														{isCancelRevokedLoading ? (
															<Spinner
																className="animate-spin"
																size={16}
															/>
														) : null}
														{t("warningCard.restoreContent")}
													</Button>
												</div>
											</div>
										) : null}
									</section>
								)}
							</>
						) : (
							<Empty />
						)}
						{showLoading && !isStreamLoading && (
							<LoadingMessage
								messages={visibleData}
								showLoading={showLoading}
								selectedTopic={selectedTopic}
							/>
						)}
						{showAiGeneratedTip && (
							<div
								className={cn(
									"mx-auto mb-2.5 mt-2.5 text-center text-xs leading-4",
									"text-muted-foreground",
								)}
							>
								{t("ui.aiGeneratedTip")}
							</div>
						)}
					</ScrollArea>
					{scrollEdgeFadeConfig ? (
						<ScrollEdgeFadeOverlays
							fadeColor={scrollEdgeFadeConfig.fadeColor}
							showTopMask={showTopMask}
							showBottomMask={showBottomMask}
						/>
					) : null}
					<BackToLatestButton
						visible={showBackToLatest}
						className={backToLatestButtonClassName}
						onClick={() => scrollToBottom("smooth")}
					/>
					{enableExport && (
						<ExportPreviewModal
							store={exportStore}
							turns={exportTurns}
							title={exportTitle || selectedTopic?.topic_name || "conversation"}
						/>
					)}
				</div>
			</MessageListProvider>
		)
	},
)

export default function MessageListEntry(props: MessageListProps) {
	if (props.data.length === 0) {
		if (props.isMessagesLoading) {
			return (
				<div
					className={cn(
						"flex h-full w-full items-center justify-center",
						props.className,
					)}
				>
					<Spinner size={16} className="animate-spin text-muted-foreground" />
				</div>
			)
		}
		return props.fallbackRender || <MessageListFallback className={props.className} />
	}

	return <MessageList {...props} />
}
