import type { Ref } from "react"
import slidesTemplateFireIcon from "@/assets/resources/icons/fire.webp"
import { AnimatedNumberText } from "@/pages/superMagic/components/AnimatedNumberText"
import { formatNumber } from "@/utils/format"
import { cn } from "@/lib/utils"

interface SlidesTemplateCountBadgeProps {
	templateTotal: number
	templateCountPrefix: string
	templateCountSuffix: string
	testId?: string
	showCount?: boolean
	animateNumber?: boolean
	className?: string
	badgeRef?: Ref<HTMLSpanElement>
}

export function SlidesTemplateCountBadge({
	templateTotal,
	templateCountPrefix,
	templateCountSuffix,
	testId,
	showCount = true,
	animateNumber = true,
	className,
	badgeRef,
}: SlidesTemplateCountBadgeProps) {
	return (
		<span
			ref={badgeRef}
			className={cn(
				"flex h-6 shrink-0 items-center gap-1 rounded-full bg-[#fff2ec] px-2 text-sm font-medium tabular-nums leading-none text-[#ff6a1f]",
				className,
			)}
			data-testid={testId}
		>
			<img
				src={slidesTemplateFireIcon}
				alt=""
				aria-hidden="true"
				className="h-4 w-4 object-contain"
			/>
			{showCount ? (
				<span
					className="inline-flex items-center gap-1"
					data-testid={
						testId ? "sidebar-content-slides-templates-count-value" : undefined
					}
				>
					{templateCountPrefix ? <span>{templateCountPrefix}</span> : null}
					{animateNumber ? (
						<AnimatedNumberText value={templateTotal} />
					) : (
						<span>{formatNumber(templateTotal)}</span>
					)}
					{templateCountSuffix ? <span>{templateCountSuffix}</span> : null}
				</span>
			) : null}
		</span>
	)
}
