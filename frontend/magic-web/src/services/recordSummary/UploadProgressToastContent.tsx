import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"

interface UploadProgressToastContentProps {
	text: string
	showRetry?: boolean
	onRetry?: () => void
}

export function UploadProgressToastContent({
	text,
	showRetry = false,
	onRetry,
}: UploadProgressToastContentProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="inline-flex items-center gap-2"
			data-testid="recording-summary-upload-toast"
		>
			<span>{text}</span>
			{showRetry ? (
				<MagicTooltip title={t("recordingSummary.message.retryUploadTooltip")}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-6 shrink-0 border-primary/20 bg-primary/5 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
						data-testid="recording-summary-upload-retry-button"
						onClick={onRetry}
					>
						{t("recordingSummary.message.retryUpload")}
					</Button>
				</MagicTooltip>
			) : null}
		</div>
	)
}
