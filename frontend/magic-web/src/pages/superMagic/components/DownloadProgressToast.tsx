import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Download } from "lucide-react"
import ProgressIndicator from "@/components/base/MagicProgressToast/ProgressIndicator"
import { cn } from "@/utils/cn"
import { DraggableCore } from "react-draggable"
import { useDownloadToastDrag } from "../hooks/useDownloadToastDrag"
import SmartTooltip from "@/components/other/SmartTooltip"

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
	const { anchorRef, nodeRef, position, dragging, onStart, onDrag, onStop } =
		useDownloadToastDrag()
	const resolvedText = text ?? t("topicFiles.downloading")
	const resolvedCancelText = cancelText ?? t("common.cancel")
	const normalizedProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 100) : 0

	return (
		<div
			ref={anchorRef}
			className="pointer-events-none w-max min-w-[min(360px,calc(100vw-24px))] max-w-[min(440px,calc(100vw-24px))]"
		>
			<DraggableCore
				nodeRef={nodeRef}
				cancel="button, a, input, textarea, select, [role='button']"
				onStart={onStart}
				onDrag={onDrag}
				onStop={onStop}
			>
				<div
					ref={nodeRef}
					className={cn(
						"pointer-events-auto min-w-0 select-none rounded-xl border border-border bg-popover px-4 py-2.5 text-popover-foreground shadow-md",
						dragging ? "cursor-grabbing" : "cursor-grab",
					)}
					style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<div className="flex items-center gap-2.5">
						<div className="flex min-w-0 shrink items-center gap-2.5">
							<span className="shrink-0 text-primary">
								<ProgressIndicator
									value={normalizedProgress}
									icon={<Download />}
									label={resolvedText}
								/>
							</span>
							<SmartTooltip
								maxLines={0}
								disabled={dragging}
								placement="bottom"
								className={cn(
									"download-progress-label min-w-0 text-[13px] leading-5 md:overflow-hidden md:text-ellipsis",
									description && "font-medium",
								)}
							>
								{resolvedText}
							</SmartTooltip>
						</div>
						{/* 桌面长文案先扩宽再省略；手机保留完整换行文案，缩短进度条为取消操作留空间。 */}
						<div
							className="h-1 w-20 min-w-20 shrink-0 grow overflow-hidden rounded-full bg-primary/10 max-md:w-6 max-md:min-w-6"
							aria-hidden
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${normalizedProgress}%` }}
							/>
						</div>
						{(showPercentage || onCancel) && (
							<div className="flex shrink-0 items-center gap-2.5">
								{showPercentage && (
									<span className="text-xs tabular-nums text-muted-foreground">
										{Math.round(normalizedProgress)}%
									</span>
								)}
								{onCancel && (
									<Button
										type="button"
										variant="secondary"
										size="sm"
										className="h-[22px] shrink-0 rounded-[5px] border border-destructive/15 bg-destructive/5 px-1.5 text-xs font-normal text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive [@media(pointer:coarse)]:min-h-11"
										onClick={onCancel}
									>
										{resolvedCancelText}
									</Button>
								)}
							</div>
						)}
					</div>
					{description && (
						<div className="mt-[7px] text-xs leading-[19px] text-muted-foreground [overflow-wrap:anywhere]">
							{description}
						</div>
					)}
				</div>
			</DraggableCore>
		</div>
	)
}

export default memo(DownloadProgressToast)
