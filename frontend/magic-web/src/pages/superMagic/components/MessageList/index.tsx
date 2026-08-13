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
import { TaskStatus, Topic } from "../../pages/Workspace/types"
import { useTranslation } from "react-i18next"
import { IconArrowBackUp, IconChevronsDown, IconChevronsUp } from "@tabler/icons-react"
import { SuperMagicMessageItem } from "./type"
import { Node } from "./components/Nodes"
import { observer } from "mobx-react-lite"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import type { Virtualizer } from "@tanstack/react-virtual"
import { superMagicStore } from "../../stores"
import { optimisticMessageStore } from "../../stores/optimisticMessageStore"
import { SuperMagicApi } from "@/apis"
import {
	messagesConverter,
	getMessageNodeKey,
	createCheckIsLastMessage,
	MessageProjectionCache,
} from "./helpers"
import magicToast from "@/components/base/MagicToaster/utils"
import { useIsMobile } from "@/hooks/useIsMobile"
import { Button } from "@/components/shadcn-ui/button"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { useVirtualMessageScroll } from "./hooks/useVirtualMessageScroll"
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
import MessageRenderContent from "./components/MessageRenderContent"
import { projectRevokedMessageBranches } from "../../utils/project-visible-messages-by-revoked-tail"
import { resolveBottomLoadingVisibility } from "./bottom-loading-visibility"
import {
	buildVirtualMessageProjection,
	composeVirtualMessageItems,
	type VirtualMessageItem,
} from "./virtual-message-items"
import { VirtualMessageList } from "./components/VirtualMessageList"
import { MessageViewStateProvider } from "./view-state/MessageViewStateContext"
import type { RevokedMessageEditorContext } from "./revoked-editor-context"

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
	revokedEditorContext?: RevokedMessageEditorContext
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

/** Collapsed revoked preview keeps a bounded virtual slice before the user expands it. */
const REVOKED_COLLAPSED_ITEM_LIMIT = 6

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
		onFileClick,
		stickyMessageClassName,
		children,
		backToLatestButtonClassName,
		enableRevokedUserMessageReedit = false,
		topicModelStore,
		revokedEditorContext,
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
		const virtualizerRef = useRef<Virtualizer<HTMLDivElement, HTMLDivElement> | null>(null)
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

		const renderedMessageKeysRef = useRef<Set<string>>(new Set())
		const projectionCachesRef = useRef({
			main: new MessageProjectionCache(),
			revoked: new MessageProjectionCache(),
		})
		const canAnimateNewMessagesRef = useRef(false)
		const currentTopicKeyRef = useRef<string>("")

		/** 是否展开已撤销消息 */
		const [isRevokedMessagesExpanded, setIsRevokedMessagesExpanded] = useState(false)
		/** 是否强制隐藏已撤销消息 */
		const [forceHideRevokedMessages, setForceHideRevokedMessages] = useState(false)
		const [isCancelRevokedLoading, setIsCancelRevokedLoading] = useState(false)
		const [isFirstRevokedUserMessagePendingSend, setIsFirstRevokedUserMessagePendingSend] =
			useState(false)

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
		const activeRevokedAnchor = optimisticMessageStore.getActiveRevokedAnchor(
			selectedTopic?.chat_topic_id,
		)
		// Store retains all server facts. User-anchored projection decides whole-turn
		// ownership so Assistant/Tool outer statuses cannot split one conversation round.
		const revokedProjection = useMemo(
			() => projectRevokedMessageBranches(data, activeRevokedAnchor?.seq_id),
			[data, activeRevokedAnchor?.seq_id],
		)

		// An anchor can disappear after authoritative replacement or topic cleanup. Remove the
		// stale UI sidecars only when no canonical User can establish an active revoke branch.
		useEffect(() => {
			const chatTopicId = selectedTopic?.chat_topic_id
			if (!chatTopicId || revokedProjection.activeRevokedAnchorIndex >= 0) return

			optimisticMessageStore.clearHiddenRevokedOptimisticMessageIds(chatTopicId)
			if (activeRevokedAnchor) {
				optimisticMessageStore.clearActiveRevokedAnchor(chatTopicId)
			}
		}, [
			activeRevokedAnchor,
			revokedProjection.activeRevokedAnchorIndex,
			selectedTopic?.chat_topic_id,
		])

		const mainDisplayData = useMemo(() => {
			return revokedProjection.mainMessages.filter(
				(node) => !hiddenRevokedOptimisticMessageIdSet.has(node?.app_message_id || ""),
			)
		}, [hiddenRevokedOptimisticMessageIdSet, revokedProjection.mainMessages])

		const revokedBranchData = useMemo(() => {
			// Failed optimistic messages stay hidden while the selected revoked branch is edited;
			// Assistant and Tool descendants remain together regardless of their own status.
			return revokedProjection.revokedBranchMessages.filter(
				(node) => !hiddenRevokedOptimisticMessageIdSet.has(node?.app_message_id || ""),
			)
		}, [hiddenRevokedOptimisticMessageIdSet, revokedProjection.revokedBranchMessages])

		const currentTopicKey = selectedTopic?.chat_topic_id || ""
		if (currentTopicKeyRef.current !== currentTopicKey) {
			// Projection snapshots are scoped to the active Topic; clearing here prevents
			// a topic switch from retaining thousands of historical object clones.
			projectionCachesRef.current.main.clear()
			projectionCachesRef.current.revoked.clear()
			currentTopicKeyRef.current = currentTopicKey
			renderedMessageKeysRef.current = new Set()
			canAnimateNewMessagesRef.current = false
		}
		const topicMembershipRevision =
			superMagicStore.getTopicMessageMembershipRevision?.(currentTopicKey) || 0
		const projectionVersion = currentTopicKey
			? `${topicMembershipRevision}:${activeRevokedAnchor?.seq_id || ""}:${hiddenRevokedOptimisticMessageIds.join("\u0000")}`
			: undefined

		const visibleData = [...mainDisplayData, ...revokedBranchData]

		const { messages, messageKeys, messageTurnGroups, normalVirtualMessageItems } =
			useMemo(() => {
				// Visibility has already been decided at the User-turn boundary. Do not let the
				// converter filter a temporarily revoked Assistant out of an otherwise restored turn.
				const messages = messagesConverter(
					mainDisplayData,
					false,
					projectionCachesRef.current.main,
					projectionVersion,
				)
				const projection = buildVirtualMessageProjection(messages)
				return {
					messages,
					messageKeys: projection.messageKeys,
					messageTurnGroups: projection.messageTurnGroups,
					normalVirtualMessageItems: projection.items,
				}
			}, [mainDisplayData, projectionVersion])

		const isStreamLoading = superMagicStore.isTopicStreaming(currentTopicKey)

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
		useEffect(() => {
			canAnimateNewMessagesRef.current = true
		}, [currentTopicKey])

		useEffect(() => {
			renderedMessageKeysRef.current = new Set(messageKeys)
		}, [messageKeys])

		const isLastMessageError = useMemo(() => {
			const lastNode = mainDisplayData?.[mainDisplayData?.length - 1]
			const n = superMagicStore.getMessageNode(lastNode?.super_message_id) as
				{ status?: TaskStatus } | undefined
			return n?.status === TaskStatus.ERROR
		}, [mainDisplayData])

		const revokedDisplayMessages = useMemo<Array<SuperMagicMessageItem>>(
			() =>
				messagesConverter(
					revokedBranchData,
					false,
					projectionCachesRef.current.revoked,
					projectionVersion,
				) as Array<SuperMagicMessageItem>,
			[projectionVersion, revokedBranchData],
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
		const firstRevokedUserMessageKey = firstRevokedUserMessage
			? getMessageNodeKey(firstRevokedUserMessage) ||
				`${firstRevokedUserMessage?.role || "message"}-${firstRevokedUserMessageIndex}`
			: null

		const revokedVirtualProjection = useMemo(
			() => buildVirtualMessageProjection(revokedDisplayMessages),
			[revokedDisplayMessages],
		)
		const { items: virtualMessageItems, userIndices } = useMemo(
			() =>
				composeVirtualMessageItems({
					normalItems: normalVirtualMessageItems,
					revokedItems: revokedVirtualProjection.items,
					firstRevokedUserKey: firstRevokedUserMessageKey,
					includeRevoked: revokedDisplayMessages.length > 0 && !forceHideRevokedMessages,
					showOnlyFirstRevoked: isFirstRevokedUserMessagePendingSend,
					revokedPreviewExpanded: isRevokedMessagesExpanded,
					collapsedPreviewLimit: REVOKED_COLLAPSED_ITEM_LIMIT,
				}),
			[
				firstRevokedUserMessageKey,
				forceHideRevokedMessages,
				isFirstRevokedUserMessagePendingSend,
				isRevokedMessagesExpanded,
				normalVirtualMessageItems,
				revokedDisplayMessages.length,
				revokedVirtualProjection.items,
			],
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

		const effectiveVisibleMessages = useMemo(() => {
			if (forceHideRevokedMessages) return messages
			if (!isFirstRevokedUserMessagePendingSend) {
				return [...messages, ...revokedDisplayMessages]
			}
			return firstRevokedUserMessage ? [...messages, firstRevokedUserMessage] : messages
		}, [
			firstRevokedUserMessage,
			forceHideRevokedMessages,
			isFirstRevokedUserMessagePendingSend,
			messages,
			revokedDisplayMessages,
		])
		const activeStreamSuperMessageIds =
			superMagicStore.getActiveStreamSuperMessageIds(currentTopicKey)
		// 活跃 StreamState 和占位消息行都不代表用户已经看到流式进度；
		// projected node 尚未形成可见内容时需要保留底部兜底 Loading。
		const shouldShowBottomLoading =
			currentTopicStatus !== TaskStatus.WAITING_FOR_USER &&
			resolveBottomLoadingVisibility({
				showLoading: Boolean(showLoading),
				activeStreamSuperMessageIds,
				visibleMessages: effectiveVisibleMessages,
				resolveMessageNode: (superMessageId) =>
					superMagicStore.getMessageNode(superMessageId) as
						| {
								reasoning_content?: unknown
								content?: unknown
								tool_calls?: unknown
						  }
						| undefined,
				resolveStreamStage: (superMessageId) =>
					superMagicStore.getStreamState(currentTopicKey, superMessageId)?.stage,
			})
		const showAiGeneratedTip =
			!shouldShowBottomLoading &&
			((mainDisplayData.length > 0 && currentTopicStatus !== TaskStatus.RUNNING) ||
				isLastMessageError)

		const {
			scrollRef: fadeScrollRef,
			showTopMask,
			showBottomMask,
		} = useScrollEdgeFadeMask({
			contentDeps: [
				data.length,
				isStreamLoading,
				shouldShowBottomLoading,
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

		const getScrollElement = useCallback(() => nodesPanelRef.current, [])
		const { showBackToLatest, scrollToBottom, notifyPullMoreStarted, onVirtualizerChange } =
			useVirtualMessageScroll({
				containerRef: nodesPanelRef,
				virtualizerRef,
				items: virtualMessageItems,
				topicKey: currentTopicKey,
				onPullMore: () => {
					handlePullMoreMessage?.(selectedTopic, notifyPullMoreStarted)
				},
			})

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
				resolveNode: (superMessageId) => superMagicStore.getMessageNode(superMessageId),
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
				// The server action is the only explicit authorization for revoked -> read;
				// the following HTTP refresh consumes this one-shot Store permission.
				if (selectedTopic.chat_topic_id) {
					superMagicStore.authorizeImStatusRestore(selectedTopic.chat_topic_id)
				}
				if (selectedTopic.chat_topic_id) {
					optimisticMessageStore.clearActiveRevokedAnchor(selectedTopic.chat_topic_id)
					optimisticMessageStore.clearHiddenRevokedOptimisticMessageIds(
						selectedTopic.chat_topic_id,
					)
				}
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

		const renderVirtualMessageContent = (item: VirtualMessageItem): ReactNode => {
			const previousNode =
				item.sourceIndex > 0
					? item.renderMode === "message"
						? messages[item.sourceIndex - 1]
						: revokedDisplayMessages[item.sourceIndex - 1]
					: undefined

			if (item.renderMode === "revoked-editable") {
				const fallbackContent = (
					<MessageRenderContent
						render={() =>
							renderNodeContent(item.node, item.sourceIndex, {
								disableEntryAnimation: true,
								previousNode,
							})
						}
					/>
				)

				if (!enableRevokedUserMessageReedit || isMobile) return fallbackContent
				return (
					<RevokedEditableUserMessage
						node={item.node}
						selectedTopic={selectedTopic}
						showLoading={showLoading}
						messagesLength={visibleData.length}
						hiddenOptimisticMessageIds={hiddenRevokedOptimisticMessageIds}
						onFileClick={onFileClick}
						topicModelStore={topicModelStore}
						editorContext={revokedEditorContext}
						onPendingSendChange={setIsFirstRevokedUserMessagePendingSend}
						fallbackContent={fallbackContent}
					/>
				)
			}

			const content = renderNodeContent(item.node, item.sourceIndex, {
				disableEntryAnimation: item.renderMode === "revoked-preview",
				previousNode,
			})
			if (item.renderMode === "message") return content

			return (
				<div
					className={cn(
						"relative w-full overflow-hidden rounded-lg px-4 py-1",
						"after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:bg-white/50 after:content-[''] dark:after:bg-black/30",
					)}
				>
					<MessageRenderContent render={() => content} />
				</div>
			)
		}

		return (
			<MessageListProvider value={augmentedMessageListContext}>
				<MessageViewStateProvider topicKey={currentTopicKey}>
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
								"[&>[data-slot='scroll-area-viewport']>div]:!block",
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
									<VirtualMessageList
										topicId={currentTopicKey}
										items={virtualMessageItems}
										userIndices={userIndices}
										isMobile={isMobile}
										getScrollElement={getScrollElement}
										stickyMessageClassName={stickyMessageClassName}
										renderNode={({ item }) => renderVirtualMessageContent(item)}
										exportMode={enableExport && exportStore.exportMode}
										selectedKeys={exportStore.selectedKeys}
										onToggleSelect={handleToggleSelect}
										limitReached={exportLimitReached}
										virtualizerRef={virtualizerRef}
										onVirtualizerChange={onVirtualizerChange}
									/>
									{revokedDisplayMessages.length > 0 &&
									!forceHideRevokedMessages &&
									!isFirstRevokedUserMessagePendingSend ? (
										<div
											data-testid="revoked-message-actions"
											className={cn(
												"relative z-10 flex items-start gap-1 rounded-lg bg-sidebar px-4 pb-2.5 pt-2.5",
												maskedRevokedMessages.length > 0 &&
													!isRevokedMessagesExpanded &&
													"-mt-20 bg-[linear-gradient(to_bottom,transparent_0%,rgb(var(--sidebar-rgb))_72%)] pt-20",
											)}
										>
											<IconArrowBackUp size={22} />
											<div className="flex flex-col gap-2.5">
												<div className="text-sm leading-5 text-foreground">
													{t("warningCard.undoMessageContentTip")}
												</div>
												<div className="flex gap-2.5">
													{maskedRevokedMessages.length > 0 ? (
														<Button
															className={revokedActionButton}
															onClick={handleRevokedMessagesExpanded}
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
																<IconChevronsDown size={16} />
															)}
														</Button>
													) : null}
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
										</div>
									) : null}
								</>
							) : (
								<Empty />
							)}
							{shouldShowBottomLoading && (
								<LoadingMessage
									messages={visibleData}
									showLoading={shouldShowBottomLoading}
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
				</MessageViewStateProvider>
			</MessageListProvider>
		)
	},
)

export default function MessageListEntry(props: MessageListProps) {
	// Initial Topic hydration is the visibility barrier for locally received stream overlays.
	// Keep the existing canonical data intact, but do not flash a provisional card before the
	// authoritative User baseline has established the list order.
	if (props.isMessagesLoading) {
		return (
			<div className={cn("flex h-full w-full items-center justify-center", props.className)}>
				<Spinner size={16} className="animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (props.data.length === 0) {
		return props.fallbackRender || <MessageListFallback className={props.className} />
	}

	return <MessageList {...props} />
}
