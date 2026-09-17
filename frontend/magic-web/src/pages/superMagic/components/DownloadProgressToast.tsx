import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Download } from "lucide-react"
import ProgressIndicator from "@/components/base/MagicProgressToast/ProgressIndicator"
import { cn } from "@/utils/cn"

interface DownloadProgressToastProps {
	progress?: number
	text?: string
	description?: string
	cancelText?: string
	onCancel?: () => void
	showPercentage?: boolean
}

function DownloadProgressToast({
	progress = 0,
	text,
	description,
	cancelText,
	onCancel,
	showPercentage = true,
}: DownloadProgressToastProps) {
	const { t } = useTranslation("super")
	const resolvedText = text ?? t("topicFiles.downloading")
	const resolvedCancelText = cancelText ?? t("common.cancel")
	const normalizedProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 100) : 0
	const progressBar = (
		<div
			className={cn(
				"h-1 overflow-hidden rounded-full bg-primary/10",
				description ? "mt-2.5 w-full" : "w-[100px] shrink-0",
			)}
			aria-hidden
		>
			<div
				className="h-full rounded-full bg-primary"
				style={{ width: `${normalizedProgress}%` }}
			/>
		</div>
	)

	return (
		<div className={cn("min-w-0", description && "py-1")}>
			<div className="flex flex-wrap items-center gap-2.5">
				<div className="flex min-w-0 flex-auto items-start gap-2.5">
					<span className="text-primary">
						<ProgressIndicator
							value={normalizedProgress}
							icon={<Download />}
							label={resolvedText}
						/>
					</span>
					<span
						className={cn(
							"min-w-0 text-[13px] leading-5 [overflow-wrap:anywhere]",
							description && "font-medium",
						)}
					>
						{resolvedText}
					</span>
				</div>
				{!description && progressBar}
				{showPercentage && (
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{Math.round(normalizedProgress)}%
					</span>
				)}
				{onCancel ? (
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-[22px] shrink-0 rounded-[5px] border border-destructive/15 bg-destructive/5 px-1.5 text-xs font-normal text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive [@media(pointer:coarse)]:min-h-11"
						onClick={onCancel}
					>
						{resolvedCancelText}
					</Button>
				) : null}
			</div>
			{description && (
				<>
					<div className="mt-[7px] text-xs leading-[19px] text-muted-foreground [overflow-wrap:anywhere]">
						{description}
					</div>
					{progressBar}
				</>
			)}
		</div>
	)
}

export default memo(DownloadProgressToast)
