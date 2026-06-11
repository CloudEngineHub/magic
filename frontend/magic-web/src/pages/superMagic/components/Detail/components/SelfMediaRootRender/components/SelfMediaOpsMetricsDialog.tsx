import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Database, Loader2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type {
	SelfMediaFileStorageService,
	SelfMediaPostOpsCommentsPayload,
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsReviewPayload,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"

interface SelfMediaOpsMetricsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: SelfMediaPlatformPostItem | null
	fileStorageService: SelfMediaFileStorageService | null
	onFetchPublishedData?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<void> | void
}

interface MetricsFormValues {
	sourceUrl: string
	sourceOriginalUrl: string
	sourceFetchStatus: SelfMediaPostOpsSourcePayload["fetchStatus"] | "unknown"
	sourceLastFetchedAt: string
	sourceFailureReason: string
	reads: string
	likes: string
	saves: string
	comments: string
	shares: string
	follows: string
	conversions: string
	notes: string
	feedbackSummary: string
	commentsRaw: string
	reviewContent: string
}

const METRIC_FIELDS: Array<{
	key: keyof Pick<
		MetricsFormValues,
		"reads" | "likes" | "saves" | "comments" | "shares" | "follows" | "conversions"
	>
	labelKey: string
}> = [
	{ key: "reads", labelKey: "detail.selfMedia.opsMetrics.fields.reads" },
	{ key: "likes", labelKey: "detail.selfMedia.opsMetrics.fields.likes" },
	{ key: "saves", labelKey: "detail.selfMedia.opsMetrics.fields.saves" },
	{ key: "comments", labelKey: "detail.selfMedia.opsMetrics.fields.comments" },
	{ key: "shares", labelKey: "detail.selfMedia.opsMetrics.fields.shares" },
	{ key: "follows", labelKey: "detail.selfMedia.opsMetrics.fields.follows" },
	{ key: "conversions", labelKey: "detail.selfMedia.opsMetrics.fields.conversions" },
]

function SelfMediaOpsMetricsDialog({
	open,
	onOpenChange,
	target,
	fileStorageService,
	onFetchPublishedData,
}: SelfMediaOpsMetricsDialogProps) {
	const { t } = useTranslation("super")
	const [values, setValues] = useState<MetricsFormValues>(() => buildInitialValues())
	const [loadedValues, setLoadedValues] = useState<MetricsFormValues>(() => buildInitialValues())
	const [mode, setMode] = useState<"preview" | "edit">("preview")
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [fetching, setFetching] = useState(false)
	const [manualDataOpen, setManualDataOpen] = useState(false)
	const title =
		target?.post.meta.feedTitle ||
		target?.post.meta.title ||
		t("detail.selfMedia.common.untitledPost")
	const canPersist = Boolean(fileStorageService && target)
	const publishedUrl = values.sourceUrl.trim()
	const canUsePublishedUrl = publishedUrl.length > 0
	const sourceStatusLabelKey = getSourceStatusLabelKey(values.sourceFetchStatus)

	useEffect(() => {
		if (!open) return
		const initialValues = buildInitialValues()
		setValues(initialValues)
		setLoadedValues(initialValues)
		setMode("preview")
		setManualDataOpen(false)
		if (!fileStorageService || !target) return

		let cancelled = false
		setLoading(true)
		void Promise.all([
			fileStorageService.loadPostOpsSource(target.entry.entry),
			fileStorageService.loadPostOpsMetrics(target.entry.entry),
			fileStorageService.loadPostOpsComments(target.entry.entry),
			fileStorageService.loadPostOpsReview(target.entry.entry),
		])
			.then(([sourcePayload, metricsPayload, commentsPayload, reviewPayload]) => {
				if (cancelled) return
				const nextValues = buildValuesFromPayload({
					sourcePayload,
					metricsPayload,
					commentsPayload,
					reviewPayload,
				})
				setValues(nextValues)
				setLoadedValues(nextValues)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [fileStorageService, open, target])

	const filledMetricCount = useMemo(
		() => METRIC_FIELDS.filter(({ key }) => values[key].trim().length > 0).length,
		[values],
	)

	const handleFieldChange = useCallback((field: keyof MetricsFormValues, value: string) => {
		setValues((prev) => ({ ...prev, [field]: value }))
	}, [])

	const savePostOpsSource = useCallback(
		async (options?: { forcePending?: boolean }) => {
			if (!fileStorageService || !target || !publishedUrl) return
			const shouldKeepSourceStatus =
				!options?.forcePending &&
				publishedUrl === values.sourceOriginalUrl.trim() &&
				values.sourceFetchStatus !== "unknown"
			await fileStorageService.savePostOpsSource(target.entry.entry, {
				version: 1,
				updatedAt: new Date().toISOString(),
				platform: target.platform,
				publishedUrl,
				fetchStatus: shouldKeepSourceStatus ? values.sourceFetchStatus : "pending",
				lastFetchedAt: shouldKeepSourceStatus
					? values.sourceLastFetchedAt || undefined
					: undefined,
				failureReason: shouldKeepSourceStatus
					? values.sourceFailureReason || undefined
					: undefined,
			})
		},
		[
			fileStorageService,
			publishedUrl,
			target,
			values.sourceFailureReason,
			values.sourceFetchStatus,
			values.sourceLastFetchedAt,
			values.sourceOriginalUrl,
		],
	)

	const handleSave = useCallback(async () => {
		if (!fileStorageService || !target || !publishedUrl) return
		setSaving(true)
		try {
			await savePostOpsSource()
			const metrics = Object.fromEntries(
				METRIC_FIELDS.map(({ key }) => [key, values[key].trim()]).filter(
					([, value]) => value,
				),
			)
			const metricNotes = values.notes.trim()
			if (Object.keys(metrics).length > 0 || metricNotes) {
				await fileStorageService.savePostOpsMetrics(target.entry.entry, {
					version: 1,
					updatedAt: new Date().toISOString(),
					source: "user",
					metrics,
					notes: metricNotes || undefined,
				})
			}
			const feedbackSummary = values.feedbackSummary.trim()
			const commentSamples = parseCommentSamples(values.commentsRaw)
			if (feedbackSummary || commentSamples.length > 0) {
				await fileStorageService.savePostOpsComments(target.entry.entry, {
					version: 1,
					updatedAt: new Date().toISOString(),
					source: "user",
					summary: feedbackSummary || undefined,
					comments: commentSamples,
					insights: feedbackSummary ? [feedbackSummary] : undefined,
				})
			}
			const reviewContent = values.reviewContent.trim()
			if (reviewContent) {
				await fileStorageService.savePostOpsReview(target.entry.entry, {
					content: reviewContent,
				})
			}
			onOpenChange(false)
		} finally {
			setSaving(false)
		}
	}, [fileStorageService, onOpenChange, publishedUrl, savePostOpsSource, target, values])

	const handleFetchPublishedData = useCallback(async () => {
		if (!target || !publishedUrl || !onFetchPublishedData) return
		setFetching(true)
		try {
			await savePostOpsSource({ forcePending: true })
			await onFetchPublishedData(target, publishedUrl)
			onOpenChange(false)
		} finally {
			setFetching(false)
		}
	}, [onFetchPublishedData, onOpenChange, publishedUrl, savePostOpsSource, target])

	const handleCancel = useCallback(() => {
		if (mode === "edit") {
			setValues(loadedValues)
			setManualDataOpen(false)
			setMode("preview")
			return
		}
		onOpenChange(false)
	}, [loadedValues, mode, onOpenChange])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="grid max-h-[88vh] !max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
				data-testid="self-media-ops-metrics-dialog"
			>
				<DialogHeader className="gap-1 border-b bg-card px-5 py-4">
					<DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
						<Database className="size-4 text-primary" aria-hidden="true" />
						{t("detail.selfMedia.opsMetrics.title")}
					</DialogTitle>
					<DialogDescription className="text-xs">
						{t("detail.selfMedia.opsMetrics.description", { title })}
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-5">
					{loading ? (
						<div
							className="flex min-h-48 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium text-muted-foreground"
							data-testid="self-media-ops-metrics-loading"
						>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							<span>{t("detail.selfMedia.opsMetrics.loading")}</span>
						</div>
					) : mode === "preview" ? (
						<OpsMetricsPreview values={values} />
					) : (
						<div className="space-y-4">
							<section className="space-y-3 rounded-lg border bg-card p-3">
								<h3 className="text-sm font-medium text-foreground">
									{t("detail.selfMedia.opsMetrics.sections.source")}
								</h3>
								<label className="space-y-1.5">
									<span className="text-xs font-medium text-foreground">
										{t("detail.selfMedia.opsMetrics.fields.sourceUrl")}
									</span>
									<Input
										value={values.sourceUrl}
										onChange={(event) =>
											handleFieldChange("sourceUrl", event.target.value)
										}
										placeholder={t(
											"detail.selfMedia.opsMetrics.sourceUrlPlaceholder",
										)}
										aria-required="true"
										disabled={saving || fetching}
										data-testid="self-media-ops-source-url"
									/>
								</label>
								<div
									className={cn(
										"rounded border px-3 py-2 text-xs leading-relaxed",
										values.sourceFetchStatus === "fetched"
											? "border-primary/20 bg-primary/10 text-primary"
											: values.sourceFetchStatus === "failed"
												? "border-destructive/20 bg-destructive/10 text-destructive"
												: "border-border bg-muted/40 text-muted-foreground",
									)}
									data-testid="self-media-ops-source-status"
								>
									<div className="font-medium">{t(sourceStatusLabelKey)}</div>
									{values.sourceLastFetchedAt ? (
										<div>
											{t("detail.selfMedia.opsMetrics.sourceLastFetched", {
												time: values.sourceLastFetchedAt,
											})}
										</div>
									) : null}
									{values.sourceFailureReason ? (
										<div>
											{t("detail.selfMedia.opsMetrics.sourceFailureReason", {
												reason: values.sourceFailureReason,
											})}
										</div>
									) : null}
								</div>
								<div className="flex justify-end">
									<Button
										type="button"
										onClick={() => void handleFetchPublishedData()}
										disabled={
											!canPersist ||
											loading ||
											saving ||
											fetching ||
											!canUsePublishedUrl ||
											!onFetchPublishedData
										}
										data-testid="self-media-ops-fetch-published-data"
									>
										{fetching ? (
											<Loader2
												className="mr-1.5 size-4 animate-spin"
												aria-hidden="true"
											/>
										) : (
											<RefreshCw
												className="mr-1.5 size-4"
												aria-hidden="true"
											/>
										)}
										{fetching
											? t("detail.selfMedia.opsMetrics.fetchingPublishedData")
											: t("detail.selfMedia.opsMetrics.fetchPublishedData")}
									</Button>
								</div>
							</section>
							<section className="rounded-lg border bg-card">
								<button
									type="button"
									className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-foreground"
									onClick={() => setManualDataOpen((open) => !open)}
									aria-expanded={manualDataOpen}
									data-testid="self-media-ops-optional-toggle"
								>
									<span>{t("detail.selfMedia.opsMetrics.optionalToggle")}</span>
									<ChevronDown
										className={cn(
											"size-4 text-muted-foreground transition-transform",
											manualDataOpen ? "rotate-180" : "",
										)}
										aria-hidden="true"
									/>
								</button>
								{manualDataOpen ? (
									<div className="space-y-4 border-t p-3">
										<div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
											{t("detail.selfMedia.opsMetrics.summary", {
												count: filledMetricCount,
											})}
										</div>
										<section className="space-y-3">
											<h3 className="text-sm font-medium text-foreground">
												{t("detail.selfMedia.opsMetrics.sections.metrics")}
											</h3>
											<div className="grid gap-3 sm:grid-cols-2">
												{METRIC_FIELDS.map(({ key, labelKey }) => (
													<label key={key} className="space-y-1.5">
														<span className="text-xs font-medium text-foreground">
															{t(labelKey)}
														</span>
														<Input
															value={values[key]}
															onChange={(event) =>
																handleFieldChange(
																	key,
																	event.target.value,
																)
															}
															placeholder={t(
																"detail.selfMedia.opsMetrics.metricPlaceholder",
															)}
															disabled={saving || fetching}
															data-testid={`self-media-ops-metrics-${key}`}
														/>
													</label>
												))}
											</div>
											<label className="block space-y-1.5">
												<span className="text-xs font-medium text-foreground">
													{t("detail.selfMedia.opsMetrics.fields.notes")}
												</span>
												<textarea
													value={values.notes}
													onChange={(event) =>
														handleFieldChange(
															"notes",
															event.target.value,
														)
													}
													placeholder={t(
														"detail.selfMedia.opsMetrics.notesPlaceholder",
													)}
													disabled={saving || fetching}
													rows={3}
													className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
													data-testid="self-media-ops-metrics-notes"
												/>
											</label>
										</section>
										<section className="space-y-3">
											<h3 className="text-sm font-medium text-foreground">
												{t("detail.selfMedia.opsMetrics.sections.feedback")}
											</h3>
											<label className="block space-y-1.5">
												<span className="text-xs font-medium text-foreground">
													{t(
														"detail.selfMedia.opsMetrics.fields.feedbackSummary",
													)}
												</span>
												<textarea
													value={values.feedbackSummary}
													onChange={(event) =>
														handleFieldChange(
															"feedbackSummary",
															event.target.value,
														)
													}
													placeholder={t(
														"detail.selfMedia.opsMetrics.commentsSummaryPlaceholder",
													)}
													disabled={saving || fetching}
													rows={3}
													className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
													data-testid="self-media-ops-comments-summary"
												/>
											</label>
											<label className="block space-y-1.5">
												<span className="text-xs font-medium text-foreground">
													{t(
														"detail.selfMedia.opsMetrics.fields.commentSamples",
													)}
												</span>
												<textarea
													value={values.commentsRaw}
													onChange={(event) =>
														handleFieldChange(
															"commentsRaw",
															event.target.value,
														)
													}
													placeholder={t(
														"detail.selfMedia.opsMetrics.commentsRawPlaceholder",
													)}
													disabled={saving || fetching}
													rows={4}
													className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
													data-testid="self-media-ops-comments-raw"
												/>
											</label>
										</section>
										<section className="space-y-3">
											<h3 className="text-sm font-medium text-foreground">
												{t("detail.selfMedia.opsMetrics.sections.review")}
											</h3>
											<label className="block space-y-1.5">
												<span className="text-xs font-medium text-foreground">
													{t("detail.selfMedia.opsMetrics.fields.review")}
												</span>
												<textarea
													value={values.reviewContent}
													onChange={(event) =>
														handleFieldChange(
															"reviewContent",
															event.target.value,
														)
													}
													placeholder={t(
														"detail.selfMedia.opsMetrics.reviewPlaceholder",
													)}
													disabled={saving || fetching}
													rows={5}
													className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
													data-testid="self-media-ops-review-content"
												/>
											</label>
										</section>
									</div>
								) : null}
							</section>
						</div>
					)}
				</div>

				<DialogFooter className="border-t bg-card px-5 py-3">
					<Button
						type="button"
						variant="outline"
						onClick={handleCancel}
						disabled={saving || fetching}
					>
						{t("detail.selfMedia.opsMetrics.cancel")}
					</Button>
					{mode === "preview" ? (
						<Button
							type="button"
							onClick={() => setMode("edit")}
							disabled={loading}
							data-testid="self-media-ops-edit"
						>
							{t("detail.selfMedia.opsMetrics.edit")}
						</Button>
					) : (
						<Button
							type="button"
							onClick={() => void handleSave()}
							disabled={
								!canPersist || loading || saving || fetching || !canUsePublishedUrl
							}
							data-testid="self-media-ops-metrics-save"
						>
							{saving ? (
								<Loader2
									className="mr-1.5 size-4 animate-spin"
									aria-hidden="true"
								/>
							) : null}
							{saving
								? t("detail.selfMedia.opsMetrics.saving")
								: t("detail.selfMedia.opsMetrics.save")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function OpsMetricsPreview({ values }: { values: MetricsFormValues }) {
	const { t } = useTranslation("super")
	const sourceStatusLabelKey = getSourceStatusLabelKey(values.sourceFetchStatus)
	const metricsWithValues = METRIC_FIELDS.map(({ key, labelKey }) => ({
		key,
		label: t(labelKey),
		value: values[key].trim(),
	}))

	return (
		<div className="space-y-4" data-testid="self-media-ops-preview">
			<section className="space-y-3 rounded-lg border bg-card p-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<h3 className="text-sm font-medium text-foreground">
							{t("detail.selfMedia.opsMetrics.sections.source")}
						</h3>
						<p
							className="break-all text-xs text-muted-foreground"
							data-testid="self-media-ops-preview-source-url"
						>
							{values.sourceUrl || t("detail.selfMedia.opsMetrics.preview.empty")}
						</p>
					</div>
				</div>
				<SourceStatusBadge
					status={values.sourceFetchStatus}
					label={t(sourceStatusLabelKey)}
					lastFetchedAt={values.sourceLastFetchedAt}
					failureReason={values.sourceFailureReason}
				/>
			</section>
			<section className="space-y-3 rounded-lg border bg-card p-3">
				<h3 className="text-sm font-medium text-foreground">
					{t("detail.selfMedia.opsMetrics.sections.metrics")}
				</h3>
				<div className="grid gap-2 sm:grid-cols-2">
					{metricsWithValues.map((metric) => (
						<div key={metric.key} className="rounded border bg-muted/20 px-3 py-2">
							<div className="text-xs text-muted-foreground">{metric.label}</div>
							<div className="mt-1 text-sm font-medium text-foreground">
								{metric.value || t("detail.selfMedia.opsMetrics.preview.empty")}
							</div>
						</div>
					))}
				</div>
				{values.notes ? (
					<p className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
						{values.notes}
					</p>
				) : null}
			</section>
			<section className="space-y-3 rounded-lg border bg-card p-3">
				<h3 className="text-sm font-medium text-foreground">
					{t("detail.selfMedia.opsMetrics.sections.feedback")}
				</h3>
				<p className="whitespace-pre-wrap text-sm text-foreground">
					{values.feedbackSummary || t("detail.selfMedia.opsMetrics.preview.empty")}
				</p>
				{values.commentsRaw ? (
					<p className="whitespace-pre-wrap rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
						{values.commentsRaw}
					</p>
				) : null}
			</section>
			<section className="space-y-3 rounded-lg border bg-card p-3">
				<h3 className="text-sm font-medium text-foreground">
					{t("detail.selfMedia.opsMetrics.sections.review")}
				</h3>
				<p className="whitespace-pre-wrap text-sm text-foreground">
					{values.reviewContent || t("detail.selfMedia.opsMetrics.preview.empty")}
				</p>
			</section>
		</div>
	)
}

function SourceStatusBadge({
	status,
	label,
	lastFetchedAt,
	failureReason,
}: {
	status: MetricsFormValues["sourceFetchStatus"]
	label: string
	lastFetchedAt: string
	failureReason: string
}) {
	const { t } = useTranslation("super")

	return (
		<div
			className={cn(
				"rounded border px-3 py-2 text-xs leading-relaxed",
				status === "fetched"
					? "border-primary/20 bg-primary/10 text-primary"
					: status === "failed"
						? "border-destructive/20 bg-destructive/10 text-destructive"
						: "border-border bg-muted/40 text-muted-foreground",
			)}
			data-testid="self-media-ops-source-status"
		>
			<div className="font-medium">{label}</div>
			{lastFetchedAt ? (
				<div>
					{t("detail.selfMedia.opsMetrics.sourceLastFetched", {
						time: lastFetchedAt,
					})}
				</div>
			) : null}
			{failureReason ? (
				<div>
					{t("detail.selfMedia.opsMetrics.sourceFailureReason", {
						reason: failureReason,
					})}
				</div>
			) : null}
		</div>
	)
}

function buildInitialValues(): MetricsFormValues {
	return {
		sourceUrl: "",
		sourceOriginalUrl: "",
		sourceFetchStatus: "unknown",
		sourceLastFetchedAt: "",
		sourceFailureReason: "",
		reads: "",
		likes: "",
		saves: "",
		comments: "",
		shares: "",
		follows: "",
		conversions: "",
		notes: "",
		feedbackSummary: "",
		commentsRaw: "",
		reviewContent: "",
	}
}

function buildValuesFromPayload({
	sourcePayload,
	metricsPayload,
	commentsPayload,
	reviewPayload,
}: {
	sourcePayload: SelfMediaPostOpsSourcePayload | null
	metricsPayload: SelfMediaPostOpsMetricsPayload | null
	commentsPayload: SelfMediaPostOpsCommentsPayload | null
	reviewPayload: SelfMediaPostOpsReviewPayload | null
}): MetricsFormValues {
	const fallback = buildInitialValues()
	return {
		sourceUrl: sourcePayload?.publishedUrl ?? fallback.sourceUrl,
		sourceOriginalUrl: sourcePayload?.publishedUrl ?? fallback.sourceOriginalUrl,
		sourceFetchStatus: sourcePayload?.fetchStatus ?? fallback.sourceFetchStatus,
		sourceLastFetchedAt: sourcePayload?.lastFetchedAt ?? "",
		sourceFailureReason: sourcePayload?.failureReason ?? "",
		reads: metricsPayload?.metrics.reads ?? fallback.reads,
		likes: metricsPayload?.metrics.likes ?? fallback.likes,
		saves: metricsPayload?.metrics.saves ?? fallback.saves,
		comments: metricsPayload?.metrics.comments ?? fallback.comments,
		shares: metricsPayload?.metrics.shares ?? fallback.shares,
		follows: metricsPayload?.metrics.follows ?? fallback.follows,
		conversions: metricsPayload?.metrics.conversions ?? fallback.conversions,
		notes: metricsPayload?.notes ?? "",
		feedbackSummary: commentsPayload?.summary ?? "",
		commentsRaw: commentsPayload?.comments.length
			? stringifyCommentSamples(commentsPayload.comments)
			: fallback.commentsRaw,
		reviewContent: reviewPayload?.content ?? "",
	}
}

function getSourceStatusLabelKey(status: MetricsFormValues["sourceFetchStatus"]) {
	switch (status) {
		case "pending":
			return "detail.selfMedia.opsMetrics.sourceStatus.pending"
		case "fetched":
			return "detail.selfMedia.opsMetrics.sourceStatus.fetched"
		case "failed":
			return "detail.selfMedia.opsMetrics.sourceStatus.failed"
		default:
			return "detail.selfMedia.opsMetrics.sourceStatus.unknown"
	}
}

function stringifyCommentSamples(comments: SelfMediaPostOpsCommentsPayload["comments"]) {
	return comments
		.map((comment) =>
			[comment.author || "用户", comment.text, comment.intent].filter(Boolean).join("｜"),
		)
		.join("\n")
}

function parseCommentSamples(raw: string): SelfMediaPostOpsCommentsPayload["comments"] {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line, index) => {
			const [author, text, intent] = line.split(/[|｜]/).map((part) => part.trim())
			return {
				id: `comment-${index + 1}`,
				author: author || undefined,
				text: text || author || line,
				intent: intent || undefined,
			}
		})
}

export default SelfMediaOpsMetricsDialog
