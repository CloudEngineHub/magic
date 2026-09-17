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
			className="flex min-w-0 flex-wrap items-center gap-2.5"
			data-testid="recording-summary-upload-toast"
		>
			<span className="min-w-0 flex-1 whitespace-normal text-[13px] leading-[21px] [overflow-wrap:anywhere]">
				{text}
			</span>
			{showRetry ? (
				<MagicTooltip title={t("recordingSummary.message.retryUploadTooltip")}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-[22px] shrink-0 rounded-[5px] border-primary/20 bg-primary/5 px-1.5 text-xs font-normal text-primary hover:bg-primary/10 hover:text-primary [@media(pointer:coarse)]:min-h-11"
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
