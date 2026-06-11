import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
	ArrowDownRight,
	ArrowUpRight,
	FileText,
	Loader2,
	RefreshCw,
	Sparkles,
	Target,
	X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts"
import { Button } from "@/components/shadcn-ui/button"
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/shadcn-ui/chart"
import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor"
import { cn } from "@/lib/utils"
import IsolatedHTMLRenderer from "@/pages/superMagic/components/Detail/contents/HTML/IsolatedHTMLRenderer"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type {
	SelfMediaPostOpsCommentsPayload,
	SelfMediaPostOpsMetricValue,
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsReviewPayload,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"

export interface SelfMediaOpsReviewData {
	source: SelfMediaPostOpsSourcePayload | null
	metrics: SelfMediaPostOpsMetricsPayload | null
	comments: SelfMediaPostOpsCommentsPayload | null
	reviewHtml: SelfMediaPostOpsReviewPayload | null
	reviewMarkdown: SelfMediaPostOpsReviewPayload | null
}

interface SelfMediaOpsReviewDashboardProps {
	target: SelfMediaPlatformPostItem | null
	open: boolean
	onClose: () => void
	onEditData?: (target: SelfMediaPlatformPostItem) => void
	onSyncData?: (target: SelfMediaPlatformPostItem) => Promise<void> | void
	onLoadData?: (target: SelfMediaPlatformPostItem) => Promise<SelfMediaOpsReviewData>
}

type Translate = (key: string, options?: Record<string, unknown>) => string

const OPS_PALETTE = {
	ink: "#111827",
	muted: "#64748b",
	teal: "#0f766e",
	cyan: "#0284c7",
	amber: "#b45309",
	rose: "#be123c",
	indigo: "#4338ca",
	surface: "#f8fafc",
} as const

const REVIEW_DASHBOARD_STYLE = {
	"--ops-ink": OPS_PALETTE.ink,
	"--ops-muted": OPS_PALETTE.muted,
	"--ops-teal": OPS_PALETTE.teal,
	"--ops-cyan": OPS_PALETTE.cyan,
	"--ops-amber": OPS_PALETTE.amber,
	"--ops-rose": OPS_PALETTE.rose,
	"--ops-indigo": OPS_PALETTE.indigo,
	"--ops-surface": OPS_PALETTE.surface,
} as CSSProperties

const trendChartConfig = {
	reads: {
		label: "Reads",
		color: OPS_PALETTE.teal,
	},
	shares: {
		label: "Shares",
		color: OPS_PALETTE.cyan,
	},
	saves: {
		label: "Saves",
		color: OPS_PALETTE.indigo,
	},
} satisfies ChartConfig

const impactChartConfig = {
	value: {
		label: "Value",
		color: OPS_PALETTE.teal,
	},
} satisfies ChartConfig

const QUALITY_COLORS = [OPS_PALETTE.teal, OPS_PALETTE.indigo, OPS_PALETTE.cyan, OPS_PALETTE.amber]
const EMPTY_FILE_PATH_MAPPING = new Map<string, string>()
const NOOP_OPEN_NEW_TAB = () => undefined

function SelfMediaOpsReviewDashboard({
	target,
	open,
	onClose,
	onEditData,
	onSyncData,
	onLoadData,
}: SelfMediaOpsReviewDashboardProps) {
	const { t } = useTranslation("super")
	const reduceMotion = useReducedMotion()
	const [data, setData] = useState<SelfMediaOpsReviewData | null>(null)
	const [loading, setLoading] = useState(false)
	const [syncing, setSyncing] = useState(false)
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
	}, [onLoadData, open, target])

	const kpis = useMemo(() => buildKpis(data?.metrics, t), [data?.metrics, t])
	const trendData = useMemo(() => buildTrendData(data?.metrics), [data?.metrics])
	const impactData = useMemo(() => buildImpactData(data?.metrics, t), [data?.metrics, t])
	const qualityData = useMemo(() => buildQualityData(data?.metrics, t), [data?.metrics, t])
	const funnelItems = useMemo(() => buildFunnelItems(data?.metrics, t), [data?.metrics, t])
	const actionItems = useMemo(() => buildActionItems(data), [data])
	const briefItems = useMemo(
		() => buildBriefItems(data, computeLatestDelta(data?.metrics, "reads"), t),
		[data, t],
	)
	const readsDelta = useMemo(() => computeLatestDelta(data?.metrics, "reads"), [data?.metrics])
	const sourceStatus = data?.source?.fetchStatus ?? "unknown"
	const reviewHtml = data?.reviewHtml?.content?.trim()
	const reviewMarkdown = data?.reviewMarkdown?.content?.trim()
	const reviewHtmlRelativePath = useMemo(
		() => resolveReviewHtmlRelativePath(target?.entry.entry),
		[target?.entry.entry],
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

	return (
		<AnimatePresence>
			{open && target ? (
				<motion.section
					layoutId={`self-media-ops-review-${target.platform}-${target.index}-${target.entry.entry}`}
					initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
					transition={{ type: "spring", stiffness: 320, damping: 34 }}
					className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-background shadow-2xl"
					style={REVIEW_DASHBOARD_STYLE}
					data-palette="executive"
					data-testid="self-media-ops-review-dashboard"
				>
					<header className="flex shrink-0 items-center justify-between gap-3 border-b bg-[linear-gradient(90deg,#fff_0%,#f8fafc_58%,#eff6ff_100%)] px-4 py-3 sm:px-6">
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1 font-medium text-[var(--ops-teal)]">
									<Sparkles className="size-3.5" aria-hidden="true" />
									{t("detail.selfMedia.opsReview.title")}
								</span>
								<span
									className={cn(
										"rounded border px-1.5 py-0.5 font-medium",
										sourceStatus === "fetched"
											? "border-teal-200 bg-teal-50 text-teal-700"
											: sourceStatus === "failed"
												? "border-destructive/20 bg-destructive/10 text-destructive"
												: "border-border bg-muted/40",
									)}
								>
									{t(`detail.selfMedia.opsReview.sourceStatus.${sourceStatus}`)}
								</span>
							</div>
							<h2 className="truncate text-base font-semibold text-[var(--ops-ink)] sm:text-lg">
								{title}
							</h2>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleSync}
								disabled={!onSyncData || syncing}
							>
								{syncing ? (
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								) : (
									<RefreshCw className="size-4" aria-hidden="true" />
								)}
								<span className="hidden sm:inline">
									{t("detail.selfMedia.opsReview.sync")}
								</span>
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onEditData?.(target)}
								disabled={!onEditData}
							>
								<span>{t("detail.selfMedia.opsReview.edit")}</span>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={onClose}
								aria-label={t("detail.selfMedia.opsReview.close")}
								data-testid="self-media-ops-review-close"
							>
								<X className="size-4" aria-hidden="true" />
							</Button>
						</div>
					</header>

					<div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)] px-4 py-4 sm:px-6">
						{loading ? (
							<div className="flex min-h-64 items-center justify-center gap-2 rounded-lg border bg-card text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								{t("detail.selfMedia.opsMetrics.loading")}
							</div>
						) : (
							<div className="mx-auto flex max-w-7xl flex-col gap-3">
								<section
									className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]"
									data-testid="self-media-ops-review-brief"
								>
									<div className="rounded-lg border bg-white p-4 shadow-xs">
										<div className="mb-3 flex items-center justify-between gap-3">
											<div>
												<div className="text-xs font-medium uppercase text-[var(--ops-teal)]">
													{t("detail.selfMedia.opsReview.summaryTitle")}
												</div>
												<h3 className="mt-1 text-lg font-semibold text-[var(--ops-ink)]">
													{title}
												</h3>
											</div>
											<DeltaBadge delta={readsDelta} />
										</div>
										<div className="grid gap-2 sm:grid-cols-3">
											{briefItems.map((item) => (
												<div
													key={item.label}
													className="rounded-md border bg-[var(--ops-surface)] px-3 py-2"
												>
													<div className="text-[11px] text-[var(--ops-muted)]">
														{item.label}
													</div>
													<div className="mt-1 text-sm font-medium text-[var(--ops-ink)]">
														{item.value}
													</div>
												</div>
											))}
										</div>
									</div>
									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-actions"
									>
										<div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ops-ink)]">
											<Target className="size-4 text-[var(--ops-amber)]" />
											{t("detail.selfMedia.opsReview.actionsTitle")}
										</div>
										<div className="space-y-2">
											{actionItems.map((item, index) => (
												<div
													key={`${item}-${index}`}
													className="flex gap-2 rounded-md border bg-[var(--ops-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--ops-ink)]"
												>
													<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--ops-ink)] text-[10px] text-white">
														{index + 1}
													</span>
													<span>{item}</span>
												</div>
											))}
										</div>
									</section>
								</section>

								<section
									className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
									data-testid="self-media-ops-review-kpis"
								>
									{kpis.map((item) => (
										<div
											key={item.key}
											className="min-h-20 rounded-lg border bg-white p-3 shadow-xs"
										>
											<div className="text-xs text-muted-foreground">
												{item.label}
											</div>
											<div className="mt-1 text-2xl font-semibold text-[var(--ops-ink)]">
												{item.value}
											</div>
											{item.hint ? (
												<div className="mt-1 text-[11px] text-[var(--ops-muted)]">
													{item.hint}
												</div>
											) : null}
										</div>
									))}
								</section>

								<div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)_minmax(310px,0.72fr)]">
									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-trend"
									>
										<div className="mb-3 flex items-center justify-between gap-3">
											<h3 className="text-sm font-semibold text-[var(--ops-ink)]">
												{t("detail.selfMedia.opsReview.trendTitle")}
											</h3>
											<DeltaBadge delta={readsDelta} />
										</div>
										{trendData.length > 0 ? (
											<ChartContainer
												config={trendChartConfig}
												className="h-52 w-full"
											>
												<AreaChart data={trendData}>
													<CartesianGrid vertical={false} />
													<XAxis
														dataKey="label"
														tickLine={false}
														axisLine={false}
														tickMargin={8}
													/>
													<YAxis tickLine={false} axisLine={false} />
													<ChartTooltip
														content={<ChartTooltipContent />}
													/>
													<Area
														dataKey="reads"
														type="monotone"
														fill="var(--color-reads)"
														fillOpacity={0.16}
														stroke="var(--color-reads)"
														strokeWidth={2}
													/>
													<Area
														dataKey="shares"
														type="monotone"
														fill="var(--color-shares)"
														fillOpacity={0.1}
														stroke="var(--color-shares)"
														strokeWidth={2}
													/>
													<Area
														dataKey="saves"
														type="monotone"
														fill="var(--color-saves)"
														fillOpacity={0.08}
														stroke="var(--color-saves)"
														strokeWidth={2}
													/>
												</AreaChart>
											</ChartContainer>
										) : (
											<EmptyBlock
												text={t("detail.selfMedia.opsReview.empty")}
											/>
										)}
									</section>

									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-impact-map"
									>
										<h3 className="mb-3 text-sm font-semibold text-[var(--ops-ink)]">
											{t("detail.selfMedia.opsReview.impactTitle")}
										</h3>
										{impactData.length ? (
											<ChartContainer
												config={impactChartConfig}
												className="h-52 w-full"
											>
												<BarChart data={impactData} layout="vertical">
													<CartesianGrid horizontal={false} />
													<XAxis type="number" hide />
													<YAxis
														type="category"
														dataKey="label"
														tickLine={false}
														axisLine={false}
														width={68}
													/>
													<ChartTooltip
														content={<ChartTooltipContent />}
													/>
													<Bar
														dataKey="value"
														fill="var(--color-value)"
														radius={5}
													/>
												</BarChart>
											</ChartContainer>
										) : (
											<EmptyBlock
												text={t("detail.selfMedia.opsReview.empty")}
											/>
										)}
									</section>

									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-quality-mix"
									>
										<h3 className="mb-3 text-sm font-semibold text-[var(--ops-ink)]">
											{t("detail.selfMedia.opsReview.qualityTitle")}
										</h3>
										{qualityData.length ? (
											<div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
												<ChartContainer
													config={impactChartConfig}
													className="h-32 w-32"
												>
													<PieChart>
														<Pie
															data={qualityData}
															dataKey="value"
															nameKey="label"
															innerRadius={34}
															outerRadius={56}
															paddingAngle={3}
														>
															{qualityData.map((entry, index) => (
																<Cell
																	key={entry.label}
																	fill={
																		QUALITY_COLORS[
																			index %
																				QUALITY_COLORS.length
																		]
																	}
																/>
															))}
														</Pie>
														<ChartTooltip
															content={<ChartTooltipContent />}
														/>
													</PieChart>
												</ChartContainer>
												<div className="space-y-1.5">
													{qualityData.map((item, index) => (
														<div
															key={item.label}
															className="flex items-center justify-between gap-3 text-xs"
														>
															<span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--ops-muted)]">
																<span
																	className="size-2 rounded-full"
																	style={{
																		background:
																			QUALITY_COLORS[
																				index %
																					QUALITY_COLORS.length
																			],
																	}}
																/>
																<span className="truncate">
																	{item.label}
																</span>
															</span>
															<span className="font-medium text-[var(--ops-ink)]">
																{item.value}
															</span>
														</div>
													))}
												</div>
											</div>
										) : (
											<EmptyBlock
												text={t("detail.selfMedia.opsReview.empty")}
											/>
										)}
									</section>
								</div>

								<div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-efficiency-funnel"
									>
										<h3 className="mb-3 text-sm font-semibold text-[var(--ops-ink)]">
											{t("detail.selfMedia.opsReview.funnelTitle")}
										</h3>
										<div className="space-y-2.5">
											{funnelItems.map((item) => (
												<div key={item.key}>
													<div className="mb-1 flex items-center justify-between text-xs">
														<span className="text-[var(--ops-muted)]">
															{item.label}
														</span>
														<span className="font-medium text-[var(--ops-ink)]">
															{item.value}
														</span>
													</div>
													<div className="h-2 overflow-hidden rounded-full bg-slate-100">
														<div
															className="h-full rounded-full"
															style={{
																width: `${item.percent}%`,
																background: item.color,
															}}
														/>
													</div>
												</div>
											))}
										</div>
									</section>

									<section
										className="rounded-lg border bg-white p-4 shadow-xs"
										data-testid="self-media-ops-review-comments"
									>
										<div className="flex items-center justify-between gap-3">
											<h3 className="text-sm font-semibold text-[var(--ops-ink)]">
												{t("detail.selfMedia.opsReview.commentsTitle")}
											</h3>
											<span className="text-xs text-[var(--ops-muted)]">
												{t("detail.selfMedia.opsReview.conversionSignal")}
											</span>
										</div>
										<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
											{data?.comments?.summary ||
												t("detail.selfMedia.opsReview.empty")}
										</p>
										<div className="mt-3 space-y-2">
											{data?.comments?.comments
												?.slice(0, 3)
												.map((comment) => (
													<div
														key={comment.id}
														className="rounded-md border bg-muted/20 px-3 py-2 text-xs"
													>
														<div className="font-medium text-foreground">
															{comment.author || "User"}
														</div>
														<div className="mt-1 text-muted-foreground">
															{comment.text}
														</div>
													</div>
												))}
										</div>
									</section>
								</div>

								<section className="rounded-lg border bg-white shadow-xs">
									<div className="border-b px-4 py-3">
										<h3 className="text-sm font-semibold text-[var(--ops-ink)]">
											{t("detail.selfMedia.opsReview.reviewTitle")}
										</h3>
									</div>
									{reviewHtml ? (
										<OpsReviewHtmlPreview
											content={reviewHtml}
											relativeFilePath={reviewHtmlRelativePath}
										/>
									) : reviewMarkdown ? (
										<div
											className="max-h-[560px] overflow-auto p-5 text-sm leading-relaxed text-[var(--ops-ink)] [&_a]:text-[var(--ops-cyan)] [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:ml-5 [&_p]:mb-3 [&_strong]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc"
											data-testid="self-media-ops-review-markdown-preview"
										>
											<SimpleEditor
												isEditable={false}
												enableDragHandle={false}
												enableSearchReplace={false}
												className="!h-auto !overflow-visible [&_.simple-editor-content]:!h-auto [&_.simple-editor-content]:!overflow-visible [&_.simple-editor]:!p-0"
												content={reviewMarkdown}
											/>
										</div>
									) : (
										<div className="p-4">
											<EmptyBlock
												text={t("detail.selfMedia.opsReview.empty")}
											/>
										</div>
									)}
								</section>
							</div>
						)}
					</div>
				</motion.section>
			) : null}
		</AnimatePresence>
	)
}

function OpsReviewHtmlPreview({
	content,
	relativeFilePath,
}: {
	content: string
	relativeFilePath: string
}) {
	return (
		<div className="h-[560px] w-full overflow-hidden bg-white">
			<IsolatedHTMLRenderer
				content={content}
				rawSourceCode={content}
				sandboxType="iframe"
				filePathMapping={EMPTY_FILE_PATH_MAPPING}
				openNewTab={NOOP_OPEN_NEW_TAB}
				relative_file_path={relativeFilePath}
				isVisible
				containIframeOverscroll
				disableDynamicResourceInterception
			/>
		</div>
	)
}

function resolveReviewHtmlRelativePath(postEntryPath?: string) {
	const normalized = (postEntryPath || "").replace(/^\/+/, "")
	const postDir = normalized.endsWith("/post.json")
		? normalized.slice(0, -"post.json".length)
		: normalized.replace(/[^/]*$/, "")

	return `${postDir}ops/review.html`
}

function DeltaBadge({ delta }: { delta: number | null }) {
	const { t } = useTranslation("super")
	if (delta === null) return null
	const positive = delta >= 0
	const Icon = positive ? ArrowUpRight : ArrowDownRight
	return (
		<div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
			<Icon className={cn("size-3.5", positive ? "text-emerald-600" : "text-destructive")} />
			<span>{t("detail.selfMedia.opsReview.deltaReads")}</span>
			<span className="font-medium text-foreground">{positive ? `+${delta}` : delta}</span>
		</div>
	)
}

function EmptyBlock({ text }: { text: string }) {
	return (
		<div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
			<FileText className="size-5" aria-hidden="true" />
			{text}
		</div>
	)
}

function buildKpis(payload: SelfMediaPostOpsMetricsPayload | null | undefined, t: Translate) {
	const metrics = payload?.metrics ?? {}
	const derived = payload?.derivedMetrics ?? {}
	return [
		{
			key: "reads",
			label: t("detail.selfMedia.opsMetrics.fields.reads"),
			value: valueOf(metrics.reads),
			hint: t("detail.selfMedia.opsReview.kpiHints.reach"),
		},
		{
			key: "likes",
			label: t("detail.selfMedia.opsMetrics.fields.likes"),
			value: valueOf(metrics.likes),
			hint: t("detail.selfMedia.opsReview.kpiHints.preference"),
		},
		{
			key: "shares",
			label: t("detail.selfMedia.opsMetrics.fields.shares"),
			value: valueOf(metrics.shares),
			hint: t("detail.selfMedia.opsReview.kpiHints.spread"),
		},
		{
			key: "saves",
			label: t("detail.selfMedia.opsMetrics.fields.saves"),
			value: valueOf(metrics.saves ?? metrics.collects),
			hint: t("detail.selfMedia.opsReview.kpiHints.intent"),
		},
		{
			key: "engagementRate",
			label: t("detail.selfMedia.opsReview.engagementRate"),
			value: valueOf(derived.engagementRate),
			hint: t("detail.selfMedia.opsReview.kpiHints.efficiency"),
		},
	]
}

function buildTrendData(payload: SelfMediaPostOpsMetricsPayload | null | undefined) {
	const source = payload?.history?.length
		? payload.history
		: payload
			? [{ fetchedAt: payload.updatedAt, metrics: payload.metrics }]
			: []
	return source.map((item, index) => ({
		label: formatShortTime(item.fetchedAt, index),
		reads: numberOf(item.metrics.reads),
		shares: numberOf(item.metrics.shares),
		saves: numberOf(item.metrics.saves ?? item.metrics.collects),
	}))
}

function buildImpactData(payload: SelfMediaPostOpsMetricsPayload | null | undefined, t: Translate) {
	const metrics = payload?.metrics ?? {}
	return [
		{
			key: "likes",
			label: t("detail.selfMedia.opsMetrics.fields.likes"),
			value: numberOf(metrics.likes),
		},
		{
			key: "saves",
			label: t("detail.selfMedia.opsMetrics.fields.saves"),
			value: numberOf(metrics.saves ?? metrics.collects),
		},
		{
			key: "shares",
			label: t("detail.selfMedia.opsMetrics.fields.shares"),
			value: numberOf(metrics.shares),
		},
		{
			key: "comments",
			label: t("detail.selfMedia.opsMetrics.fields.comments"),
			value: numberOf(metrics.comments),
		},
	].filter((item): item is { key: string; label: string; value: number } => item.value !== null)
}

function buildQualityData(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
) {
	return buildImpactData(payload, t).filter((item) => item.value > 0)
}

function buildFunnelItems(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
) {
	const metrics = payload?.metrics ?? {}
	const reads = numberOf(metrics.reads) ?? 0
	const likes = numberOf(metrics.likes) ?? 0
	const saves = numberOf(metrics.saves ?? metrics.collects) ?? 0
	const shares = numberOf(metrics.shares) ?? 0
	const comments = numberOf(metrics.comments) ?? 0
	const intent = saves + comments + shares
	const engagement = likes + intent
	const max = Math.max(reads, engagement, intent, 1)
	return [
		{
			key: "reach",
			label: t("detail.selfMedia.opsReview.funnel.reach"),
			value: reads ? String(reads) : "—",
			percent: Math.max(8, Math.round((reads / max) * 100)),
			color: OPS_PALETTE.teal,
		},
		{
			key: "engagement",
			label: t("detail.selfMedia.opsReview.funnel.engagement"),
			value: engagement ? String(engagement) : "—",
			percent: Math.max(8, Math.round((engagement / max) * 100)),
			color: OPS_PALETTE.indigo,
		},
		{
			key: "intent",
			label: t("detail.selfMedia.opsReview.funnel.intent"),
			value: intent ? String(intent) : "—",
			percent: Math.max(8, Math.round((intent / max) * 100)),
			color: OPS_PALETTE.amber,
		},
	]
}

function buildBriefItems(
	data: SelfMediaOpsReviewData | null,
	readsDelta: number | null,
	t: Translate,
) {
	const metrics = data?.metrics?.metrics ?? {}
	const derived = data?.metrics?.derivedMetrics ?? {}
	const comments = data?.comments?.comments ?? []
	const consultationCount = comments.filter((comment) =>
		`${comment.intent ?? ""} ${comment.text}`.includes("咨询"),
	).length
	return [
		{
			label: t("detail.selfMedia.opsReview.brief.reachTrend"),
			value:
				readsDelta === null ? "—" : readsDelta >= 0 ? `+${readsDelta}` : String(readsDelta),
		},
		{
			label: t("detail.selfMedia.opsReview.brief.efficiency"),
			value: valueOf(derived.engagementRate),
		},
		{
			label: t("detail.selfMedia.opsReview.brief.intent"),
			value:
				consultationCount > 0
					? t("detail.selfMedia.opsReview.brief.consulting", {
							count: consultationCount,
						})
					: valueOf(metrics.saves ?? metrics.collects),
		},
	]
}

function buildActionItems(data: SelfMediaOpsReviewData | null) {
	const insights = data?.comments?.insights?.filter(Boolean) ?? []
	if (insights.length > 0) return insights.slice(0, 4)
	const summary = data?.comments?.summary?.trim()
	if (summary) return [summary]
	return [
		"复用高互动标题结构，补充更具体的使用场景。",
		"把评论区问题整理成下一篇的开头钩子。",
		"同步观察收藏和转发变化，判断内容是否具备二次传播价值。",
	]
}

function computeLatestDelta(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	key: string,
): number | null {
	if (!payload?.history || payload.history.length < 2) return null
	const previous = payload.history[payload.history.length - 2]
	const latest = payload.history[payload.history.length - 1]
	const previousValue = numberOf(previous?.metrics[key])
	const latestValue = numberOf(latest?.metrics[key])
	if (previousValue === null || latestValue === null) return null
	return latestValue - previousValue
}

function valueOf(value: SelfMediaPostOpsMetricValue | undefined) {
	if (value === null || value === undefined || value === "") return "—"
	if (typeof value === "object") return valueOf(value.value)
	return String(value)
}

function numberOf(value: SelfMediaPostOpsMetricValue | undefined): number | null {
	const raw = valueOf(value)
	if (raw === "—") return null
	const normalized = raw.replace(/,/g, "").trim()
	const multiplier = /w|万/i.test(normalized) ? 10000 : 1
	const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""))
	return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : null
}

function formatShortTime(value: string, index: number) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return `#${index + 1}`
	return `${date.getMonth() + 1}/${date.getDate()}`
}

export default SelfMediaOpsReviewDashboard
