import { useCallback, useEffect, useMemo, useState } from "react"
import { Database, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
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
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"
import {
	buildInitialValues,
	buildValuesFromPayload,
	getSourceStatusLabelKey,
	METRIC_FIELDS,
	parseCommentSamples,
	toReviewHtmlDocument,
	type MetricsFormValues,
} from "./SelfMediaOpsMetricsDialog.helpers"
import {
	OpsMetricsManualDataSection,
	OpsMetricsSourceSection,
} from "./SelfMediaOpsMetricsDialog.parts"
import { selfMediaOverlayStyles } from "./selfMediaOverlayStyles"

interface SelfMediaOpsMetricsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: SelfMediaPlatformPostItem | null
	fileStorageService: SelfMediaFileStorageService | null
	onUpdateAutoSyncPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
		autoSync: NonNullable<SelfMediaPostOpsSourcePayload["autoSync"]>,
	) => Promise<boolean | void> | boolean | void
	onFetchPublishedData?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<void> | void
}

function SelfMediaOpsMetricsDialog({
	open,
	onOpenChange,
	target,
	fileStorageService,
	onUpdateAutoSyncPublishedUrl,
	onFetchPublishedData,
}: SelfMediaOpsMetricsDialogProps) {
	const { t } = useTranslation("super")
	const [values, setValues] = useState<MetricsFormValues>(() => buildInitialValues())
	const [loadedValues, setLoadedValues] = useState<MetricsFormValues>(() => buildInitialValues())
	const [sourceAutoSync, setSourceAutoSync] =
		useState<SelfMediaPostOpsSourcePayload["autoSync"]>()
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
		setSourceAutoSync(undefined)
		setManualDataOpen(false)
		if (!fileStorageService || !target) return

		let cancelled = false
		setLoading(true)
		void Promise.all([
			fileStorageService.loadPostOpsSource(target.entry.entry),
			fileStorageService.loadPostOpsMetrics(target.entry.entry),
			fileStorageService.loadPostOpsComments(target.entry.entry),
			fileStorageService.loadPostOpsReviewHtml(target.entry.entry),
			fileStorageService.loadPostOpsReview(target.entry.entry),
		])
			.then(
				([
					sourcePayload,
					metricsPayload,
					commentsPayload,
					reviewHtmlPayload,
					reviewPayload,
				]) => {
					if (cancelled) return
					const nextValues = buildValuesFromPayload({
						sourcePayload,
						metricsPayload,
						commentsPayload,
						reviewPayload: reviewHtmlPayload || reviewPayload,
					})
					setValues(nextValues)
					setLoadedValues(nextValues)
					setSourceAutoSync(sourcePayload?.autoSync)
				},
			)
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
			if (!fileStorageService || !target || !publishedUrl) return false
			const shouldKeepSourceStatus =
				!options?.forcePending &&
				publishedUrl === values.sourceOriginalUrl.trim() &&
				values.sourceFetchStatus !== "unknown"
			const sourceUrlChanged = publishedUrl !== values.sourceOriginalUrl.trim()
			const updatedAt = new Date().toISOString()
			let nextAutoSync = sourceAutoSync
			if (sourceUrlChanged && sourceAutoSync?.enabled && sourceAutoSync.taskId) {
				if (!onUpdateAutoSyncPublishedUrl) return false
				const updated = await onUpdateAutoSyncPublishedUrl(
					target,
					publishedUrl,
					sourceAutoSync,
				)
				if (updated === false) return false
				nextAutoSync = { ...sourceAutoSync, updatedAt }
			}
			await fileStorageService.savePostOpsSource(target.entry.entry, {
				version: 1,
				updatedAt,
				platform: target.platform,
				publishedUrl,
				fetchStatus: shouldKeepSourceStatus ? values.sourceFetchStatus : "pending",
				lastFetchedAt: shouldKeepSourceStatus
					? values.sourceLastFetchedAt || undefined
					: undefined,
				failureReason: shouldKeepSourceStatus
					? values.sourceFailureReason || undefined
					: undefined,
				...(nextAutoSync ? { autoSync: nextAutoSync } : {}),
			})
			return true
		},
		[
			fileStorageService,
			onUpdateAutoSyncPublishedUrl,
			publishedUrl,
			sourceAutoSync,
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
			const sourceSaved = await savePostOpsSource()
			if (!sourceSaved) return
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
				await fileStorageService.savePostOpsReviewHtml(target.entry.entry, {
					content: toReviewHtmlDocument(reviewContent, title),
				})
			}
			onOpenChange(false)
		} finally {
			setSaving(false)
		}
	}, [fileStorageService, onOpenChange, publishedUrl, savePostOpsSource, target, title, values])

	const handleFetchPublishedData = useCallback(async () => {
		if (!target || !publishedUrl || !onFetchPublishedData) return
		setFetching(true)
		try {
			const sourceSaved = await savePostOpsSource({ forcePending: true })
			if (!sourceSaved) return
			await onFetchPublishedData(target, publishedUrl)
			onOpenChange(false)
		} finally {
			setFetching(false)
		}
	}, [onFetchPublishedData, onOpenChange, publishedUrl, savePostOpsSource, target])

	const handleCancel = useCallback(() => {
		setValues(loadedValues)
		setManualDataOpen(false)
		onOpenChange(false)
	}, [loadedValues, onOpenChange])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={`grid max-h-[88vh] !max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 ${selfMediaOverlayStyles.dialogSurface}`}
				data-testid="self-media-ops-metrics-dialog"
			>
				<DialogHeader className={selfMediaOverlayStyles.dialogHeader}>
					<DialogTitle
						className={`flex items-center gap-2 ${selfMediaOverlayStyles.dialogTitle}`}
					>
						<Database className="size-4 text-[#18181b]" aria-hidden="true" />
						{t("detail.selfMedia.opsMetrics.title")}
					</DialogTitle>
					<DialogDescription className={selfMediaOverlayStyles.dialogDescription}>
						{t("detail.selfMedia.opsMetrics.description", { title })}
					</DialogDescription>
				</DialogHeader>

				<div className={selfMediaOverlayStyles.dialogBody}>
					{loading ? (
						<div
							className={`min-h-48 ${selfMediaOverlayStyles.loadingPanel}`}
							data-testid="self-media-ops-metrics-loading"
						>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							<span>{t("detail.selfMedia.opsMetrics.loading")}</span>
						</div>
					) : (
						<div className="space-y-4">
							<OpsMetricsSourceSection
								values={values}
								sourceStatusLabelKey={sourceStatusLabelKey}
								saving={saving}
								fetching={fetching}
								loading={loading}
								canPersist={canPersist}
								canUsePublishedUrl={canUsePublishedUrl}
								canFetchPublishedData={Boolean(onFetchPublishedData)}
								onFieldChange={handleFieldChange}
								onFetchPublishedData={() => void handleFetchPublishedData()}
							/>
							<OpsMetricsManualDataSection
								values={values}
								filledMetricCount={filledMetricCount}
								manualDataOpen={manualDataOpen}
								saving={saving}
								fetching={fetching}
								onToggleManualData={() => setManualDataOpen((open) => !open)}
								onFieldChange={handleFieldChange}
							/>
						</div>
					)}
				</div>

				<DialogFooter className={selfMediaOverlayStyles.dialogFooter}>
					<Button
						type="button"
						variant="outline"
						className={selfMediaOverlayStyles.secondaryButton}
						onClick={handleCancel}
						disabled={saving || fetching}
					>
						{t("detail.selfMedia.opsMetrics.cancel")}
					</Button>
					<Button
						type="button"
						className={selfMediaOverlayStyles.primaryButton}
						onClick={() => void handleSave()}
						disabled={
							!canPersist || loading || saving || fetching || !canUsePublishedUrl
						}
						data-testid="self-media-ops-metrics-save"
					>
						{saving ? (
							<Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
						) : null}
						{saving
							? t("detail.selfMedia.opsMetrics.saving")
							: t("detail.selfMedia.opsMetrics.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default SelfMediaOpsMetricsDialog
