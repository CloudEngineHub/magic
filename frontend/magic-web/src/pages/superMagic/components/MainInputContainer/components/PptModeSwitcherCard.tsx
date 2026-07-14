import { useState, type MouseEvent } from "react"
import { Trans, useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn-ui/button"
import type { ModeItem } from "@/pages/superMagic/pages/Workspace/types"
import ModeAvatar from "../../ModeAvatar"
import pptSlide1 from "./assets/ppt-slide-1.png"
import pptSlide2 from "./assets/ppt-slide-2.png"
import pptSlide3 from "./assets/ppt-slide-3.png"
import { useSlidesTemplateStatistics } from "@/pages/superMagic/hooks/useSlidesTemplateTotal"
import { formatNumber } from "@/utils/format"

// Local fallback preview slides shown behind the PPT crew pill.
const PPT_PREVIEW_IMAGES = [pptSlide1, pptSlide2, pptSlide3] as const

interface PptModeSwitcherCardProps {
	modeItem: ModeItem
	isSelected: boolean
	onSelect: () => void
}

/**
 * PPT is the only built-in crew with a presentation preview in the design.
 * The preview is positioned above the pill without changing the role list height.
 */
export default function PptModeSwitcherCard({
	modeItem,
	isSelected,
	onSelect,
}: PptModeSwitcherCardProps) {
	const { t } = useTranslation("crew/market")
	const [isHovered, setIsHovered] = useState(false)
	const [isFocused, setIsFocused] = useState(false)
	const slidesTemplateStatistics = useSlidesTemplateStatistics()
	const templateTotalUsageCount = slidesTemplateStatistics?.templateTotalUsageCount
	const isExpanded = isSelected || isHovered || isFocused
	const modeName = modeItem.mode.name || t("detailDialog.emptyName")

	function stopPreviewClick(event: MouseEvent<HTMLButtonElement>) {
		event.stopPropagation()
		onSelect()
	}

	return (
		<div
			className="relative flex h-10 shrink-0 items-end justify-center"
			data-expanded={isExpanded}
			data-testid="ppt-mode-switcher-card"
		>
			<div
				className={cn(
					"pointer-events-none absolute bottom-9 left-1/2 h-[30px] w-[112px] origin-bottom -translate-x-1/2 transition-[transform,opacity] duration-300 ease-out",
					isExpanded
						? "translate-y-0.5 scale-100 opacity-100"
						: "translate-y-1 scale-[0.78] opacity-70",
				)}
				aria-hidden
				data-testid="ppt-mode-switcher-preview"
			>
				<div className="relative h-full w-full">
					{PPT_PREVIEW_IMAGES.map((src, index) => (
						<img
							key={src}
							src={src}
							alt=""
							className={cn(
								"absolute left-0 top-0 h-7 w-[50px] rounded-[2px] border-[0.5px] border-[#e5e5e5] object-cover transition-transform duration-300",
								index === 0 && "left-0 top-px -rotate-[12.69deg]",
								index === 1 && "left-[25.69px] rotate-[15deg]",
								index === 2 && "left-[57px] top-px -rotate-[12.69deg]",
							)}
							loading="lazy"
						/>
					))}
				</div>
			</div>

			<Button
				type="button"
				variant={isSelected ? "outline" : "secondary"}
				size="default"
				className={cn(
					"relative z-10 h-10 gap-[calc(0.5rem-3px)] overflow-hidden rounded-full border p-[3px] pr-4 text-sm font-medium text-foreground shadow-none transition-colors",
					isSelected
						? "border-2 border-foreground bg-background hover:bg-background"
						: "bg-background hover:bg-secondary",
				)}
				aria-label={modeName}
				aria-pressed={isSelected}
				data-testid="ppt-mode-switcher-trigger"
				onClick={stopPreviewClick}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				{isSelected && (
					<span
						aria-hidden
						className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_1px_1px,rgba(10,10,10,0.12)_1px,transparent_0)] bg-[length:6px_6px] opacity-40"
					/>
				)}
				<ModeAvatar
					mode={modeItem.mode}
					iconSize={28}
					className={cn("relative", isSelected ? "border-2" : "border-[3px]")}
				/>
				<span className="relative flex min-w-0 flex-col justify-center">
					<span className="truncate whitespace-nowrap leading-5">{modeName}</span>
					{typeof templateTotalUsageCount === "number" &&
						Number.isFinite(templateTotalUsageCount) &&
						templateTotalUsageCount >= 0 && (
							<span
								className={cn(
									"overflow-hidden text-[10px] leading-3 text-[#737373] transition-[max-height,opacity] duration-300",
									isExpanded ? "max-h-3 opacity-100" : "max-h-0 opacity-0",
								)}
								data-testid="ppt-mode-switcher-delivered-count"
							>
								<Trans
									i18nKey="pptEmployee.delivered"
									ns="crew/market"
									values={{ count: formatNumber(templateTotalUsageCount) }}
									components={{ strong: <strong className="font-semibold" /> }}
								/>
							</span>
						)}
				</span>
			</Button>
		</div>
	)
}
