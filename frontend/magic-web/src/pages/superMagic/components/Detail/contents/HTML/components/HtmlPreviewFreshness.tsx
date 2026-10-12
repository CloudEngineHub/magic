import { useEffect, useState } from "react"
import { Check, Loader2, RefreshCw, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import type { HtmlPreviewPhase } from "../hooks/useHtmlPreviewFreshness"
import type { SaveConfirmationStage } from "../hooks/useSaveConfirmation"

export function HtmlPreviewFreshness({
	phase,
	hasRendered,
	onRetry,
	saveStage = "idle",
	previewStatusEnabled = true,
}: {
	phase: HtmlPreviewPhase
	hasRendered: boolean
	onRetry: () => void
	saveStage?: SaveConfirmationStage
	/** Preview refresh notices are meaningless while the editor is open. */
	previewStatusEnabled?: boolean
}) {
	const { t } = useTranslation("super")
	const [dismissed, setDismissed] = useState(false)
	// Keep dismissal through processing/rendering; the next completed cycle resets it.
	useEffect(() => {
		if (phase === "idle" && saveStage === "idle") setDismissed(false)
	}, [phase, saveStage])

	const isFailed = previewStatusEnabled && phase === "failed"
	// Save feedback owns the notice, so the refreshes it triggers do not flash again.
	const showSaveStatus = !isFailed && saveStage !== "idle"
	const showPreviewStatus =
		previewStatusEnabled && phase !== "idle" && (hasRendered || phase === "failed")
	if (dismissed || (!isFailed && !showSaveStatus && !showPreviewStatus)) return null

	const label = isFailed
		? t("htmlEditor.previewRefreshFailed")
		: showSaveStatus
			? saveStage === "saved"
				? t("common.saveSuccess")
				: t("detail.fileSave.syncing")
			: t("htmlEditor.previewUpdating")

	// Transient save chips dismiss themselves; only durable preview states need a close control.
	const showDismiss = !showSaveStatus

	return (
		<div
			role="status"
			aria-live="polite"
			// Glass chip over the canvas: light enough to sit on slides without looking like a modal.
			className={cn(
				"absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5",
				"rounded-full border border-border/50 bg-background/85 px-2.5 py-1",
				"text-xs text-muted-foreground shadow-sm backdrop-blur-md",
				"duration-200 animate-in fade-in-0 zoom-in-95",
				isFailed && "border-destructive/30 text-destructive",
			)}
			data-testid="html-preview-freshness"
		>
			{showSaveStatus ? (
				saveStage === "saved" ? (
					<Check className="size-3.5 shrink-0" strokeWidth={2} />
				) : (
					<Loader2 className="size-3.5 shrink-0 animate-spin" strokeWidth={2} />
				)
			) : !isFailed ? (
				<Loader2 className="size-3.5 shrink-0 animate-spin" strokeWidth={2} />
			) : null}
			<span className="truncate font-normal leading-none">{label}</span>
			{isFailed && (
				<MagicTooltip title={t("htmlEditor.previewRefreshTooltip")}>
					<Button
						variant="ghost"
						size="sm"
						onClick={onRetry}
						className="h-6 gap-1 rounded-full px-2 text-xs"
					>
						<RefreshCw className="size-3.5" strokeWidth={2} />
						{t("htmlEditor.previewRetry")}
					</Button>
				</MagicTooltip>
			)}
			{showDismiss && (
				<MagicTooltip title={t("common.close")}>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
						aria-label={t("common.close")}
						onClick={() => setDismissed(true)}
					>
						<X className="size-3.5" strokeWidth={2} />
					</Button>
				</MagicTooltip>
			)}
		</div>
	)
}
