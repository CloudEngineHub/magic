import { useState, type ComponentType } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUp, ChevronDown, Hourglass, Loader2, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessageQueueProps } from "./index"
import { normalizeQueuePreviewText } from "./utils"

const MOBILE_QUEUE_AUTO_COLLAPSE_THRESHOLD = 3

interface MobileQueueActionButtonProps {
	label: string
	disabled?: boolean
	loading?: boolean
	icon: ComponentType<{ className?: string; strokeWidth?: number }>
	onClick: () => void
	testId: string
}

/** Render a fixed-size mobile queue action button that matches the prototype row controls. */
function MobileQueueActionButton({
	label,
	disabled = false,
	loading = false,
	icon: Icon,
	onClick,
	testId,
}: MobileQueueActionButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-opacity active:opacity-70",
				(disabled || loading) && "cursor-not-allowed opacity-50 active:opacity-50",
			)}
			aria-label={label}
			title={label}
			disabled={disabled || loading}
			onClick={onClick}
			data-testid={testId}
		>
			{loading ? (
				<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			) : (
				<Icon className="size-4" strokeWidth={2} />
			)}
		</button>
	)
}

/** Render the mobile-only queue card while preserving the existing queue operations. */
function MobileMessageQueue({
	queue,
	queueStats,
	editingQueueItem,
	onRemoveMessage,
	onSendMessage,
	onStartEdit,
	onCancelEdit,
	className,
}: MessageQueueProps) {
	const { t } = useTranslation("super")
	const shouldAutoCollapse = queue.length >= MOBILE_QUEUE_AUTO_COLLAPSE_THRESHOLD
	const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
	const isExpanded = manualExpanded ?? !shouldAutoCollapse

	if (queue.length === 0) {
		return null
	}

	const handleToggleExpanded = () => {
		setManualExpanded((current) => !(current ?? !shouldAutoCollapse))
	}

	return (
		<div
			className={cn("flex shrink-0 flex-col overflow-hidden rounded-3xl bg-card", className)}
			style={{ boxShadow: "0px 8px 25px 0px rgba(0,0,0,0.10)" }}
			role="region"
			aria-label={t("messageQueue.mobile.title")}
			data-testid="mobile-message-queue"
		>
			<button
				type="button"
				className="flex h-11 shrink-0 items-center gap-2 px-3 text-left transition-opacity active:opacity-70"
				onClick={handleToggleExpanded}
				aria-expanded={isExpanded}
				aria-label={
					isExpanded ? t("messageQueue.mobile.collapse") : t("messageQueue.mobile.expand")
				}
				data-testid="mobile-message-queue-toggle"
			>
				<Hourglass className="size-4 shrink-0 text-foreground" strokeWidth={2} />
				<span className="shrink-0 text-sm font-medium leading-5 text-foreground">
					{t("messageQueue.mobile.title")}
				</span>
				<span className="shrink-0 text-sm leading-5 text-muted-foreground">
					· {t("messageQueue.mobile.count", { count: queueStats.total })}
				</span>
				<span className="flex-1" aria-hidden />
				<ChevronDown
					className="size-4 shrink-0 text-foreground transition-transform duration-200"
					style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
				/>
			</button>

			{isExpanded && (
				<div
					className="flex max-h-[35vh] flex-col overflow-y-auto border-t border-border"
					data-testid="mobile-message-queue-list"
				>
					{queue.map((message) => {
						const isEditing = editingQueueItem?.id === message.id
						const isDisabled =
							message.isDeletingLoading ||
							message.isSendingLoading ||
							message.isEditingLoading
						const previewText =
							normalizeQueuePreviewText(message.content) ||
							t("messageQueue.mobile.emptyContent")

						return (
							<div
								key={message.id}
								className={cn(
									"flex shrink-0 items-center gap-2 px-3 py-2 transition-[opacity,transform] duration-200",
									isEditing && "bg-muted/40",
								)}
								data-testid="mobile-message-queue-item"
							>
								<div className="min-w-0 flex-1">
									<p className="m-0 truncate text-sm font-normal leading-5 text-foreground">
										{previewText}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									{isEditing ? (
										<button
											type="button"
											className={cn(
												"flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs text-foreground shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]",
												message.isEditingLoading &&
													"cursor-not-allowed opacity-50",
											)}
											disabled={Boolean(message.isEditingLoading)}
											onClick={onCancelEdit}
											data-testid="mobile-message-queue-cancel-edit-button"
										>
											{message.isEditingLoading ? (
												<Loader2
													className="size-3 animate-spin"
													strokeWidth={2}
													data-testid="mobile-message-queue-editing-loading"
												/>
											) : null}
											{t("messageQueue.exitEdit")}
										</button>
									) : (
										<>
											<MobileQueueActionButton
												label={t("messageQueue.editMessage")}
												disabled={Boolean(isDisabled)}
												loading={Boolean(message.isEditingLoading)}
												icon={Pencil}
												onClick={() => onStartEdit(message.id)}
												testId="mobile-message-queue-edit-button"
											/>
											<MobileQueueActionButton
												label={t("messageQueue.submitNow")}
												disabled={Boolean(
													message.isDeletingLoading ||
													message.isEditingLoading,
												)}
												loading={Boolean(message.isSendingLoading)}
												icon={ArrowUp}
												onClick={() => onSendMessage(message.id)}
												testId="mobile-message-queue-send-button"
											/>
											<MobileQueueActionButton
												label={t("messageQueue.removeFromQueue")}
												disabled={Boolean(
													message.isSendingLoading ||
													message.isEditingLoading,
												)}
												loading={Boolean(message.isDeletingLoading)}
												icon={X}
												onClick={() => onRemoveMessage(message.id)}
												testId="mobile-message-queue-remove-button"
											/>
										</>
									)}
								</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

export default MobileMessageQueue
