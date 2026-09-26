import { RefreshCw } from "lucide-react"
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
	if (phase === "idle" || (!hasRendered && phase !== "failed")) return null
	return (
		<div
			role="status"
			aria-live="polite"
			className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-3 py-2 text-xs text-muted-foreground"
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
		</div>
	)
}
