import { useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { merge } from "lodash-es"
import { useTranslation } from "react-i18next"
import MessageQueue from "@/pages/superMagic/components/MessagePanel/components/MessageQueue"
import useMessageQueue from "@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue"
import useTopicModel from "@/pages/superMagic/components/MessageEditor/hooks/useTopicModel"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import { DEFAULT_LAYOUT_CONFIG } from "@/pages/superMagic/components/MessageEditor/constants/constant"
import { MOBILE_LAYOUT_CONFIG } from "@/pages/superMagic/components/MainInputContainer/components/editors/constant"
import type {
	SceneEditorContext,
	SceneEditorNodes,
} from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { useTaskInterrupt } from "@/pages/superMagic/hooks/useTaskInterrupt"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import {
	isTopicTaskRunning,
	isTopicWaitingForUser,
	TaskStatus,
	type Topic,
} from "@/pages/superMagic/pages/Workspace/types"
import { userStore } from "@/models/user"
import { usePersonaResearchStore } from "../context"
import { appendParagraph } from "../services/researchOptions"
import { withResearchTopicFields } from "../store/research-store"
import { useResearchMentionCatalog } from "./useResearchMentionCatalog"

interface UseResearchEditorOptions {
	variant: "desktop" | "mobile"
	/** Null on the research home: the first send creates (or reuses) a study topic. */
	selectedTopic: Topic | null
	showLoading: boolean
	messagesLength: number
	isMessagesInitialLoading?: boolean
	size?: SceneEditorContext["size"]
	onFileClick?: (fileItem?: unknown) => void
	/** Called once the first message of a new study has been dispatched. */
	onStudyStarted?: (topic: Topic) => void
	/** Called when the editor subscriptions and draft restoration are complete. */
	onEditorReady?: () => void
	/**
	 * Text appended as the last paragraph of each sent message, read at send time; the home
	 * composer uses it for the 【研究设置】 line. Null or empty sends the message unchanged.
	 */
	appendToMessage?: () => string | null
	/** The page draws the composer frame (home); the editor drops its own border to avoid a double line. */
	bareContainer?: boolean
}

/**
 * Builds the shared composer context for research pages.
 *
 * | Concern        | Value                                                        |
 * | Send-time mode | always persona_research (agent: persona-research.agent)      |
 * | Model picker   | default-mode catalog, same fallback as micro-app topics      |
 * | Mode switching | hidden; research topics never change agent                    |
 * | New study      | home composer reuses the blank default topic or creates one  |
 */
export function useResearchEditor({
	variant,
	selectedTopic,
	showLoading,
	messagesLength,
	isMessagesInitialLoading = false,
	size,
	onFileClick,
	onStudyStarted,
	onEditorReady,
	appendToMessage,
	bareContainer = false,
}: UseResearchEditorOptions) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const isMobile = variant === "mobile"
	const selectedProject = store.selectedProject
	const [stopEventLoading, setStopEventLoading] = useState(false)

	const isTaskRunning = showLoading || isTopicTaskRunning(selectedTopic)
	const canInterruptTask =
		isTaskRunning || selectedTopic?.task_status === TaskStatus.WAITING_FOR_USER

	const messageQueue = useMessageQueue({
		projectId: selectedProject?.id,
		topicId: selectedTopic?.id,
		isTaskRunning,
		isWaitingForUser: isTopicWaitingForUser(selectedTopic),
		isEmptyStatus: !selectedTopic,
		isShowLoadingInit: isMessagesInitialLoading,
	})

	const { topicModelStore } = useTopicModel({
		selectedTopic,
		selectedProject,
		topicMode: TopicMode.Default,
		topicModelStore: store.topicModelStore,
	})

	useResearchMentionCatalog(selectedTopic)

	const { handleInterrupt } = useTaskInterrupt({
		selectedTopic: selectedTopic ?? null,
		userId: userStore.user.userInfo?.user_id,
		isStopping: stopEventLoading,
		setIsStopping: setStopEventLoading,
		canInterrupt: canInterruptTask,
	})

	const createStudyTopic = useMemoizedFn(async () => {
		const topic = await store.prepareStudyTopic()
		if (topic) store.setSelectedTopic(topic)
		return topic
	})

	const handleSendSuccess = useMemoizedFn(({ currentTopic }: { currentTopic: Topic | null }) => {
		if (!currentTopic) return
		const topic = withResearchTopicFields(currentTopic)
		store.setSelectedTopic(topic)
		onStudyStarted?.(topic)
	})

	const editorNodes = useMemo<SceneEditorNodes>(() => {
		const messageQueueNode =
			messageQueue.queue.length > 0 ? (
				<div className="mb-2">
					<MessageQueue
						queue={messageQueue.queue}
						editorRef={messageQueue.editorRef}
						queueStats={messageQueue.queueStats}
						onRemoveMessage={messageQueue.removeFromQueue}
						onSendMessage={messageQueue.sendQueuedMessage}
						onStartEdit={messageQueue.startEditQueueItem}
						onWithdraw={messageQueue.withdrawQueueItem}
						onMove={messageQueue.moveQueueItem}
						isOperationPending={messageQueue.isQueueOperationPending}
						variant={isMobile ? "mobile" : "default"}
					/>
				</div>
			) : null
		return { messageQueueNode }
	}, [messageQueue, isMobile])

	const editorContext = useMemo<SceneEditorContext>(
		() => ({
			draftKey: createMessageEditorDraftKey({ selectedProject, selectedTopic }),
			selectedTopic,
			selectedProject,
			selectedWorkspace: store.selectedWorkspace,
			creationScene: "persona_research",
			setSelectedTopic: store.setSelectedTopic,
			setSelectedProject: store.setSelectedProject,
			setSelectedWorkspace: store.setSelectedWorkspace,
			topicMode: TopicMode.PersonaResearch,
			modelTopicMode: TopicMode.Default,
			topicStore: store.topicStore,
			layoutConfig: isMobile ? MOBILE_LAYOUT_CONFIG : DEFAULT_LAYOUT_CONFIG,
			placeholder: selectedTopic
				? t("composer.followUpPlaceholder")
				: t("composer.newStudyPlaceholder"),
			showLoading,
			isTaskRunning: canInterruptTask,
			stopEventLoading,
			handleInterrupt,
			onFileClick,
			onReady: onEditorReady,
			mentionPanelStore: store.mentionPanelStore,
			projectFilesStore: store.projectFilesStore,
			topicModelStore,
			enableMessageSendByContent: true,
			showModeToggle: false,
			allowChangeMode: false,
			containerClassName: isMobile
				? undefined
				: bareContainer
					? // "!" is needed: the shared container appends its own border class after ours.
						"rounded-xl bg-background !border-0"
					: "rounded-xl border border-border bg-background",
			messagesLength,
			createTopic: createStudyTopic,
			onSendSuccess: handleSendSuccess,
			mergeSendParams: ({ defaultParams }) => {
				const params = merge({}, defaultParams, {
					topicMode: TopicMode.PersonaResearch,
					extra: { super_agent: { topic_pattern: TopicMode.PersonaResearch } },
				})
				const appended = appendToMessage?.()?.trim()
				// Assigned after merge: lodash merge would combine paragraph arrays index by index.
				if (appended) params.value = appendParagraph(defaultParams.value, appended)
				return params
			},
			editorRef: messageQueue.editorRef,
			queueContext: messageQueue,
			size: size ?? (isMobile ? "mobile" : "default"),
		}),
		[
			appendToMessage,
			bareContainer,
			canInterruptTask,
			createStudyTopic,
			handleInterrupt,
			handleSendSuccess,
			isMobile,
			messageQueue,
			messagesLength,
			onEditorReady,
			onFileClick,
			selectedProject,
			selectedTopic,
			showLoading,
			size,
			stopEventLoading,
			store.mentionPanelStore,
			store.projectFilesStore,
			store.selectedWorkspace,
			store.setSelectedProject,
			store.setSelectedTopic,
			store.setSelectedWorkspace,
			store.topicStore,
			t,
			topicModelStore,
		],
	)

	/** Replaces the composer text, e.g. from a template card or "ask this persona". */
	const fillComposer = useMemoizedFn((text: string) => {
		const editor = messageQueue.editorRef.current?.editor
		if (!editor) return
		editor.chain().focus().setContent(text).run()
	})

	return { editorContext, editorNodes, topicModelStore, fillComposer, messageQueue }
}
