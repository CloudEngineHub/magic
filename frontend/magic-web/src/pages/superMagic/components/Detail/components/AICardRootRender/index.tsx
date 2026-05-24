import { useCallback, useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import MagicSpin from "@/components/base/MagicSpin"
import { Flex } from "antd"
import { message } from "antd"
import { ScheduledTaskApi } from "@/apis"
import AICardConfigPanel from "./components/AICardConfigPanel"
import AICardDashboard from "./components/AICardDashboard"
import AICardDetail from "./components/AICardDetail"
import { AICardStore } from "./stores/AICardStore"
import type { AICardHistoryEntry, AICardRootRenderProps } from "./types"
import {
	extractChatTopicIdFromExecuteResult,
	switchToTopicByChatTopicId,
} from "./utils/aiCardRunNow"

/**
 * AICardRootRender
 *
 * Entry component for AI Card display. Manages a local AICardStore that
 * parses the card directory structure (magic.project.js)
 * and renders either a dashboard grid, a card detail view, or history view.
 *
 * Animations are powered by framer-motion with layoutId transitions
 * between dashboard tiles and the detail view.
 */
function AICardRootRender(props: AICardRootRenderProps) {
	const { data, attachments, attachmentList, className } = props
	const { t } = useTranslation("super")

	const folderFileId = data?.file_id
	const initialNavigation = data?.initialNavigation

	// Stabilize attachment list reference
	const stableAttachmentList = attachmentList || attachments

	// Create store instance per mount
	const [store] = useState(() => new AICardStore())
	const [isRunNowLoading, setIsRunNowLoading] = useState(false)

	// Track whether initialNavigation has been applied
	const appliedNavigationRef = useRef(false)

	// Sync store with attachment data
	useEffect(() => {
		store.sync(folderFileId, stableAttachmentList)
	}, [store, folderFileId, stableAttachmentList])

	// Apply initialNavigation or auto-show config after loading completes
	useEffect(() => {
		if (store.loading || appliedNavigationRef.current) return
		appliedNavigationRef.current = true

		// If no config exists, force config panel
		if (!store.hasConfig) {
			store.setViewMode("config")
			return
		}

		if (initialNavigation?.activeCardId) {
			store.openCardDetail(initialNavigation.activeCardId)
		}
	}, [store, store.loading, initialNavigation])

	const handleOpenConfig = useCallback(() => {
		store.setViewMode("config")
	}, [store])

	const handleOpenCard = useCallback(
		(cardId: string) => {
			store.openCardDetail(cardId)
		},
		[store],
	)

	const handleBack = useCallback(() => {
		store.goBack()
	}, [store])

	const handleRunNow = useCallback(async () => {
		const scheduleId = store.projectConfig?.schedule_id
		if (!scheduleId || isRunNowLoading) return

		setIsRunNowLoading(true)
		try {
			const response = await ScheduledTaskApi.executeScheduledTask(scheduleId)
			if (!response?.success) {
				message.error(response?.error_message || t("detail.aiCard.runNow.error"))
				return
			}

			const chatTopicId = extractChatTopicIdFromExecuteResult(response)
			if (chatTopicId) {
				const switched = await switchToTopicByChatTopicId(chatTopicId)
				if (switched) {
					message.success(t("detail.aiCard.runNow.successSwitched"))
					return
				}
			}

			message.success(t("detail.aiCard.runNow.success"))
		} catch {
			message.error(t("detail.aiCard.runNow.error"))
		} finally {
			setIsRunNowLoading(false)
		}
	}, [store, isRunNowLoading])

	const handleOpenHistoryEntry = useCallback(
		(entry: AICardHistoryEntry) => {
			store.openHistoryDetail(entry.fileId)
		},
		[store],
	)

	if (store.loading) {
		return (
			<Flex
				justify="center"
				align="center"
				className={cn("h-full w-full bg-background", className)}
			>
				<MagicSpin spinning />
			</Flex>
		)
	}

	return (
		<div
			className={cn("h-full w-full overflow-hidden bg-background", className)}
			data-testid="ai-card-root"
		>
			<AnimatePresence mode="wait">
				{store.viewMode === "config" && (
					<AICardConfigPanel
						key="config"
						store={store}
						onBack={store.hasConfig ? handleBack : undefined}
					/>
				)}
				{store.viewMode === "dashboard" && (
					<AICardDashboard
						key="dashboard"
						cards={store.cards}
						historyEntries={store.historyEntries}
						attachmentList={stableAttachmentList}
						onOpenCard={handleOpenCard}
						onOpenConfig={handleOpenConfig}
						onRunNow={store.projectConfig?.schedule_id ? handleRunNow : undefined}
						isRunNowLoading={isRunNowLoading}
						onOpenHistoryEntry={handleOpenHistoryEntry}
					/>
				)}
				{store.viewMode === "detail" && store.activeCard && (
					<AICardDetail
						key="detail"
						card={store.activeCard}
						htmlFileId={store.detailFileId}
						attachmentList={stableAttachmentList}
						onBack={handleBack}
					/>
				)}
			</AnimatePresence>
		</div>
	)
}

export default observer(AICardRootRender)
