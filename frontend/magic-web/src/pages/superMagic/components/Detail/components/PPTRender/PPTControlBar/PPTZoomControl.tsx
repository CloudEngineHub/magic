import { useState } from "react"
import { Check, ChevronDown, Minus, Plus, Scan } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import type { PPTControlBarProps } from "./types"

type PPTZoomControlProps = Pick<
	PPTControlBarProps,
	"scaleRatio" | "isAutoScale" | "onScaleChange" | "onResetScale" | "portalContainer"
>

export function PPTZoomControl({
	scaleRatio,
	isAutoScale,
	portalContainer,
	onScaleChange,
	onResetScale,
}: PPTZoomControlProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const scalePercentage = Math.round(scaleRatio * 100)

	function changeScale(delta: number) {
		onScaleChange(Math.min(1.5, Math.max(0.1, (scalePercentage + delta) / 100)))
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 px-2 font-normal tabular-nums"
					data-testid="ppt-control-bar-scale-trigger"
					aria-label={t("ppt.zoomSettings")}
				>
					<span data-testid="ppt-control-bar-scale-value">{scalePercentage}%</span>
					<ChevronDown className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="end"
				sideOffset={12}
				className="w-52 p-2"
				aria-label={t("ppt.zoomSettings")}
				// 弹层挂到 PPT 预览容器，随文件预览进入全屏，并避开底栏毛玻璃的定位影响。
				container={portalContainer}
				onClick={(event) => event.stopPropagation()}
			>
				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start px-2 font-normal"
					data-testid="ppt-control-bar-scale-reset"
					aria-pressed={isAutoScale}
					onClick={() => {
						// 自动适应跟随窗口尺寸；选择 100% 则保持手动比例。
						onResetScale()
						setOpen(false)
					}}
				>
					<Scan className="size-4" />
					{t("ppt.fitToWindow")}
					{isAutoScale && <Check className="ml-auto size-4" />}
				</Button>
				<div className="my-2 border-t border-border" />
				<div className="flex items-center justify-between">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0"
						data-testid="ppt-control-bar-scale-decrease"
						aria-label={t("stylePanel.decreaseZoom")}
						disabled={scalePercentage <= 10}
						onClick={() => changeScale(-5)}
					>
						<Minus className="size-4" />
					</Button>
					<span className="text-sm tabular-nums" aria-live="polite">
						{scalePercentage}%
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0"
						data-testid="ppt-control-bar-scale-increase"
						aria-label={t("stylePanel.increaseZoom")}
						disabled={scalePercentage >= 150}
						onClick={() => changeScale(5)}
					>
						<Plus className="size-4" />
					</Button>
				</div>
				<div className="mt-1 flex items-center justify-between">
					{[0.5, 1, 1.5].map((scale) => (
						<Button
							key={scale}
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs font-normal tabular-nums"
							aria-pressed={!isAutoScale && scaleRatio === scale}
							onClick={() => {
								onScaleChange(scale)
								setOpen(false)
							}}
						>
							{scale * 100}%
						</Button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}
