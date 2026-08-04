import type { ComponentProps } from "react"
import { PanelRightOpen } from "lucide-react"

import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import { TOPIC_HISTORY_PANEL_WIDTH } from "@/pages/superMagic/constants/resizablePanel"
import TopicResizeHandle from "@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle"

import AppConversationPanel from "./AppConversationPanel"
import MicroAppPanelToggleButton from "./MicroAppPanelToggleButton"
import * as layout from "../layoutConstants"

interface MicroAppDesktopConversationPanelsProps {
	selectedProject: ComponentProps<typeof AppConversationPanel>["selectedProject"]
	topicStore: ComponentProps<typeof AppConversationPanel>["topicStore"]
	mentionPanelStore: ComponentProps<typeof AppConversationPanel>["mentionPanelStore"]
	projectFilesStore: ComponentProps<typeof AppConversationPanel>["projectFilesStore"]
	topicActions: ComponentProps<typeof MessageHeaderTopicHistoryPanel>["topicActions"]
	isMessagePanelCollapsed: boolean
	isMessagePanelDragging: boolean
	messagePanelWidthPx: number
	isTopicHistoryPanelOpen: boolean
	onMessagePanelResizeStart: ComponentProps<typeof TopicResizeHandle>["onResizeStart"]
	onTerminalTopicStatusChange: () => void
	onToggleConversationPanel: () => void
	onExpandConversationPanel: () => void
	onToggleHistoryPanel: () => void
	onCloseHistoryPanel: () => void
	onSelectDetail: (detail: unknown) => void
	onExpandCollapsedPanel: () => void
	showConversationLabel: string
}

export default function MicroAppDesktopConversationPanels({
	selectedProject,
	topicStore,
	mentionPanelStore,
	projectFilesStore,
	topicActions,
	isMessagePanelCollapsed,
	isMessagePanelDragging,
	messagePanelWidthPx,
	isTopicHistoryPanelOpen,
	onMessagePanelResizeStart,
	onTerminalTopicStatusChange,
	onToggleConversationPanel,
	onExpandConversationPanel,
	onToggleHistoryPanel,
	onCloseHistoryPanel,
	onSelectDetail,
	onExpandCollapsedPanel,
	showConversationLabel,
}: MicroAppDesktopConversationPanelsProps) {
	return (
		<>
			{!isMessagePanelCollapsed ? (
				<>
					<TopicResizeHandle
						onResizeStart={onMessagePanelResizeStart}
						className={isMessagePanelDragging ? "before:opacity-100" : undefined}
					/>
					<aside
						className="h-full shrink-0 overflow-hidden border-l border-border bg-background"
						style={{ width: messagePanelWidthPx }}
						data-testid="micro-app-conversation-panel"
					>
						<AppConversationPanel
							selectedProject={selectedProject}
							topicStore={topicStore}
							mentionPanelStore={mentionPanelStore}
							projectFilesStore={projectFilesStore}
							onTerminalTopicStatusChange={onTerminalTopicStatusChange}
							detailPanelVisible
							isConversationPanelCollapsed={isMessagePanelCollapsed}
							onToggleConversationPanel={onToggleConversationPanel}
							onExpandConversationPanel={onExpandConversationPanel}
							historyTriggerMode="layout"
							isHistoryPanelOpen={isTopicHistoryPanelOpen}
							onToggleHistoryPanel={onToggleHistoryPanel}
							onSelectDetail={onSelectDetail}
						/>
					</aside>
				</>
			) : null}
			{isTopicHistoryPanelOpen && !isMessagePanelCollapsed ? (
				<aside
					className="h-full min-w-0 shrink-0 overflow-hidden border-l border-border bg-background"
					style={{ width: TOPIC_HISTORY_PANEL_WIDTH }}
					data-testid="micro-app-topic-history-panel"
				>
					<MessageHeaderTopicHistoryPanel
						selectedProject={selectedProject}
						topicStore={topicStore}
						topicActions={topicActions}
						isConversationPanelCollapsed={isMessagePanelCollapsed}
						onExpandConversationPanel={onExpandConversationPanel}
						onClose={onCloseHistoryPanel}
					/>
				</aside>
			) : null}
			{isMessagePanelCollapsed ? (
				<aside
					className="flex h-full shrink-0 justify-center border-l border-border bg-background py-2"
					style={{ width: layout.COLLAPSED_RAIL_WIDTH_PX }}
					data-testid="micro-app-conversation-rail"
				>
					<MicroAppPanelToggleButton
						icon={<PanelRightOpen size={16} />}
						label={showConversationLabel}
						testId="micro-app-conversation-expand"
						side="left"
						onClick={onExpandCollapsedPanel}
					/>
				</aside>
			) : null}
		</>
	)
}
