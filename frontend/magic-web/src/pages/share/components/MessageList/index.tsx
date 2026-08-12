import { Node } from "@/pages/superMagic/components/MessageList/components/Nodes"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { memo, type RefObject, useCallback, useMemo } from "react"
import { useStyles } from "./style"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import {
	messagesConverter,
	createCheckIsLastMessage,
} from "@/pages/superMagic/components/MessageList/helpers"
import { MessageListProvider } from "@/pages/superMagic/components/MessageList/context"
import { useIsMobile } from "@/hooks/useIsMobile"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import { buildVirtualMessageProjection } from "@/pages/superMagic/components/MessageList/virtual-message-items"
import { VirtualMessageList } from "@/pages/superMagic/components/MessageList/components/VirtualMessageList"
import { MessageViewStateProvider } from "@/pages/superMagic/components/MessageList/view-state/MessageViewStateContext"

function MessageList({
	topicId,
	messageList,
	onSelectDetail,
	currentTopicStatus,
	stickyMessageClassName,
	projectFilesStore,
	scrollContainerRef,
}: {
	topicId: string
	messageList: any[]
	onSelectDetail: (detail: any) => void
	currentTopicStatus: TaskStatus
	/**
	 * Sticky user-turn mask. Default uses sidebar rgb. Override via:
	 * `[--sticky-message-mask-bg:rgb(var(--background-rgb))]
	 *  [--sticky-message-mask-fade-from:rgb(var(--background-rgb))]`
	 */
	stickyMessageClassName?: string
	projectFilesStore?: ProjectFilesStore
	/** Scroll owner supplied by the share shell; virtualization does not create a nested viewport. */
	scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
	const { styles } = useStyles()
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()

	const messages = messageList

	const convertedMessages = useMemo(
		() => messagesConverter(messages) as Array<SuperMagicMessageItem>,
		[messages],
	)

	const virtualProjection = useMemo(
		() => buildVirtualMessageProjection(convertedMessages),
		[convertedMessages],
	)

	const checkIsLastMessage = useMemoizedFn(createCheckIsLastMessage(convertedMessages))

	const value = useMemo(() => {
		return {
			allowRevoke: false,
			projectFilesStore,
		}
	}, [projectFilesStore])
	const getScrollElement = useCallback(() => scrollContainerRef.current, [scrollContainerRef])

	return (
		<MessageListProvider value={value}>
			<MessageViewStateProvider topicKey={topicId}>
				<div className="relative flex flex-col gap-2">
					{/* Topic shares keep mobile positioning while reusing the desktop sticky mask. */}
					<VirtualMessageList
						items={virtualProjection.items}
						userIndices={virtualProjection.userIndices}
						isMobile={isMobile}
						useMobileStickyOverlay={false}
						getScrollElement={getScrollElement}
						stickyMessageClassName={stickyMessageClassName}
						renderNode={({ item }) => {
							const index = item.sourceIndex
							const node = item.node
							return (
								<Node
									node={node}
									onSelectDetail={onSelectDetail}
									isSelected
									currentTopicStatus={TaskStatus.FINISHED}
									role={node?.role || "user"}
									isFirst={
										convertedMessages?.[index - 1]?.role === "user" &&
										convertedMessages?.[index]?.role === "assistant"
									}
									checkIsLastMessage={checkIsLastMessage}
									selectedTopic={null}
									isShare={true}
								/>
							)
						}}
					/>
					{messageList.length > 0 && currentTopicStatus !== TaskStatus.RUNNING && (
						<div className={styles.aiGeneratedTip}>{t("ui.aiGeneratedTip")}</div>
					)}
				</div>
			</MessageViewStateProvider>
		</MessageListProvider>
	)
}

export default memo(MessageList)
