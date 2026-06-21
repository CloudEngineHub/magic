import {
	memo,
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent,
} from "react"
import {
	AlertTriangle,
	AudioLines,
	CheckCircle2,
	Clock,
	CloudUpload,
	Ellipsis,
	FileAudio,
	FolderOpen,
	Loader2,
	PenLine,
	Sparkles,
	Trash2,
	RefreshCw,
	type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { AudioProjectListItem } from "@/types/audioProject"
import {
	formatRecordingCreatedTime,
	formatRecordingDuration,
	isRecordingDurationPending,
	isAudioProjectPreviewReady,
	resolveRecordingDisplayName,
	resolveRecordingSourceLabel,
	resolveRecordingSourceIcon,
} from "../utils/audio-recordings-utils"
import {
	canClickSummaryButton,
	getSummaryButtonVariant,
	shouldShowSummaryButton,
} from "../utils/summary-action-utils"

interface AudioRecordingCardProps {
	item: AudioProjectListItem
	layout?: "desktop" | "mobile"
	onOpen?: (item: AudioProjectListItem) => void
	onSummarize?: (item: AudioProjectListItem) => void
	onOpenProject?: (item: AudioProjectListItem) => void
	onRename?: (item: AudioProjectListItem) => void
	onDelete?: (item: AudioProjectListItem) => void
	onMore?: (item: AudioProjectListItem) => void
	onRetry?: (item: AudioProjectListItem) => void
	onMoveToGroup?: (item: AudioProjectListItem) => void
	isSubmitting?: boolean
}

interface LinearProgressProps {
	value: number
	tone?: "default" | "destructive"
	indeterminate?: boolean
	height?: number
}

/** Linear progress bar component for visual file uploads */
function LinearProgress({
	value,
	tone = "default",
	indeterminate = false,
	height = 6,
}: LinearProgressProps) {
	const pct = Math.max(0, Math.min(1, value)) * 100
	const fg = tone === "destructive" ? "rgb(239, 68, 68)" : "rgb(59, 130, 246)"

	return (
		<div
			className="w-full overflow-hidden rounded-full"
			style={{
				height,
				background: "rgba(100, 116, 139, 0.18)",
			}}
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(pct)}
		>
			<div
				className="h-full rounded-full transition-[width] duration-300 ease-out"
				style={{
					width: `${pct}%`,
					backgroundColor: fg,
					backgroundImage: indeterminate
						? `repeating-linear-gradient(45deg, ${fg} 0 8px, rgba(255, 255, 255, 0.15) 8px 16px)`
						: undefined,
					backgroundSize: indeterminate ? "32px 32px" : undefined,
					animation: indeterminate
						? "linear-progress-stripes 0.9s linear infinite"
						: undefined,
				}}
			/>
		</div>
	)
}

interface ProgressMetaProps {
	isTransferFailed: boolean
	pctText: number
}

/** Upload speed/status title row shown above progress bar */
function ProgressMeta({ isTransferFailed, pctText }: ProgressMetaProps) {
	const { t } = useTranslation("super")

	let label = ""
	let color = ""
	let Icon = CloudUpload

	if (isTransferFailed) {
		label = t("mobile.recordingEntry.progress.transferFailed")
		color = "rgb(239, 68, 68)"
		Icon = AlertTriangle
	} else {
		label = t("mobile.recordingEntry.progress.uploading")
		color = "rgb(59, 130, 246)"
		Icon = CloudUpload
	}

	return (
		<div className="flex items-center justify-between gap-2 text-[13px] leading-5">
			<span
				className="inline-flex min-w-0 items-center gap-1.5 font-medium"
				style={{ color }}
			>
				<Icon className="size-3.5 shrink-0" strokeWidth={1.8} />
				<span className="truncate">{label}</span>
			</span>
			<span className="shrink-0 font-semibold tabular-nums" style={{ color }}>
				{pctText}%
			</span>
		</div>
	)
}

/** Outlined status chip for summarized recordings (prototype ChipOutline) */
function ChipOutline({
	icon: Icon,
	children,
	"data-testid": testId,
}: {
	icon: LucideIcon
	children: React.ReactNode
	"data-testid"?: string
}) {
	return (
		<span
			className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-[12px] font-medium leading-4 text-foreground"
			data-testid={testId}
		>
			<Icon className="size-3.5" strokeWidth={1.8} />
			{children}
		</span>
	)
}

/** Muted chip for source metadata (prototype ChipMuted) */
function ChipMuted({
	icon: Icon,
	children,
	"data-testid": testId,
}: {
	icon: LucideIcon
	children: React.ReactNode
	"data-testid"?: string
}) {
	return (
		<span
			className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-[12px] font-medium leading-4 text-muted-foreground"
			data-testid={testId}
		>
			<Icon className="size-3.5" strokeWidth={1.8} />
			{children}
		</span>
	)
}

interface HorizontalScrollFadeState {
	canScrollStart: boolean
	canScrollEnd: boolean
}

/** Tracks horizontal overflow and maps vertical wheel to sideways scroll for a meta strip */
function useHorizontalScrollWithFade<T extends HTMLElement>() {
	const scrollRef = useRef<T>(null)
	const [fadeState, setFadeState] = useState<HorizontalScrollFadeState>({
		canScrollStart: false,
		canScrollEnd: false,
	})

	const updateFadeState = useCallback(() => {
		const element = scrollRef.current
		if (!element) return

		const { scrollLeft, scrollWidth, clientWidth } = element
		const maxScrollLeft = scrollWidth - clientWidth
		const hasOverflow = maxScrollLeft > 1

		setFadeState({
			canScrollStart: hasOverflow && scrollLeft > 1,
			canScrollEnd: hasOverflow && scrollLeft < maxScrollLeft - 1,
		})
	}, [])

	useEffect(() => {
		const element = scrollRef.current
		if (!element) return

		updateFadeState()

		const handleWheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
			if (element.scrollWidth <= element.clientWidth) return
			event.preventDefault()
			element.scrollLeft += event.deltaY
		}

		element.addEventListener("scroll", updateFadeState, { passive: true })
		element.addEventListener("wheel", handleWheel, { passive: false })

		const resizeObserver = new ResizeObserver(updateFadeState)
		resizeObserver.observe(element)

		return () => {
			element.removeEventListener("scroll", updateFadeState)
			element.removeEventListener("wheel", handleWheel)
			resizeObserver.disconnect()
		}
	}, [updateFadeState])

	return { scrollRef, ...fadeState, refreshFadeState: updateFadeState }
}

interface CardActionMenuProps {
	cardId: string
	label: string
	openProjectLabel: string
	renameLabel: string
	deleteLabel: string
	moveToGroupLabel?: string
	onOpenProject?: () => void
	onRename?: () => void
	onDelete?: () => void
	onRegenerateSummary?: () => void
	onMoveToGroup?: () => void
	regenerateSummaryLabel?: string
}

/** Renders project navigation, rename, and delete actions behind the card ellipsis menu */
function CardActionMenu({
	cardId,
	label,
	openProjectLabel,
	renameLabel,
	deleteLabel,
	moveToGroupLabel,
	onOpenProject,
	onRename,
	onDelete,
	onRegenerateSummary,
	onMoveToGroup,
	regenerateSummaryLabel,
}: CardActionMenuProps) {
	/** Routes to the source project while keeping the card click handler from firing */
	const handleOpenProject = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			onOpenProject?.()
		},
		[onOpenProject],
	)

	const handleRename = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			onRename?.()
		},
		[onRename],
	)

	const handleDelete = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			onDelete?.()
		},
		[onDelete],
	)

	const handleRegenerateSummary = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			onRegenerateSummary?.()
		},
		[onRegenerateSummary],
	)

	const handleMoveToGroup = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			onMoveToGroup?.()
		},
		[onMoveToGroup],
	)

	const handleTriggerClick = useCallback((event: MouseEvent) => {
		event.stopPropagation()
	}, [])

	/** Keeps keyboard menu activation from bubbling to the card-level Enter/Space handler */
	const handleTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		event.stopPropagation()
	}, [])

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label={label}
					onClick={handleTriggerClick}
					onKeyDown={handleTriggerKeyDown}
					data-testid={`audio-recording-card-${cardId}-more-actions`}
				>
					<Ellipsis className="h-4 w-4" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[120px]">
				<DropdownMenuItem
					onClick={handleOpenProject}
					data-testid={`audio-recording-card-${cardId}-action-open-project`}
				>
					<FolderOpen className="h-4 w-4" aria-hidden />
					{openProjectLabel}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleRename}
					data-testid={`audio-recording-card-${cardId}-action-rename`}
				>
					<PenLine className="h-4 w-4" aria-hidden />
					{renameLabel}
				</DropdownMenuItem>
				{onMoveToGroup && moveToGroupLabel ? (
					<DropdownMenuItem
						onClick={handleMoveToGroup}
						data-testid={`audio-recording-card-${cardId}-action-move-to-group`}
					>
						<FolderOpen className="h-4 w-4" aria-hidden />
						{moveToGroupLabel}
					</DropdownMenuItem>
				) : null}
				{onRegenerateSummary ? (
					<DropdownMenuItem
						onClick={handleRegenerateSummary}
						data-testid={`audio-recording-card-${cardId}-action-regenerate`}
					>
						<Sparkles className="h-4 w-4" aria-hidden />
						{regenerateSummaryLabel}
					</DropdownMenuItem>
				) : null}
				<DropdownMenuItem
					variant="destructive"
					onClick={handleDelete}
					data-testid={`audio-recording-card-${cardId}-action-delete`}
				>
					<Trash2 className="h-4 w-4" aria-hidden />
					{deleteLabel}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

/** Renders a single audio recording card aligned with the recordings list prototype */
function AudioRecordingCard({
	item,
	layout = "desktop",
	onOpen,
	onSummarize,
	onOpenProject,
	onRename,
	onDelete,
	onMore,
	onRetry,
	onMoveToGroup,
	isSubmitting = false,
}: AudioRecordingCardProps) {
	const { t } = useTranslation("audioRecordings")
	const isReady = isAudioProjectPreviewReady(item)
	const showSummaryButton = shouldShowSummaryButton(item.current_phase, item.phase_status)
	const summaryButtonVariant = getSummaryButtonVariant(item.current_phase, item.phase_status)
	const canClickSummary = canClickSummaryButton(
		item.current_phase,
		item.phase_status,
		isSubmitting,
	)
	const showSummarizingSpinner =
		item.card_status === "summarizing" &&
		item.phase_status === "in_progress" &&
		!showSummaryButton

	const isUploading = item.card_status === "uploading"
	const isUploadFailed = item.card_status === "upload_failed"
	const isProgressMode =
		isUploading ||
		isUploadFailed ||
		item.transferStatus === "transferring" ||
		item.transferStatus === "failed"

	const {
		scrollRef: metaScrollRef,
		canScrollStart,
		canScrollEnd,
	} = useHorizontalScrollWithFade<HTMLDivElement>()

	const handleClick = useCallback(() => {
		if (!isReady) return
		onOpen?.(item)
	}, [isReady, item, onOpen])

	const handleSummarizeClick = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation()
			if (!canClickSummary) return
			onSummarize?.(item)
		},
		[canClickSummary, item, onSummarize],
	)

	const handleRename = useCallback(() => {
		onRename?.(item)
	}, [item, onRename])

	const handleDelete = useCallback(() => {
		onDelete?.(item)
	}, [item, onDelete])

	const handleMoveToGroup = useCallback(() => {
		onMoveToGroup?.(item)
	}, [item, onMoveToGroup])

	/** Opens the backing Super project without entering the audio preview detail page */
	const handleOpenProject = useCallback(() => {
		onOpenProject?.(item)
	}, [item, onOpenProject])

	const displayName = resolveRecordingDisplayName(item.project_name, item.created_at)
	const sourceLabel = resolveRecordingSourceLabel(item, {
		sourceRecorded: t("card.sourceRecorded"),
		sourceImported: t("card.sourceImported"),
		sourceDevice: t("card.sourceDevice"),
		sourcePc: t("card.sourcePc"),
	})
	const createdLabel = formatRecordingCreatedTime(item.created_at)
	const isDurationPending = isRecordingDurationPending(item)
	const durationLabel = formatRecordingDuration(item.duration)
	const isMobile = layout === "mobile"
	const SourceIcon = resolveRecordingSourceIcon(item)

	const summaryButtonLabel =
		summaryButtonVariant === "retry"
			? t("card.retrySummary")
			: isMobile
				? t("card.generateSummary")
				: t("card.summarize")

	return (
		<div
			role={isReady ? "button" : undefined}
			tabIndex={isReady ? 0 : -1}
			onClick={isReady ? handleClick : undefined}
			onKeyDown={
				isReady
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault()
								handleClick()
							}
						}
					: undefined
			}
			className={cn(
				"flex min-w-0 flex-col rounded-2xl bg-card shadow-[0px_2px_12px_0px_rgba(0,0,0,0.06)] transition-shadow",
				isMobile
					? "gap-2.5 p-3.5"
					: "min-h-[132px] gap-3 p-4 hover:shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]",
				isReady ? "cursor-pointer" : "cursor-default",
			)}
			data-testid={
				isMobile ? `mobile-recording-card-${item.id}` : `audio-recording-card-${item.id}`
			}
			data-card-status={item.card_status}
			data-summarized={isReady ? "1" : "0"}
		>
			{/* Header: icon + title */}
			<div className="flex min-w-0 items-center gap-2.5">
				<div
					className={cn(
						"flex shrink-0 items-center justify-center rounded-lg bg-muted text-foreground",
						isMobile ? "size-8" : "size-9",
					)}
					aria-hidden
				>
					<FileAudio className={isMobile ? "size-[18px]" : "size-5"} />
				</div>
				<h3 className="min-w-0 flex-1 truncate text-[16px] font-medium leading-5 text-foreground">
					{displayName}
				</h3>
			</div>

			{/* Metadata row OR Progress Bar row */}
			{isProgressMode ? (
				<div className="flex flex-col gap-2">
					<ProgressMeta
						isTransferFailed={item.transferStatus === "failed" || isUploadFailed}
						pctText={Math.round((item.transferProgress ?? 0) * 100)}
					/>
					<LinearProgress
						value={item.transferProgress ?? 0}
						tone={
							item.transferStatus === "failed" || isUploadFailed
								? "destructive"
								: "default"
						}
						indeterminate={
							item.transferStatus === "transferring" && item.transferProgress === 0
						}
					/>
				</div>
			) : (
				<div className="flex items-center justify-between gap-3 text-[13px] leading-5 text-muted-foreground">
					<span
						className="inline-flex min-w-0 items-center gap-1.5"
						data-testid={
							isMobile ? undefined : `audio-recording-card-${item.id}-created-at`
						}
					>
						<Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
						<span className="truncate">{createdLabel}</span>
					</span>
					<span
						className="inline-flex shrink-0 items-center gap-1.5"
						data-testid={
							isMobile ? undefined : `audio-recording-card-${item.id}-duration`
						}
					>
						<AudioLines className="h-3.5 w-3.5 shrink-0" aria-hidden />
						{/* Static placeholder only — summarizing progress is shown in the footer spinner. */}
						<span>{isDurationPending ? "--:--" : durationLabel}</span>
					</span>
				</div>
			)}

			{/* Footer: single row — scrollable meta strip with edge fades; actions pinned right */}
			<div className="mt-auto flex min-w-0 items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<div
						ref={metaScrollRef}
						className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						data-testid={
							isMobile ? undefined : `audio-recording-card-${item.id}-meta-row`
						}
					>
						<div
							className="flex shrink-0 items-center gap-1.5"
							data-testid={
								isMobile ? undefined : `audio-recording-card-${item.id}-source-row`
							}
						>
							{item.card_status === "summarized" ? (
								<ChipOutline
									icon={CheckCircle2}
									data-testid={
										isMobile
											? undefined
											: `audio-recording-card-${item.id}-status-summarized`
									}
								>
									{t("card.summarized")}
								</ChipOutline>
							) : null}

							<ChipMuted
								icon={SourceIcon}
								data-testid={
									isMobile ? undefined : `audio-recording-card-${item.id}-source`
								}
							>
								{sourceLabel}
							</ChipMuted>
						</div>
					</div>

					{canScrollStart ? (
						<div
							className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-card via-card/70 to-transparent"
							data-testid={
								isMobile
									? undefined
									: `audio-recording-card-${item.id}-meta-fade-start`
							}
							aria-hidden
						/>
					) : null}

					{canScrollEnd ? (
						<div
							className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card via-card/70 to-transparent"
							data-testid={
								isMobile
									? undefined
									: `audio-recording-card-${item.id}-meta-fade-end`
							}
							aria-hidden
						/>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-1.5">
					{/* Upload Retry Option (Both Mobile and PC) */}
					{isProgressMode && (item.transferStatus === "failed" || isUploadFailed) ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={(event) => {
								event.stopPropagation()
								onRetry?.(item)
							}}
							className="h-8 shrink-0 gap-1 rounded-full border-destructive/20 bg-destructive/10 px-3 text-[13px] font-medium text-destructive hover:bg-destructive/20 hover:text-destructive"
							data-testid={
								isMobile
									? `mobile-recording-card-retry-${item.id}`
									: `audio-recording-card-retry-${item.id}`
							}
						>
							<RefreshCw className="h-3.5 w-3.5" />
							{t("card.retryUpload")}
						</Button>
					) : null}

					{!isProgressMode && showSummarizingSpinner ? (
						<span
							className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
							data-testid={
								isMobile
									? `mobile-recording-card-summarize-${item.id}`
									: `audio-recording-card-${item.id}-status-summarizing`
							}
						>
							<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
							{t("card.summarizing")}
						</span>
					) : null}

					{!isProgressMode && showSummaryButton ? (
						<Button
							type="button"
							size="sm"
							className={cn(
								"h-8 shrink-0 gap-1 rounded-full bg-foreground px-3.5 text-xs font-medium text-background hover:bg-foreground/90",
								isMobile && "text-[13px] leading-5",
							)}
							disabled={!canClickSummary}
							onClick={handleSummarizeClick}
							data-testid={
								isMobile
									? `mobile-recording-card-summarize-${item.id}`
									: `audio-recording-card-${item.id}-summary-button`
							}
						>
							{isSubmitting ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
							) : (
								<Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
							)}
							{summaryButtonLabel}
						</Button>
					) : null}

					{item.card_status === "not_summarized" && !showSummaryButton ? (
						<span
							className="inline-flex shrink-0 items-center rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
							data-testid={
								isMobile
									? undefined
									: `audio-recording-card-${item.id}-status-not-summarized`
							}
						>
							{t("card.notSummarized")}
						</span>
					) : null}

					{isMobile ? (
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation()
								onMore?.(item)
							}}
							className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full active:bg-foreground/[0.06]"
							aria-label={t("card.moreActions")}
							data-testid={`mobile-recording-card-more-${item.id}`}
						>
							<Ellipsis className="size-5 text-muted-foreground" />
						</button>
					) : (
						<CardActionMenu
							cardId={item.id}
							label={t("card.moreActions")}
							openProjectLabel={t("card.openProject")}
							renameLabel={t("card.rename")}
							deleteLabel={t("card.delete")}
							moveToGroupLabel={t("card.moveToGroup")}
							onOpenProject={handleOpenProject}
							onRename={handleRename}
							onDelete={handleDelete}
							onMoveToGroup={handleMoveToGroup}
							regenerateSummaryLabel={t("card.retrySummary")}
							onRegenerateSummary={
								item.card_status === "summarized" && onSummarize
									? () => onSummarize(item)
									: undefined
							}
						/>
					)}
				</div>
			</div>
		</div>
	)
}

export default memo(AudioRecordingCard)
