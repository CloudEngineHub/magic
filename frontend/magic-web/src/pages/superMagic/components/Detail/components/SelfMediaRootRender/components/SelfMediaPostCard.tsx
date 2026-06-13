import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"
import { BarChart3, ClipboardCheck, Eye, Link2, MessageCircle, ThumbsUp } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/lib/utils"
import { ScheduledTask } from "@/types/scheduledTask"
import type { SelfMediaPlatform } from "../../../types"
import type {
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsMetricValue,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"
import type {
	SelfMediaPostOpsArtifactAnimations,
	SelfMediaPostOpsArtifacts,
} from "../services/selfMediaOpsArtifactStates"
import { isCardPlatform } from "../services/selfMediaAiNormalize"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaAttachmentNode } from "../types"
import SelfMediaPostActionButton from "./SelfMediaPostActionButton"
import SelfMediaPostArticlePreview from "./SelfMediaPostArticlePreview"
import SelfMediaPostArtifactConfetti from "./SelfMediaPostArtifactConfetti"
import SelfMediaPostDataPopover from "./SelfMediaPostDataPopover"
import SelfMediaPostLifecycleStatus from "./SelfMediaPostLifecycleStatus"
import SelfMediaPostContextMenu from "./SelfMediaPostContextMenu"
import SelfMediaPostPublishedLinkPopover from "./SelfMediaPostPublishedLinkPopover"

const COMPACT_ACTION_LABEL_MIN_WIDTH = 320
const FULL_ACTION_LABEL_MIN_WIDTH = 420

export interface SelfMediaPostOpenTransitionPayload {
	rect: {
		left: number
		top: number
		width: number
		height: number
	}
	title: string
	subtitle: string
	postId: string
}

interface SelfMediaPostCardProps {
	item: SelfMediaPlatformPostItem
	title: string
	subtitle: string
	postId: string
	opsArtifacts: SelfMediaPostOpsArtifacts
	opsArtifactAnimations?: SelfMediaPostOpsArtifactAnimations
	opsMetrics?: SelfMediaPostOpsMetricsPayload | null
	attachmentList?: SelfMediaAttachmentNode[]
	opening?: boolean
	openingDimmed?: boolean
	openingStyle?: CSSProperties
	onOpenPost: (
		target: { platform: SelfMediaPlatform; index: number },
		transition?: SelfMediaPostOpenTransitionPayload,
	) => void
	onRequestPrePublishAnalysis?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onPostPublishRefresh?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl?: string,
	) => Promise<void> | void
	onConfigureAutoSync?: (
		target: SelfMediaPlatformPostItem,
		config: { enabled: boolean; timeConfig: ScheduledTask.TimeConfig },
	) => Promise<boolean | void> | boolean | void
	onOpenOpsReview?: (target: SelfMediaPlatformPostItem) => void
	onLoadPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<string | undefined> | string | undefined
	onLoadOpsSource?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<SelfMediaPostOpsSourcePayload | null> | SelfMediaPostOpsSourcePayload | null
	onBindPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<boolean | void> | boolean | void
	onRenamePost?: (
		target: SelfMediaPlatformPostItem,
		nextTitle: string,
	) => Promise<boolean | void> | boolean | void
	onDeletePost?: (target: SelfMediaPlatformPostItem) => Promise<boolean | void> | boolean | void
}

function SelfMediaPostCard({
	item,
	title,
	subtitle,
	postId,
	opsArtifacts,
	opsArtifactAnimations,
	opsMetrics,
	attachmentList,
	opening,
	openingDimmed,
	openingStyle,
	onOpenPost,
	onRequestPrePublishAnalysis,
	onPostPublishRefresh,
	onConfigureAutoSync,
	onOpenOpsReview,
	onLoadPublishedUrl,
	onLoadOpsSource,
	onBindPublishedUrl,
	onRenamePost,
	onDeletePost,
}: SelfMediaPostCardProps) {
	const { t } = useTranslation("super")
	const { platform, index } = item
	const engagementItems = getEngagementItems(opsMetrics)
	const cardRef = useRef<HTMLDivElement | null>(null)
	const [localPublishedUrl, setLocalPublishedUrl] = useState("")
	const [showActionLabels, setShowActionLabels] = useState(true)
	const sourceReady = opsArtifacts.source || localPublishedUrl.trim().length > 0
	const canManagePublishedUrl = Boolean(onBindPublishedUrl || onLoadPublishedUrl)
	const canOpenDataPopover = Boolean(
		onPostPublishRefresh || onConfigureAutoSync || onLoadOpsSource,
	)
	const actionLabelMinWidth = sourceReady
		? FULL_ACTION_LABEL_MIN_WIDTH
		: COMPACT_ACTION_LABEL_MIN_WIDTH
	const handleOpenPost = useCallback(() => {
		const rect = cardRef.current?.getBoundingClientRect()
		const canAnimateFromCard = Boolean(rect && rect.width > 0 && rect.height > 0)
		onOpenPost(
			{ platform, index },
			canAnimateFromCard && rect
				? {
						rect: {
							left: rect.left,
							top: rect.top,
							width: rect.width,
							height: rect.height,
						},
						title,
						subtitle,
						postId,
					}
				: undefined,
		)
	}, [index, onOpenPost, platform, postId, subtitle, title])

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

	const cardContent = (
		<div
			ref={cardRef}
			className={cn(
				"relative",
				opening && "self-media-post-card-opening",
				openingDimmed && "self-media-post-card-dimmed",
			)}
			style={openingStyle}
			data-testid={`self-media-home-post-card-${postId}`}
		>
			<button
				type="button"
				className="self-media-post-card-button group flex min-h-[140px] w-full cursor-pointer flex-col gap-3 rounded-[24px] bg-[#ffffff] p-[20px] pb-[52px] text-left shadow-[inset_0_1px_rgba(255,255,255,0.75),0_10px_30px_rgba(47,43,36,0.06)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				onClick={handleOpenPost}
				data-testid={`self-media-home-post-open-${postId}`}
			>
				<div className="flex items-start gap-4">
					<div
						className={cn(
							"self-media-post-card-preview flex shrink-0 items-center justify-center overflow-hidden bg-[#f4f4f5] text-[#71717a]",
							"rounded-[16px]",
							isCardPlatform(platform) ? "h-[5.5rem] w-[4.125rem]" : "h-16 w-16",
						)}
					>
						<SelfMediaPostArticlePreview
							item={item}
							attachmentList={attachmentList}
							postId={postId}
						/>
					</div>
					<div className="self-media-post-card-copy min-w-0 flex-1 space-y-1.5 pt-1">
						<div className="flex min-w-0 items-center gap-2">
							<h3 className="min-w-0 truncate text-[15px] font-[760] text-[#18181b]">
								{title}
							</h3>
							<SelfMediaPostLifecycleStatus
								opsArtifacts={opsArtifacts}
								postId={postId}
							/>
						</div>
						{subtitle ? (
							<p className="line-clamp-2 text-[12px] leading-[1.6] text-[#71717a]">
								{subtitle}
							</p>
						) : null}
					</div>
				</div>
				{engagementItems.length > 0 ? (
					<div
						className="self-media-post-card-engagement flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1.5 pr-24 pt-1 text-[12px] font-[500] text-[#71717a]"
						data-testid={`self-media-home-post-engagement-${postId}`}
					>
						{engagementItems.map((metric) => (
							<span
								key={metric.key}
								className="inline-flex min-w-0 items-center gap-1.5"
							>
								<metric.Icon className="h-3.5 w-3.5 shrink-0" />
								<span className="truncate">
									{t(metric.labelKey)} {metric.value}
								</span>
							</span>
						))}
					</div>
				) : null}
			</button>
			<div
				className="self-media-post-card-artifacts absolute bottom-[18px] left-[20px] flex items-center gap-2"
				data-testid={`self-media-home-post-ops-artifacts-${postId}`}
			>
				{getOpsArtifactItems(opsArtifacts).map((artifact) =>
					artifact.key === "source" && canManagePublishedUrl ? (
						<SelfMediaPostPublishedLinkPopover
							key={artifact.key}
							item={item}
							postId={postId}
							sourceReady={sourceReady}
							trigger="artifact"
							artifactReady={artifact.ready}
							artifactReadyClassName={artifact.readyClassName}
							animation={opsArtifactAnimations?.[artifact.key]}
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
									"relative flex h-6 w-6 items-center justify-center rounded-full transition-colors",
									artifact.ready
										? artifact.readyClassName
										: "bg-[#f4f4f5] text-[#71717a]/60",
									opsArtifactAnimations?.[artifact.key] === "updated" &&
										"animate-bounce",
								)}
								aria-label={t(artifact.labelKey)}
								data-animation={opsArtifactAnimations?.[artifact.key]}
								data-ready={artifact.ready ? "true" : "false"}
								data-testid={`self-media-home-post-ops-artifact-${postId}-${artifact.key}`}
							>
								{opsArtifactAnimations?.[artifact.key] === "created" ? (
									<SelfMediaPostArtifactConfetti
										postId={postId}
										artifactKey={artifact.key}
									/>
								) : null}
								<artifact.Icon className="size-3.5" aria-hidden="true" />
							</span>
						</MagicTooltip>
					),
				)}
			</div>
			<div
				className="self-media-post-card-actions absolute bottom-[16px] right-[16px] flex max-w-[calc(100%-6rem)] flex-wrap items-center justify-end gap-2"
				data-label-mode={showActionLabels ? "expanded" : "compact"}
				data-testid={`self-media-home-post-actions-${postId}`}
			>
				{onRequestPrePublishAnalysis ? (
					<SelfMediaPostActionButton
						label={t("detail.selfMedia.analysis.action")}
						Icon={ClipboardCheck}
						showLabel={showActionLabels}
						onClick={() => onRequestPrePublishAnalysis({ platform, index })}
						dataTestId={`self-media-home-post-analysis-${postId}`}
					/>
				) : null}
				{!sourceReady && canManagePublishedUrl ? (
					<SelfMediaPostPublishedLinkPopover
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
				{sourceReady && canOpenDataPopover ? (
					<SelfMediaPostDataPopover
						item={item}
						postId={postId}
						label={t("detail.selfMedia.home.dataSyncNow")}
						showLabel={showActionLabels}
						onPostPublishRefresh={onPostPublishRefresh}
						onConfigureAutoSync={onConfigureAutoSync}
						onLoadOpsSource={onLoadOpsSource}
					/>
				) : null}
				{sourceReady && onOpenOpsReview ? (
					<SelfMediaPostActionButton
						label={t("detail.selfMedia.home.openOpsReview")}
						Icon={BarChart3}
						showLabel={showActionLabels}
						variant="primary"
						onClick={() => onOpenOpsReview(item)}
						dataTestId={`self-media-home-post-review-card-${postId}`}
					/>
				) : null}
			</div>
		</div>
	)

	return (
		<SelfMediaPostContextMenu
			item={item}
			title={title}
			onRenamePost={onRenamePost}
			onDeletePost={onDeletePost}
			t={t}
		>
			{cardContent}
		</SelfMediaPostContextMenu>
	)
}

function getEngagementItems(opsMetrics?: SelfMediaPostOpsMetricsPayload | null) {
	const items: Array<{
		key: string
		labelKey: string
		value: string
		Icon: typeof ThumbsUp
	}> = []
	const reads = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"reads",
		"readCount",
		"read_count",
		"viewCount",
		"views",
		"view_count",
	])
	const likes = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"likes",
		"feedLikes",
		"likeCount",
		"like_count",
	])
	const comments = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"comments",
		"commentCount",
		"commentsCount",
		"comment_count",
	])

	if (reads) {
		items.push({
			key: "reads",
			labelKey: "detail.selfMedia.home.engagement.reads",
			value: reads,
			Icon: Eye,
		})
	}
	if (likes) {
		items.push({
			key: "likes",
			labelKey: "detail.selfMedia.home.engagement.likes",
			value: likes,
			Icon: ThumbsUp,
		})
	}
	if (comments) {
		items.push({
			key: "comments",
			labelKey: "detail.selfMedia.home.engagement.comments",
			value: comments,
			Icon: MessageCircle,
		})
	}
	return items
}

function getOpsMetricDisplayValue(
	metrics: Record<string, SelfMediaPostOpsMetricValue> | undefined,
	keys: string[],
) {
	if (!metrics) return ""
	for (const key of keys) {
		const displayValue = normalizeMetricDisplayValue(metrics[key])
		if (displayValue) return displayValue
	}
	return ""
}

function normalizeMetricDisplayValue(value: SelfMediaPostOpsMetricValue | undefined) {
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (trimmed) return trimmed
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value)
	}
	if (value && typeof value === "object") {
		return normalizeMetricDisplayValue(value.value)
	}
	return ""
}

function getOpsArtifactItems(artifacts: SelfMediaPostOpsArtifacts) {
	return [
		{
			key: "source",
			Icon: Link2,
			ready: artifacts.source,
			readyClassName: "bg-[#ff776c]/10 text-[#ff776c]",
			labelKey: artifacts.source
				? "detail.selfMedia.home.opsArtifacts.sourceReady"
				: "detail.selfMedia.home.opsArtifacts.sourceMissing",
		},
		{
			key: "metrics",
			Icon: BarChart3,
			ready: artifacts.metrics,
			readyClassName: "bg-[#ffd637]/20 text-[#d4ad00]",
			labelKey: artifacts.metrics
				? "detail.selfMedia.home.opsArtifacts.metricsReady"
				: "detail.selfMedia.home.opsArtifacts.metricsMissing",
		},
		{
			key: "comments",
			Icon: MessageCircle,
			ready: artifacts.comments,
			readyClassName: "bg-[#cdeb55]/20 text-[#8ba320]",
			labelKey: artifacts.comments
				? "detail.selfMedia.home.opsArtifacts.commentsReady"
				: "detail.selfMedia.home.opsArtifacts.commentsMissing",
		},
		{
			key: "review",
			Icon: ClipboardCheck,
			ready: artifacts.review,
			readyClassName: "bg-[#18181b]/10 text-[#18181b]",
			labelKey: artifacts.review
				? "detail.selfMedia.home.opsArtifacts.reviewReady"
				: "detail.selfMedia.home.opsArtifacts.reviewMissing",
		},
	]
}

export default SelfMediaPostCard
