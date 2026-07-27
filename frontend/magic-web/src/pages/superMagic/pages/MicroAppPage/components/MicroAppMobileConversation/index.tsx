import { useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { useMemoizedFn } from "ahooks"
import { ChevronDown, MessageCircle, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SuperMagicApi } from "@/apis"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Button } from "@/components/shadcn-ui/button"
import MessageList, { MessageListProvider } from "@/pages/superMagic/components/MessageList"
import type { MessageListContextState } from "@/pages/superMagic/components/MessageList/context"
import ProjectPageInputContainer from "@/pages/superMagic/components/ProjectPageInputContainer"
import { MicroAppConversationEmptyIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useInterruptAndUndoMessage } from "@/pages/superMagic/hooks/useInterruptAndUndoMessage"
import { useRefreshTopicDetailOnTaskComplete } from "@/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete"
import { useScopedTopicReadProgress } from "@/pages/superMagic/hooks/useScopedTopicReadProgress"
import { useTopicConversationLoading } from "@/pages/superMagic/hooks/useTopicConversationLoading"
import { useTopicMessages } from "@/pages/superMagic/hooks/useTopicMessages"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { applyOptimisticTopicRunningState } from "@/pages/superMagic/services/topicStatusSyncService"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { userStore } from "@/models/user"
import type { MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import type { ProjectFilesStore } from "@/stores/projectFiles"

import MicroAppTopicPicker from "./MicroAppTopicPicker"
import MicroAppIssuePromptPanel from "../MicroAppIssuePromptPanel"
import { resolveMicroAppModelSelectionMode } from "../../utils/microAppModelMode"

interface MicroAppMobileConversationProps {
	open: boolean
	selectedProject: ProjectListItem | null
	topicStore: TopicStore
	mentionPanelStore: MentionPanelStore
	projectFilesStore: ProjectFilesStore
	attachments: AttachmentItem[]
	onOpenFile: (file?: unknown) => void
	onOpenChange: (open: boolean) => void
	onTerminalTopicStatusChange?: () => void
}

function MobileConversationEmpty() {
	const { t } = useTranslation("super")
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
			<MicroAppConversationEmptyIllustration
				size="sm"
				className="w-[136px]"
				testId="micro-app-mobile-conversation-empty-illustration"
			/>
			<div className="space-y-1">
				<p className="text-base font-medium text-foreground">
					{t("microAppPage.conversation.emptyTitle")}
				</p>
				<p className="text-sm text-muted-foreground">
					{t("microAppPage.conversation.emptyDescription")}
				</p>
			</div>
		</div>
	)
}

/**
 * 微应用移动端独立对话弹层：沿用共享 MessageList 的默认消息节点样式，
 * 仅使用移动端弹层和 MobileComposer 组织交互。
 */
const MicroAppMobileConversation = observer(function MicroAppMobileConversation({
	open,
	selectedProject,
	topicStore,
	mentionPanelStore,
	projectFilesStore,
	attachments,
	onOpenFile,
	onOpenChange,
	onTerminalTopicStatusChange,
}: MicroAppMobileConversationProps) {
	const { t } = useTranslation("super")
	const [topicPickerOpen, setTopicPickerOpen] = useState(false)
	const selectedTopic = topicStore.selectedTopic
	const modelTopicMode = resolveMicroAppModelSelectionMode()

	useRefreshTopicDetailOnTaskComplete({
		selectedTopic,
		onTopicDetailLoaded: topicStore.updateTopic,
	})

	const { handlePullMoreMessage, isMessagesInitialLoading, isSelectedTopicMessagesReady } =
		useTopicMessages({ selectedTopic })
	const { handleTopicMessagesChange } = useScopedTopicReadProgress({
		scopeName: "MicroAppMobileConversation",
		topicStore,
		selectedTopic,
		isSelectedTopicMessagesReady,
		onTerminalTopicStatusChange,
	})
	const { messages, showLoading } = useTopicConversationLoading({
		selectedTopic,
		hideLoadingWhenBufferHasContent: true,
		onTopicMessagesChange: handleTopicMessagesChange,
	})

	useInterruptAndUndoMessage({
		selectedTopic,
		messages,
		userInfo: userStore.user.userInfo,
	})

	const messageListContext = useMemo<MessageListContextState>(
		() => ({
			allowRevoke: true,
			allowUserMessageCopy: false,
			allowScheduleTaskCreate: false,
			allowMessageTooltip: false,
			allowConversationCopy: false,
			allowCreateNewTopic: false,
			onTopicSwitch: topicStore.setSelectedTopic,
			projectFilesStore,
			showTaskCompletedBadge: false,
		}),
		[projectFilesStore, topicStore.setSelectedTopic],
	)

	const handleSelectTopic = useMemoizedFn(async (topic: Topic) => {
		setTopicPickerOpen(false)
		topicStore.setSelectedTopic(topic)

		try {
			const topicDetail = await SuperMagicApi.getTopicDetail(
				{ id: topic.id },
				{ enableErrorMessagePrompt: false },
			)
			if (topicDetail) topicStore.updateTopic(topicDetail)
		} catch (error) {
			console.error("Failed to load micro app topic detail:", error)
		}
	})

	const handleFileClick = useMemoizedFn((file?: unknown) => {
		onOpenChange(false)
		onOpenFile(file)
	})

	const isEmpty =
		isSelectedTopicMessagesReady && !isMessagesInitialLoading && messages.length === 0
	const topicName = selectedTopic?.topic_name || t("topic.unnamedTopic")

	return (
		<>
			<MagicPopup
				visible={open}
				position="bottom"
				onClose={() => onOpenChange(false)}
				hideDefaultHandle
				title={t("microAppPage.mobileConversation.title")}
				bodyClassName="h-[88dvh] max-h-[88dvh] overflow-hidden rounded-t-[20px] border-0 bg-mobile-background p-0"
			>
				<div className="flex h-full min-h-0 flex-col">
					<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
						<button
							type="button"
							className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left active:bg-muted"
							onClick={() => setTopicPickerOpen(true)}
							data-testid="micro-app-mobile-topic-switch"
						>
							<div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
								<MessageCircle className="size-4" aria-hidden />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-foreground">
									{topicName}
								</p>
								<p className="text-xs text-muted-foreground">
									{t("microAppPage.mobileConversation.switchTopic")}
								</p>
							</div>
							<ChevronDown
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden
							/>
						</button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-9 shrink-0"
							onClick={() => onOpenChange(false)}
							aria-label={t("common.close")}
						>
							<X className="size-[18px]" aria-hidden />
						</Button>
					</header>

					<div className="min-h-0 flex-1 overflow-hidden">
						<MessageListProvider value={messageListContext}>
							<MessageList
								data={messages}
								selectedTopic={selectedTopic}
								setSelectedDetail={handleFileClick}
								handlePullMoreMessage={handlePullMoreMessage}
								showLoading={showLoading}
								onFileClick={handleFileClick}
								isEmptyStatus={isEmpty}
								isMessagesLoading={isMessagesInitialLoading}
								fallbackRender={<MobileConversationEmpty />}
								className="bg-mobile-background"
							/>
						</MessageListProvider>
					</div>

					<div className="shrink-0 border-t border-border bg-mobile-background pb-[var(--safe-area-inset-bottom)] pt-2">
						<div className="flex px-3 pb-1">
							<MicroAppIssuePromptPanel variant="mobile" />
						</div>
						<ProjectPageInputContainer
							messages={messages}
							showLoading={showLoading}
							selectedProject={selectedProject}
							selectedTopic={selectedTopic}
							setSelectedTopic={topicStore.setSelectedTopic}
							modelTopicMode={modelTopicMode}
							attachments={attachments}
							mentionPanelStore={mentionPanelStore}
							onFileClick={handleFileClick}
							isShowLoadingInit={!isSelectedTopicMessagesReady}
							showTopicModeExamplePortal={false}
							showModeToggle={false}
							showModelSelector
							onSendComplete={({ success, currentProject, currentTopic }) => {
								if (!success) return
								applyOptimisticTopicRunningState({
									topicStore,
									topic: currentTopic ?? topicStore.selectedTopic,
									project: currentProject ?? selectedProject,
								})
							}}
						/>
					</div>
				</div>
			</MagicPopup>

			<MicroAppTopicPicker
				open={topicPickerOpen}
				topics={topicStore.topics}
				selectedTopicId={selectedTopic?.id}
				onSelect={handleSelectTopic}
				onClose={() => setTopicPickerOpen(false)}
			/>
		</>
	)
})

export default MicroAppMobileConversation
