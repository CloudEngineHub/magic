import { forwardRef, useImperativeHandle, useMemo } from "react"
import type { JSONContent } from "@/infrastructure/editors/tiptap/react"
import { useMemoizedFn } from "ahooks"
import { isEmpty } from "lodash-es"
import { observer } from "mobx-react-lite"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import MessageList, { MessageListProvider } from "@/pages/superMagic/components/MessageList"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import MobileInputContainer from "@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import type { SendMessageOptions } from "@/pages/superMagic/components/MessagePanel/types"
import type { MessageListContextState } from "@/pages/superMagic/components/MessageList/context"
import { useInterruptAndUndoMessage } from "@/pages/superMagic/hooks/useInterruptAndUndoMessage"
import { useTopicConversationLoading } from "@/pages/superMagic/hooks/useTopicConversationLoading"
import { useTopicMessages } from "@/pages/superMagic/hooks/useTopicMessages"
import { createMessageSendService } from "@/pages/superMagic/services/messageSendFlowService"
import { resolveMessageSendContext } from "@/pages/superMagic/services/messageSendPreparation"
import type { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import { filterPanelMessageWithoutRevoked } from "@/pages/superMagic/utils/handleMessage"
import { userStore } from "@/models/user"
import { usePersonaResearchStore } from "../context"
import { useResearchEditor } from "../hooks/useResearchEditor"

export interface ResearchConversationPanelRef {
	/** Replaces the composer text and focuses it, e.g. "ask this persona". */
	fillComposer: (text: string) => void
}

interface ResearchConversationPanelProps {
	variant: "desktop" | "mobile"
	onFileClick?: (fileItem?: unknown) => void
	/** Tool-result details (search results, browser steps) clicked in the message list. */
	onSelectDetail?: (detail?: unknown) => void
	/** Latest tool step of the conversation, shown live by the preview's playback tab. */
	onAutoDetailChange?: (detail: unknown) => void
}

/** Conversation of the selected study: reused message list, ask_user cards and composer. */
const ResearchConversationPanel = forwardRef<
	ResearchConversationPanelRef,
	ResearchConversationPanelProps
>(function ResearchConversationPanel(
	{ variant, onFileClick, onSelectDetail, onAutoDetailChange },
	ref,
) {
	const store = usePersonaResearchStore()
	const selectedTopic = store.selectedTopic
	const isMobile = variant === "mobile"

	/** Same selection as the topic page: the last non-revoked tool step that opens in the preview. */
	const reportLatestToolDetail = useMemoizedFn((topicMessages: SuperMagicMessageItem[]) => {
		if (!onAutoDetailChange) return
		const lastDetailMessage = topicMessages.findLast((message) =>
			filterPanelMessageWithoutRevoked(
				superMagicStore.getMessageNode(message?.super_message_id),
				message,
			),
		)
		const tool = (
			superMagicStore.getMessageNode(lastDetailMessage?.super_message_id) as
				| { tool?: { detail?: Record<string, unknown>; id?: string; name?: string } }
				| undefined
		)?.tool
		// The panel filter only passes tools with a preview detail; keep the last one otherwise.
		if (!tool?.detail || isEmpty(tool.detail)) return
		onAutoDetailChange({ ...tool.detail, id: tool.id, name: tool.name })
	})

	const messageSendService = useMemo(
		() => createMessageSendService({ mentionPanelStore: store.mentionPanelStore }),
		[store.mentionPanelStore],
	)

	const { messages, showLoading } = useTopicConversationLoading<TaskStatus>({
		selectedTopic,
		onConversationGeneratingChange: store.setConversationGenerating,
		onTopicMessagesChange: ({
			lastMessageNode,
			selectedTopic: currentTopic,
			topicMessages,
		}) => {
			if (currentTopic?.id && lastMessageNode?.status) {
				store.updateTopicStatus(currentTopic.id, lastMessageNode.status)
			}
			reportLatestToolDetail(topicMessages)
		},
	})

	const { handlePullMoreMessage, isMessagesInitialLoading } = useTopicMessages({
		selectedTopic,
	})

	const { editorContext, editorNodes, topicModelStore, fillComposer } = useResearchEditor({
		variant,
		selectedTopic,
		showLoading,
		messagesLength: messages.length,
		isMessagesInitialLoading,
		size: isMobile ? "mobile" : "small",
		onFileClick,
	})

	useImperativeHandle(ref, () => ({ fillComposer }), [fillComposer])

	// ask_user answers and message re-sends from the list go through the same send flow.
	const handleSendMsg = useMemoizedFn(
		(content: JSONContent | string, options?: SendMessageOptions) => {
			messageSendService.sendContent({
				content,
				options,
				showLoading: messages.length > 1 && showLoading,
				context: resolveMessageSendContext({
					selectedProject: store.selectedProject,
					selectedTopic,
					selectedWorkspace: store.selectedWorkspace,
					setSelectedProject: store.setSelectedProject,
					setSelectedTopic: store.topicStore.setSelectedTopic,
					setSelectedWorkspace: store.setSelectedWorkspace,
					topicStore: store.topicStore,
				}),
			})
			pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom, { time: 1000 })
		},
	)

	useInterruptAndUndoMessage({
		selectedTopic,
		messages,
		userInfo: userStore.user.userInfo,
	})

	const messageListProviderValue = useMemo<MessageListContextState>(
		() => ({
			allowRevoke: true,
			allowUserMessageCopy: true,
			allowMessageTooltip: true,
			allowConversationCopy: true,
			// A new study starts from the research home, not from inside the conversation.
			allowCreateNewTopic: false,
			onTopicSwitch: store.setSelectedTopic,
			projectFilesStore: store.projectFilesStore,
		}),
		[store.projectFilesStore, store.setSelectedTopic],
	)

	if (!selectedTopic) return null

	return (
		<div
			className="flex h-full min-h-0 w-full flex-col"
			data-testid="persona-research-conversation"
		>
			<MessageListProvider value={messageListProviderValue}>
				<MessageList
					className="[--message-list-surface:rgb(var(--background-rgb))]"
					classNames={{ content: "pl-2 pt-[10px]" }}
					data={messages as SuperMagicMessageItem[]}
					setSelectedDetail={onSelectDetail ?? onFileClick}
					selectedTopic={selectedTopic}
					handlePullMoreMessage={handlePullMoreMessage}
					showLoading={showLoading}
					currentTopicStatus={selectedTopic.task_status}
					handleSendMsg={handleSendMsg}
					onFileClick={onFileClick}
					isMessagesLoading={isMessagesInitialLoading}
					enableRevokedUserMessageReedit
					topicModelStore={topicModelStore}
				/>
			</MessageListProvider>
			<div className="w-full shrink-0 px-3 pb-3">
				{isMobile ? (
					<MobileInputContainer editorContext={editorContext} editorNodes={editorNodes} />
				) : (
					<DefaultMessageEditorContainer
						editorContext={editorContext}
						editorNodes={editorNodes}
					/>
				)}
			</div>
		</div>
	)
})

export default observer(ResearchConversationPanel)
