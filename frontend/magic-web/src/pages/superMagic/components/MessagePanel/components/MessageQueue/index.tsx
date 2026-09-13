import { useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { IconChevronUp, IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/utils/cn"
import type { MessageEditorRef } from "../../../MessageEditor/types"
import type { QueuedMessage } from "../../hooks/useMessageQueue"
import MobileMessageQueue from "./MobileMessageQueue"
import MessageQueueItems from "./MessageQueueItems"

export interface MessageQueueProps {
	editorRef?: RefObject<MessageEditorRef | null>
	queue: QueuedMessage[]
	queueStats: {
		total: number
		pending: number
		processing: number
		failed: number
	}
	onRemoveMessage: (messageId: string) => void
	onSendMessage: (messageId: string) => void
	onStartEdit: (messageId: string) => void
	onWithdraw: (messageId: string) => void
	onMove: (messageId: string, beforeId: string | null, afterId: string | null) => Promise<void>
	isOperationPending?: boolean
	className?: string
	variant?: "default" | "mobile"
}

/** Route queue rendering to the mobile prototype card only when callers opt in. */
function MessageQueue({
	queue,
	queueStats,
	onRemoveMessage,
	onSendMessage,
	onStartEdit,
	onWithdraw,
	onMove,
	editorRef,
	isOperationPending,
	className,
	variant = "default",
}: MessageQueueProps) {
	const { t } = useTranslation("super")
	const [isExpanded, setIsExpanded] = useState(true)

	if (queue.length === 0) {
		return null
	}

	if (variant === "mobile") {
		return (
			<MobileMessageQueue
				queue={queue}
				queueStats={queueStats}
				onRemoveMessage={onRemoveMessage}
				onSendMessage={onSendMessage}
				onStartEdit={onStartEdit}
				onWithdraw={onWithdraw}
				onMove={onMove}
				editorRef={editorRef}
				isOperationPending={isOperationPending}
				className={className}
				variant={variant}
			/>
		)
	}

	const handleToggleExpanded = () => {
		setIsExpanded(!isExpanded)
	}

	return (
		<div className={cn("self-stretch overflow-hidden rounded-xl bg-card/80", className)}>
			{/* Queue header */}
			<div className="flex items-center justify-between gap-2.5 p-2.5">
				<div className="flex flex-1 items-center gap-2.5">
					<div className="text-sm font-semibold leading-5 text-foreground/80">
						{t("messageQueue.title")}
					</div>
				</div>
				<div className="flex items-center gap-2.5">
					<div className="text-[10px] font-normal leading-[1.3] text-muted-foreground">
						{t("messageQueue.taskCount", { count: queueStats.total })}
					</div>
					<button
						type="button"
						className="flex size-[18px] cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						onClick={handleToggleExpanded}
						aria-expanded={isExpanded}
						data-testid="handle-toggle-expanded"
					>
						{isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
					</button>
				</div>
			</div>

			{/* Queue content */}
			{isExpanded && (
				<div className="scrollbar-y-thin flex max-h-[200px] flex-col gap-2.5 overflow-y-auto overflow-x-hidden px-2.5 pb-2.5">
					<MessageQueueItems
						queue={queue}
						onRemoveMessage={onRemoveMessage}
						onSendMessage={onSendMessage}
						onStartEdit={onStartEdit}
						onWithdraw={onWithdraw}
						onMove={onMove}
						editorRef={editorRef}
						isOperationPending={isOperationPending}
						variant="default"
					/>
				</div>
			)}
		</div>
	)
}

export default MessageQueue
