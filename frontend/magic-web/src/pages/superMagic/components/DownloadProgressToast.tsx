import { memo } from "react"
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
	text = "下载中...",
	cancelText = "终止下载",
	onCancel,
	showPercentage = true,
}: DownloadProgressToastProps) {
	const normalizedProgress = Math.min(Math.max(progress, 0), 100)
	const displayText = showPercentage ? `${text} (${Math.round(normalizedProgress)}%)` : text

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
					{cancelText}
				</Button>
			) : null}
		</div>
	)
}

export default memo(DownloadProgressToast)
