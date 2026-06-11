import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	BarChart3,
	CalendarClock,
	ClipboardCheck,
	Database,
	FileText,
	Link2,
	Loader2,
	MessageCircle,
	RefreshCw,
	ThumbsUp,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { cn } from "@/lib/utils"
import { ScheduledTask } from "@/types/scheduledTask"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaAttachmentNode, SelfMediaCard } from "../types"
import CardFrame from "./CardFrame"
import { CARD_THUMBNAIL_IMAGE_PROCESS } from "../constants/imageProcess"
import { useCoverImageUrl } from "../platforms/wechat-official-accounts/useCoverImageUrl"
import { isCardPlatform } from "../services/selfMediaAiNormalize"
import type { AICardCreateInitialValues } from "./AICardCreateDialog"

const COMPACT_ACTION_LABEL_MIN_WIDTH = 320
const FULL_ACTION_LABEL_MIN_WIDTH = 420

export interface SelfMediaPostOpsArtifacts {
	source: boolean
	metrics: boolean
	comments: boolean
	review: boolean
}

interface SelfMediaPostCardProps {
	item: SelfMediaPlatformPostItem
	title: string
	subtitle: string
	postId: string
	opsArtifacts: SelfMediaPostOpsArtifacts
	attachmentList?: SelfMediaAttachmentNode[]
	onOpenPost: (target: { platform: SelfMediaPlatform; index: number }) => void
	onRequestPrePublishAnalysis?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onOpenOpsMetrics?: (target: SelfMediaPlatformPostItem) => void
	onPostPublishRefresh?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl?: string,
	) => Promise<void> | void
	onConfigureAutoSync?: (
		target: SelfMediaPlatformPostItem,
		config: { enabled: boolean; timeConfig: ScheduledTask.TimeConfig },
	) => Promise<void> | void
	onCreateAICard?: (initialValues?: AICardCreateInitialValues) => void
	onLoadPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<string | undefined> | string | undefined
	onBindPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<void> | void
	buildPostReviewInitialValues: (
		item: SelfMediaPlatformPostItem,
		title: string,
	) => AICardCreateInitialValues
}

function SelfMediaPostCard({
	item,
	title,
	subtitle,
	postId,
	opsArtifacts,
	attachmentList,
	onOpenPost,
	onRequestPrePublishAnalysis,
	onOpenOpsMetrics,
	onPostPublishRefresh,
	onConfigureAutoSync,
	onCreateAICard,
	onLoadPublishedUrl,
	onBindPublishedUrl,
	buildPostReviewInitialValues,
}: SelfMediaPostCardProps) {
	const { t } = useTranslation("super")
	const { platform, index } = item
	const engagementItems = getEngagementItems(item)
	const cardRef = useRef<HTMLDivElement | null>(null)
	const [localPublishedUrl, setLocalPublishedUrl] = useState("")
	const [showActionLabels, setShowActionLabels] = useState(true)
	const sourceReady = opsArtifacts.source || localPublishedUrl.trim().length > 0
	const canManagePublishedUrl = Boolean(onBindPublishedUrl || onLoadPublishedUrl)
	const actionLabelMinWidth = sourceReady
		? FULL_ACTION_LABEL_MIN_WIDTH
		: COMPACT_ACTION_LABEL_MIN_WIDTH

	useEffect(() => {
		const element = cardRef.current
		if (!element || typeof ResizeObserver === "undefined") return

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return
			setShowActionLabels(entry.contentRect.width >= actionLabelMinWidth)
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [actionLabelMinWidth])

	return (
		<div ref={cardRef} className="relative">
			<button
				type="button"
				className="group flex min-h-32 w-full cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 pb-12 text-left text-card-foreground shadow-xs transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]"
				onClick={() => onOpenPost({ platform, index })}
				data-testid={`self-media-home-post-open-${postId}`}
			>
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex shrink-0 items-center justify-center overflow-hidden bg-primary/10 text-primary",
							"rounded-md",
							isCardPlatform(platform) ? "h-[4.5rem] w-[3.375rem]" : "h-14 w-14",
						)}
					>
						<ArticlePreview
							item={item}
							attachmentList={attachmentList}
							postId={postId}
						/>
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate text-sm font-medium text-foreground">
								{title}
							</h3>
						</div>
						{subtitle ? (
							<p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
								{subtitle}
							</p>
						) : null}
					</div>
				</div>
				{engagementItems.length > 0 ? (
					<div
						className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 pr-24 text-[11px] leading-5 text-muted-foreground"
						data-testid={`self-media-home-post-engagement-${postId}`}
					>
						{engagementItems.map((metric) => (
							<span
								key={metric.key}
								className="inline-flex min-w-0 items-center gap-1"
							>
								<metric.Icon className="h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{metric.value}</span>
							</span>
						))}
					</div>
				) : null}
			</button>
			<div
				className="absolute bottom-3 left-3 flex items-center gap-1.5"
				data-testid={`self-media-home-post-ops-artifacts-${postId}`}
			>
				{getOpsArtifactItems(opsArtifacts).map((artifact) =>
					artifact.key === "source" && canManagePublishedUrl ? (
						<PublishedLinkPopover
							key={artifact.key}
							item={item}
							postId={postId}
							sourceReady={sourceReady}
							trigger="artifact"
							artifactReady={artifact.ready}
							artifactReadyClassName={artifact.readyClassName}
							localPublishedUrl={localPublishedUrl}
							onLocalPublishedUrlChange={setLocalPublishedUrl}
							onLoadPublishedUrl={onLoadPublishedUrl}
							onBindPublishedUrl={onBindPublishedUrl}
							onPostPublishRefresh={onPostPublishRefresh}
						/>
					) : (
						<MagicTooltip key={artifact.key} title={t(artifact.labelKey)}>
							<span
								className={cn(
									"flex h-5 w-5 items-center justify-center rounded-full border transition",
									artifact.ready
										? artifact.readyClassName
										: "border-border bg-muted/50 text-muted-foreground/60",
								)}
								aria-label={t(artifact.labelKey)}
								data-ready={artifact.ready ? "true" : "false"}
								data-testid={`self-media-home-post-ops-artifact-${postId}-${artifact.key}`}
							>
								<artifact.Icon className="size-3" aria-hidden="true" />
							</span>
						</MagicTooltip>
					),
				)}
			</div>
			<div
				className="absolute bottom-3 right-3 flex max-w-[calc(100%-5.5rem)] flex-wrap items-center justify-end gap-1.5"
				data-label-mode={showActionLabels ? "expanded" : "compact"}
				data-testid={`self-media-home-post-actions-${postId}`}
			>
				{onRequestPrePublishAnalysis ? (
					<PostActionButton
						label={t("detail.selfMedia.analysis.action")}
						Icon={ClipboardCheck}
						showLabel={showActionLabels}
						onClick={() => onRequestPrePublishAnalysis({ platform, index })}
						dataTestId={`self-media-home-post-analysis-${postId}`}
					/>
				) : null}
				{!sourceReady && canManagePublishedUrl ? (
					<PublishedLinkPopover
						item={item}
						postId={postId}
						sourceReady={sourceReady}
						trigger="action"
						showLabel={showActionLabels}
						localPublishedUrl={localPublishedUrl}
						onLocalPublishedUrlChange={setLocalPublishedUrl}
						onLoadPublishedUrl={onLoadPublishedUrl}
						onBindPublishedUrl={onBindPublishedUrl}
						onPostPublishRefresh={onPostPublishRefresh}
					/>
				) : null}
				{sourceReady && onOpenOpsMetrics ? (
					<PostDataPopover
						item={item}
						postId={postId}
						label={t("detail.selfMedia.home.opsData")}
						showLabel={showActionLabels}
						onOpenOpsMetrics={onOpenOpsMetrics}
						onPostPublishRefresh={onPostPublishRefresh}
						onConfigureAutoSync={onConfigureAutoSync}
					/>
				) : null}
				{sourceReady && onCreateAICard ? (
					<PostActionButton
						label={t("detail.selfMedia.home.postReviewCard")}
						Icon={BarChart3}
						showLabel={showActionLabels}
						variant="primary"
						onClick={() => onCreateAICard(buildPostReviewInitialValues(item, title))}
						dataTestId={`self-media-home-post-review-card-${postId}`}
					/>
				) : null}
			</div>
		</div>
	)
}

function PostDataPopover({
	item,
	postId,
	label,
	showLabel,
	onOpenOpsMetrics,
	onPostPublishRefresh,
	onConfigureAutoSync,
}: {
	item: SelfMediaPlatformPostItem
	postId: string
	label: string
	showLabel: boolean
	onOpenOpsMetrics?: (target: SelfMediaPlatformPostItem) => void
	onPostPublishRefresh?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl?: string,
	) => Promise<void> | void
	onConfigureAutoSync?: (
		target: SelfMediaPlatformPostItem,
		config: { enabled: boolean; timeConfig: ScheduledTask.TimeConfig },
	) => Promise<void> | void
}) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingAutoSync, setSavingAutoSync] = useState(false)
	const [frequency, setFrequency] = useState<ScheduledTask.ScheduleType>(
		ScheduledTask.ScheduleType.Daily,
	)
	const [time, setTime] = useState("09:00")
	const [day, setDay] = useState("1")
	const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
	const timeConfig: ScheduledTask.TimeConfig = useMemo(
		() => ({
			type: frequency,
			time,
			...(frequency === ScheduledTask.ScheduleType.Weekly ||
			frequency === ScheduledTask.ScheduleType.Monthly
				? { day }
				: {}),
		}),
		[day, frequency, time],
	)

	const handleSyncNow = useCallback(async () => {
		if (!onPostPublishRefresh) return
		setSyncing(true)
		try {
			await onPostPublishRefresh(item)
			setOpen(false)
		} finally {
			setSyncing(false)
		}
	}, [item, onPostPublishRefresh])

	const handleConfigureAutoSync = useCallback(async () => {
		if (!onConfigureAutoSync) return
		setSavingAutoSync(true)
		try {
			await onConfigureAutoSync(item, { enabled: autoSyncEnabled, timeConfig })
			setOpen(false)
		} finally {
			setSavingAutoSync(false)
		}
	}, [autoSyncEnabled, item, onConfigureAutoSync, timeConfig])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex h-7 items-center justify-center rounded text-xs font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
						showLabel ? "gap-1.5 px-2" : "w-7",
						"bg-background/90 text-muted-foreground ring-1 ring-border/70 hover:bg-accent hover:text-foreground",
					)}
					aria-label={label}
					title={showLabel ? undefined : label}
					data-testid={`self-media-home-post-ops-data-${postId}`}
				>
					<Database className="h-4 w-4 shrink-0" />
					{showLabel ? <span className="whitespace-nowrap">{label}</span> : null}
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="end"
				className="w-80 space-y-3 p-3"
				data-testid={`self-media-home-post-data-popover-${postId}`}
			>
				<div className="grid gap-2">
					<Button
						type="button"
						variant="outline"
						className="justify-start"
						disabled={!onPostPublishRefresh || syncing}
						onClick={() => void handleSyncNow()}
						data-testid={`self-media-home-post-data-sync-now-${postId}`}
					>
						{syncing ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<RefreshCw className="size-4" aria-hidden="true" />
						)}
						{t("detail.selfMedia.home.dataSyncNow")}
					</Button>
					<Button
						type="button"
						variant="outline"
						className="justify-start"
						onClick={() => {
							onOpenOpsMetrics?.(item)
							setOpen(false)
						}}
						data-testid={`self-media-home-post-data-overview-${postId}`}
					>
						<BarChart3 className="size-4" aria-hidden="true" />
						{t("detail.selfMedia.home.dataOverview")}
					</Button>
				</div>
				<div className="space-y-2 rounded-md border bg-muted/20 p-3">
					<div className="flex items-center gap-2 text-xs font-medium text-foreground">
						<CalendarClock
							className="size-3.5 text-muted-foreground"
							aria-hidden="true"
						/>
						{t("detail.selfMedia.home.autoSync")}
					</div>
					<p className="text-xs text-muted-foreground">
						{t("detail.selfMedia.home.autoSyncDescription")}
					</p>
					<div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
						<span className="text-muted-foreground">
							{t("detail.selfMedia.home.autoSyncStatus")}
						</span>
						<select
							value={autoSyncEnabled ? "1" : "0"}
							onChange={(event) => setAutoSyncEnabled(event.target.value === "1")}
							className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
							data-testid={`self-media-home-post-auto-sync-enabled-${postId}`}
						>
							<option value="1">{t("detail.selfMedia.home.autoSyncEnabled")}</option>
							<option value="0">{t("detail.selfMedia.home.autoSyncDisabled")}</option>
						</select>
					</div>
					<div className="grid grid-cols-[1fr_auto] gap-2">
						<select
							value={frequency}
							disabled={!autoSyncEnabled}
							onChange={(event) =>
								setFrequency(event.target.value as ScheduledTask.ScheduleType)
							}
							className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
							data-testid={`self-media-home-post-auto-sync-frequency-${postId}`}
						>
							<option value={ScheduledTask.ScheduleType.Daily}>
								{t("detail.selfMedia.home.autoSyncDaily")}
							</option>
							<option value={ScheduledTask.ScheduleType.Weekly}>
								{t("detail.selfMedia.home.autoSyncWeekly")}
							</option>
							<option value={ScheduledTask.ScheduleType.Monthly}>
								{t("detail.selfMedia.home.autoSyncMonthly")}
							</option>
						</select>
						<Input
							type="time"
							value={time}
							disabled={!autoSyncEnabled}
							onChange={(event) => setTime(event.target.value)}
							className="h-8 w-24 text-xs"
							data-testid={`self-media-home-post-auto-sync-time-${postId}`}
						/>
					</div>
					{frequency !== ScheduledTask.ScheduleType.Daily ? (
						<Input
							value={day}
							disabled={!autoSyncEnabled}
							onChange={(event) => setDay(event.target.value)}
							className="h-8 text-xs"
							placeholder={
								frequency === ScheduledTask.ScheduleType.Weekly
									? t("detail.selfMedia.home.autoSyncWeekdayPlaceholder")
									: t("detail.selfMedia.home.autoSyncMonthDayPlaceholder")
							}
							data-testid={`self-media-home-post-auto-sync-day-${postId}`}
						/>
					) : null}
					<Button
						type="button"
						size="sm"
						className="w-full"
						disabled={!onConfigureAutoSync || savingAutoSync}
						onClick={() => void handleConfigureAutoSync()}
						data-testid={`self-media-home-post-auto-sync-save-${postId}`}
					>
						{savingAutoSync ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : null}
						{autoSyncEnabled
							? t("detail.selfMedia.home.autoSyncSave")
							: t("detail.selfMedia.home.autoSyncTurnOff")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}

interface PublishedLinkPopoverProps {
	item: SelfMediaPlatformPostItem
	postId: string
	sourceReady: boolean
	trigger: "action" | "artifact"
	showLabel?: boolean
	artifactReady?: boolean
	artifactReadyClassName?: string
	localPublishedUrl: string
	onLocalPublishedUrlChange: (url: string) => void
	onLoadPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<string | undefined> | string | undefined
	onBindPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<void> | void
	onPostPublishRefresh?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl?: string,
	) => Promise<void> | void
}

function PublishedLinkPopover({
	item,
	postId,
	sourceReady,
	trigger,
	showLabel,
	artifactReady,
	artifactReadyClassName,
	localPublishedUrl,
	onLocalPublishedUrlChange,
	onLoadPublishedUrl,
	onBindPublishedUrl,
	onPostPublishRefresh,
}: PublishedLinkPopoverProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const [linkValue, setLinkValue] = useState(localPublishedUrl)
	const [loading, setLoading] = useState(false)
	const [submitting, setSubmitting] = useState<"save" | "fetch" | null>(null)
	const trimmedLink = linkValue.trim()
	const canSubmit = Boolean(onBindPublishedUrl && trimmedLink && !loading && !submitting)
	const label = t(
		sourceReady
			? "detail.selfMedia.home.editPublishedLink"
			: "detail.selfMedia.home.bindPublishedLink",
	)
	const contentAlign = trigger === "artifact" ? "start" : "end"

	useEffect(() => {
		if (!open) return
		setLinkValue(localPublishedUrl)
		if (!onLoadPublishedUrl) return

		let cancelled = false
		setLoading(true)
		Promise.resolve(onLoadPublishedUrl(item))
			.then((url) => {
				if (cancelled || !url) return
				onLocalPublishedUrlChange(url)
				setLinkValue(url)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [item, localPublishedUrl, onLoadPublishedUrl, onLocalPublishedUrlChange, open])

	const submit = useCallback(
		async (mode: "save" | "fetch") => {
			if (!onBindPublishedUrl || !trimmedLink) return
			setSubmitting(mode)
			try {
				await onBindPublishedUrl(item, trimmedLink)
				onLocalPublishedUrlChange(trimmedLink)
				if (mode === "fetch") {
					await onPostPublishRefresh?.(item, trimmedLink)
				}
				setOpen(false)
			} finally {
				setSubmitting(null)
			}
		},
		[item, onBindPublishedUrl, onLocalPublishedUrlChange, onPostPublishRefresh, trimmedLink],
	)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{trigger === "artifact" ? (
					<button
						type="button"
						className={cn(
							"flex h-5 w-5 items-center justify-center rounded-full border transition hover:scale-105 hover:ring-2 hover:ring-ring/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
							artifactReady
								? artifactReadyClassName
								: "border-border bg-muted/50 text-muted-foreground/60",
						)}
						aria-label={label}
						title={label}
						data-ready={artifactReady ? "true" : "false"}
						data-testid={`self-media-home-post-ops-artifact-${postId}-source`}
					>
						<Link2 className="size-3" aria-hidden="true" />
					</button>
				) : (
					<button
						type="button"
						className={cn(
							"inline-flex h-7 items-center justify-center rounded text-xs font-medium shadow-sm ring-1 transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
							showLabel ? "gap-1.5 px-2" : "w-7",
							sourceReady
								? "bg-background/90 text-muted-foreground ring-border/70 hover:bg-accent hover:text-foreground"
								: "bg-primary text-primary-foreground ring-primary/30 hover:bg-primary/90",
						)}
						aria-label={label}
						title={showLabel ? undefined : label}
						data-testid={`self-media-home-post-bind-link-${postId}`}
					>
						<Link2 className="h-4 w-4 shrink-0" />
						{showLabel ? <span className="whitespace-nowrap">{label}</span> : null}
					</button>
				)}
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align={contentAlign}
				className="w-80 space-y-3 p-3"
				data-testid={`self-media-home-post-bind-link-popover-${postId}`}
			>
				{loading ? (
					<div
						className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground"
						data-testid={`self-media-home-post-bind-link-loading-${postId}`}
					>
						<Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
						<span>{t("detail.selfMedia.home.loadingPublishedLink")}</span>
					</div>
				) : (
					<>
						<label className="block space-y-1.5">
							<span className="text-xs font-medium text-foreground">
								{t("detail.selfMedia.home.publishedLinkInput")}
							</span>
							<Input
								value={linkValue}
								onChange={(event) => setLinkValue(event.target.value)}
								placeholder={t("detail.selfMedia.home.publishedLinkPlaceholder")}
								disabled={Boolean(submitting)}
								data-testid={`self-media-home-post-bind-link-input-${postId}`}
							/>
						</label>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!canSubmit}
								onClick={() => void submit("save")}
								data-testid={`self-media-home-post-bind-link-save-${postId}`}
							>
								{submitting === "save" ? (
									<Loader2
										className="mr-1.5 size-3.5 animate-spin"
										aria-hidden="true"
									/>
								) : null}
								{t("detail.selfMedia.home.bindPublishedLinkAction")}
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!canSubmit || !onPostPublishRefresh}
								onClick={() => void submit("fetch")}
								data-testid={`self-media-home-post-bind-link-fetch-${postId}`}
							>
								{submitting === "fetch" ? (
									<Loader2
										className="mr-1.5 size-3.5 animate-spin"
										aria-hidden="true"
									/>
								) : null}
								{t("detail.selfMedia.home.bindAndFetchPublishedData")}
							</Button>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}

function PostActionButton({
	label,
	Icon,
	showLabel,
	onClick,
	dataTestId,
	variant = "default",
}: {
	label: string
	Icon: typeof ClipboardCheck
	showLabel: boolean
	onClick: () => void
	dataTestId: string
	variant?: "default" | "primary"
}) {
	return (
		<MagicTooltip title={showLabel ? undefined : label}>
			<button
				type="button"
				className={cn(
					"inline-flex h-7 items-center justify-center rounded text-xs font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					showLabel ? "gap-1.5 px-2" : "w-7",
					variant === "primary"
						? "bg-primary text-primary-foreground hover:bg-primary/90"
						: "bg-background/90 text-muted-foreground ring-1 ring-border/70 hover:bg-accent hover:text-foreground",
				)}
				aria-label={label}
				onClick={onClick}
				data-testid={dataTestId}
			>
				<Icon className="h-4 w-4 shrink-0" />
				{showLabel ? <span className="whitespace-nowrap">{label}</span> : null}
			</button>
		</MagicTooltip>
	)
}

function ArticlePreview({
	item,
	attachmentList,
	postId,
}: {
	item: SelfMediaPlatformPostItem
	attachmentList?: SelfMediaAttachmentNode[]
	postId: string
}) {
	const { platform, post } = item
	const cover =
		platform === "wechat-official-accounts" ? post.thumbnailCover || post.heroCover : undefined
	const card = platform !== "wechat-official-accounts" ? post.cards[0] : undefined

	if (cover?.fileId || cover?.url) return <HomeCoverPreview cover={cover} postId={postId} />

	if (card?.fileId)
		return (
			<div
				className="pointer-events-none h-full w-full bg-white"
				data-testid={`self-media-home-card-preview-${postId}`}
			>
				<CardFrame
					cardId={`home-${postId}-${card.version ?? ""}`}
					fileId={card.fileId}
					version={card.version}
					attachmentList={attachmentList}
					imageProcessOptions={CARD_THUMBNAIL_IMAGE_PROCESS}
					className="h-full w-full"
					title={post.meta.title || post.meta.feedTitle || postId}
				/>
			</div>
		)

	return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />
}

function getEngagementItems({ post }: SelfMediaPlatformPostItem) {
	const items: Array<{
		key: string
		value: string
		Icon: typeof ThumbsUp
	}> = []
	if (post.meta.feedLikes) {
		items.push({ key: "likes", value: post.meta.feedLikes, Icon: ThumbsUp })
	}
	if (post.meta.commentCount) {
		items.push({ key: "comments", value: post.meta.commentCount, Icon: MessageCircle })
	} else if (Array.isArray(post.meta.comments) && post.meta.comments.length > 0) {
		items.push({
			key: "comments",
			value: String(post.meta.comments.length),
			Icon: MessageCircle,
		})
	}
	return items
}

function getOpsArtifactItems(artifacts: SelfMediaPostOpsArtifacts) {
	return [
		{
			key: "source",
			Icon: Link2,
			ready: artifacts.source,
			readyClassName: "border-sky-200 bg-sky-50 text-sky-600",
			labelKey: artifacts.source
				? "detail.selfMedia.home.opsArtifacts.sourceReady"
				: "detail.selfMedia.home.opsArtifacts.sourceMissing",
		},
		{
			key: "metrics",
			Icon: BarChart3,
			ready: artifacts.metrics,
			readyClassName: "border-emerald-200 bg-emerald-50 text-emerald-600",
			labelKey: artifacts.metrics
				? "detail.selfMedia.home.opsArtifacts.metricsReady"
				: "detail.selfMedia.home.opsArtifacts.metricsMissing",
		},
		{
			key: "comments",
			Icon: MessageCircle,
			ready: artifacts.comments,
			readyClassName: "border-amber-200 bg-amber-50 text-amber-600",
			labelKey: artifacts.comments
				? "detail.selfMedia.home.opsArtifacts.commentsReady"
				: "detail.selfMedia.home.opsArtifacts.commentsMissing",
		},
		{
			key: "review",
			Icon: ClipboardCheck,
			ready: artifacts.review,
			readyClassName: "border-violet-200 bg-violet-50 text-violet-600",
			labelKey: artifacts.review
				? "detail.selfMedia.home.opsArtifacts.reviewReady"
				: "detail.selfMedia.home.opsArtifacts.reviewMissing",
		},
	]
}

function HomeCoverPreview({ cover, postId }: { cover: SelfMediaCard; postId: string }) {
	const { url } = useCoverImageUrl(
		cover.url ? undefined : cover.fileId,
		Boolean(cover.fileId && !cover.url),
		CARD_THUMBNAIL_IMAGE_PROCESS,
	)
	const coverUrl = cover.url || url

	if (!coverUrl)
		return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />

	return (
		<img
			src={coverUrl}
			alt=""
			className="h-full w-full object-cover"
			data-testid={`self-media-home-cover-preview-${postId}`}
		/>
	)
}

export default SelfMediaPostCard
