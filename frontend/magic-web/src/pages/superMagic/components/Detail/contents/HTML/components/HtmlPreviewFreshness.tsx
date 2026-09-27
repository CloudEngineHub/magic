import { useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import type { HtmlPreviewPhase } from "../hooks/useHtmlPreviewFreshness"

export function HtmlPreviewFreshness({
	phase,
	hasRendered,
	onRetry,
}: {
	phase: HtmlPreviewPhase
	hasRendered: boolean
	onRetry: () => void
}) {
	const { t } = useTranslation("super")
	const [dismissed, setDismissed] = useState(false)
	// Keep dismissal through processing/rendering; the next completed cycle resets it.
	useEffect(() => {
		if (phase === "idle") setDismissed(false)
	}, [phase])
	if (dismissed || phase === "idle" || (!hasRendered && phase !== "failed")) return null
	return (
		<div
			role="status"
			aria-live="polite"
			// Overlay the preview so status changes never resize its iframe or cover the toolbar.
			className="absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-md"
			data-testid="html-preview-freshness"
		>
			<span>
				{phase === "failed"
					? t("htmlEditor.previewRefreshFailed")
					: t("htmlEditor.previewUpdating")}
			</span>
			{phase === "failed" && (
				<MagicTooltip title={t("htmlEditor.previewRefreshTooltip")}>
					<Button variant="ghost" size="sm" onClick={onRetry} className="h-7 gap-1.5">
						<RefreshCw size={16} />
						{t("htmlEditor.previewRetry")}
					</Button>
				</MagicTooltip>
			)}
			<MagicTooltip title={t("common.close")}>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					aria-label={t("common.close")}
					onClick={() => setDismissed(true)}
				>
					<X size={16} />
				</Button>
			</MagicTooltip>
		</div>
	)
}
