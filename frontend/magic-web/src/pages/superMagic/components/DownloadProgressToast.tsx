import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"

interface DownloadProgressToastProps {
	progress?: number
	text?: string
	cancelText?: string
	onCancel?: () => void
	showPercentage?: boolean
}

function DownloadProgressToast({
	progress = 0,
	text,
	cancelText,
	onCancel,
	showPercentage = true,
}: DownloadProgressToastProps) {
	const { t } = useTranslation("super")
	const resolvedText = text ?? t("topicFiles.downloading")
	const resolvedCancelText = cancelText ?? t("topicFiles.downloadAbort")
	const normalizedProgress = Math.min(Math.max(progress, 0), 100)
	const displayText = showPercentage
		? `${resolvedText} (${Math.round(normalizedProgress)}%)`
		: resolvedText

	return (
		<div className="flex items-center gap-2">
			<span>{displayText}</span>
			{onCancel ? (
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-6 bg-destructive/10 px-2 text-xs text-destructive shadow-none hover:bg-destructive/15 hover:text-destructive"
					onClick={onCancel}
				>
					{resolvedCancelText}
				</Button>
			) : null}
		</div>
	)
}

export default memo(DownloadProgressToast)
