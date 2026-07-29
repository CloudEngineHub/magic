import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import {
	buildActionItems,
	buildBriefItems,
	buildFunnelItems,
	buildImpactData,
	buildKpis,
	buildQualityData,
	buildTrendData,
	computeLatestDelta,
	resolveReviewHtmlRelativePath,
	REVIEW_DASHBOARD_STYLE,
	type SelfMediaOpsReviewData,
} from "./SelfMediaOpsReviewDashboard.helpers"
import {
	CaseSummary,
	CommentSignals,
	EmptyBlock,
	FullscreenReviewHeader,
	KpiStrip,
	NextActions,
	OpsReviewHeader,
	OpsReviewHtmlPreview,
	OpsReviewMarkdownPreview,
	ReportPreview,
} from "./SelfMediaOpsReviewDashboard.parts"
import { ChartsSection } from "./SelfMediaOpsReviewCharts"

export type { SelfMediaOpsReviewData } from "./SelfMediaOpsReviewDashboard.helpers"

interface SelfMediaOpsReviewDashboardProps {
	target: SelfMediaPlatformPostItem | null
	open: boolean
	allowEdit?: boolean
	onClose: () => void
	onEditData?: (target: SelfMediaPlatformPostItem) => void
	onSyncData?: (target: SelfMediaPlatformPostItem) => Promise<void> | void
	onLoadData?: (target: SelfMediaPlatformPostItem) => Promise<SelfMediaOpsReviewData>
	dataVersion?: string
}

function SelfMediaOpsReviewDashboard({
	target,
	open,
	allowEdit = true,
	onClose,
	onEditData,
	onSyncData,
	onLoadData,
	dataVersion,
}: SelfMediaOpsReviewDashboardProps) {
	const { t } = useTranslation("super")
	const reduceMotion = useReducedMotion()
	const [data, setData] = useState<SelfMediaOpsReviewData | null>(null)
	const [loading, setLoading] = useState(false)
	const [refreshingReview, setRefreshingReview] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [isReviewFullscreen, setIsReviewFullscreen] = useState(false)
	const title =
		target?.post.meta.feedTitle ||
		target?.post.meta.title ||
		t("detail.selfMedia.common.untitledPost")

	useEffect(() => {
		if (!open || !target || !onLoadData) return
		let cancelled = false
		setLoading(true)
		void onLoadData(target)
			.then((nextData) => {
				if (!cancelled) setData(nextData)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [dataVersion, onLoadData, open, target])

	const handleRefreshReview = useCallback(async () => {
		if (!target || !onLoadData) return
		setRefreshingReview(true)
		try {
			setData(await onLoadData(target))
		} finally {
			setRefreshingReview(false)
		}
	}, [onLoadData, target])

	useEffect(() => {
		if (!open) setIsReviewFullscreen(false)
	}, [open])

	useEffect(() => {
		if (!isReviewFullscreen) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsReviewFullscreen(false)
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [isReviewFullscreen])

	const readsDelta = useMemo(() => computeLatestDelta(data?.metrics, "reads"), [data?.metrics])
	const kpis = useMemo(() => buildKpis(data?.metrics, t), [data?.metrics, t])
	const briefItems = useMemo(() => buildBriefItems(data, readsDelta, t), [data, readsDelta, t])
	const trendData = useMemo(() => buildTrendData(data?.metrics), [data?.metrics])
	const impactData = useMemo(() => buildImpactData(data?.metrics, t), [data?.metrics, t])
	const qualityData = useMemo(() => buildQualityData(data?.metrics, t), [data?.metrics, t])
	const funnelItems = useMemo(() => buildFunnelItems(data?.metrics, t), [data?.metrics, t])
	const actionItems = useMemo(() => buildActionItems(data), [data])
	const sourceStatus = data?.source?.fetchStatus ?? "unknown"
	const reviewHtml = data?.reviewHtml?.content?.trim()
	const reviewMarkdown = data?.reviewMarkdown?.content?.trim()
	const hasReviewContent = Boolean(reviewHtml || reviewMarkdown)
	const reviewHtmlRelativePath = useMemo(
		() => resolveReviewHtmlRelativePath(target?.entry.entry),
		[target?.entry.entry],
	)
	const reviewHtmlFolderPath = useMemo(
		() => reviewHtmlRelativePath.replace(/[^/]*$/, "") || "/",
		[reviewHtmlRelativePath],
	)

	const handleSync = async () => {
		if (!target || !onSyncData) return
		setSyncing(true)
		try {
			await onSyncData(target)
		} finally {
			setSyncing(false)
		}
	}

	const renderReviewPreview = (isFullscreen = false) => {
		if (reviewHtml) {
			return (
				<OpsReviewHtmlPreview
					content={reviewHtml}
					htmlRelativeFolderPath={reviewHtmlFolderPath}
					isFullscreen={isFullscreen}
				/>
			)
		}
		if (reviewMarkdown) {
			return <OpsReviewMarkdownPreview content={reviewMarkdown} isFullscreen={isFullscreen} />
		}
		return (
			<div className="p-4">
				<EmptyBlock text={t("detail.selfMedia.opsReview.empty")} />
			</div>
		)
	}

	const fullscreenOverlay =
		typeof document === "undefined"
			? null
			: createPortal(
					<AnimatePresence>
						{isReviewFullscreen && hasReviewContent ? (
							<motion.div
								initial={
									reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }
								}
								animate={{ opacity: 1, scale: 1 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
								transition={{ duration: 0.16 }}
								className="fixed inset-0 z-[1000] flex min-h-0 flex-col bg-[#f8f8f9]"
								style={REVIEW_DASHBOARD_STYLE}
								data-testid="self-media-ops-review-fullscreen-overlay"
							>
								<FullscreenReviewHeader
									onExit={() => setIsReviewFullscreen(false)}
								/>
								<div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
									{renderReviewPreview(true)}
								</div>
							</motion.div>
						) : null}
					</AnimatePresence>,
					document.body,
				)

	return (
		<>
			<AnimatePresence>
				{open && target ? (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
						className="absolute inset-0 z-20 flex min-h-0 items-end overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.74),rgba(248,248,249,0.54)_34%,rgba(24,24,27,0.18)_100%)] px-2 pt-5 backdrop-blur-[2px] sm:px-4 sm:pt-8"
						data-testid="self-media-ops-review-backdrop"
					>
						<motion.section
							layoutId={`self-media-ops-review-${target.platform}-${target.index}-${target.entry.entry}`}
							initial={
								reduceMotion ? { opacity: 0 } : { opacity: 0, y: 56, scale: 0.985 }
							}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={
								reduceMotion ? { opacity: 0 } : { opacity: 0, y: 48, scale: 0.99 }
							}
							transition={{ type: "spring", stiffness: 360, damping: 36, mass: 0.82 }}
							className="relative flex h-[calc(100%-0.75rem)] min-h-0 w-full flex-col overflow-hidden rounded-t-[32px] border border-white/75 bg-white shadow-[0_-24px_70px_rgba(24,24,27,0.18),inset_0_1px_rgba(255,255,255,0.92)] backdrop-blur-xl sm:mx-auto sm:h-[calc(100%-1.5rem)] sm:max-w-[1440px]"
							style={REVIEW_DASHBOARD_STYLE}
							data-motion-origin="bottom"
							data-palette="case-review"
							data-testid="self-media-ops-review-dashboard"
						>
							<OpsReviewHeader
								title={title}
								target={target}
								sourceStatus={sourceStatus}
								syncing={syncing}
								onSync={allowEdit && onSyncData ? handleSync : undefined}
								onEditData={allowEdit ? onEditData : undefined}
								onClose={onClose}
							/>
							<div
								className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f8f8f9_42%,#f1f0eb_100%)] px-3 py-3 sm:px-6 sm:py-4"
								data-testid="self-media-ops-review-content"
							>
								{loading ? (
									<div className="flex min-h-64 items-center justify-center gap-2 rounded-[24px] bg-white/90 text-sm font-medium text-[#71717a] shadow-[inset_0_1px_rgba(255,255,255,0.82)]">
										<Loader2
											className="size-4 animate-spin"
											aria-hidden="true"
										/>
										{t("detail.selfMedia.opsMetrics.loading")}
									</div>
								) : (
									<div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-3">
										<section
											className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]"
											data-testid="self-media-ops-review-brief"
										>
											<CaseSummary
												briefItems={briefItems}
												readsDelta={readsDelta}
												trendData={trendData}
											/>
											<div className="grid min-w-0 gap-3">
												<NextActions items={actionItems} />
												<CommentSignals data={data} />
											</div>
										</section>
										<KpiStrip kpis={kpis} />
										<ChartsSection
											trendData={trendData}
											impactData={impactData}
											qualityData={qualityData}
											funnelItems={funnelItems}
											readsDelta={readsDelta}
										/>
										<ReportPreview
											hasReviewContent={hasReviewContent}
											refreshing={refreshingReview}
											onRefresh={onLoadData ? handleRefreshReview : undefined}
											onFullscreen={() => setIsReviewFullscreen(true)}
										>
											{renderReviewPreview()}
										</ReportPreview>
									</div>
								)}
							</div>
						</motion.section>
					</motion.div>
				) : null}
			</AnimatePresence>
			{fullscreenOverlay}
		</>
	)
}

export default SelfMediaOpsReviewDashboard
