import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import type { SkillMarketCategoryView } from "@/services/skills/SkillsService"
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"

interface SkillCategoryFilterProps {
	categories: SkillMarketCategoryView[]
	selectedCategoryIds: string[]
	loading?: boolean
	error?: boolean
	onChange: (categoryIds: string[]) => void
}

function SkillCategoryFilter({
	categories,
	selectedCategoryIds,
	loading = false,
	error = false,
	onChange,
}: SkillCategoryFilterProps) {
	const { t } = useTranslation("crew/market")
	const selectedCategoryId = selectedCategoryIds[0]
	const shouldReduceMotion = useReducedMotion()
	const indicatorTransition = {
		duration: shouldReduceMotion ? 0 : 0.2,
		ease: [0.25, 1, 0.5, 1] as const,
	}

	const activeIndicator = (
		<motion.span
			layoutId="skill-market-category-indicator"
			className="pointer-events-none absolute inset-x-0 bottom-[-2px] h-0.5 bg-foreground"
			transition={indicatorTransition}
			aria-hidden="true"
		/>
	)

	return (
		<HeadlessHorizontalScroll
			className="w-full rounded-none border-b border-border"
			scrollContainerClassName="flex min-w-0 items-end overflow-y-hidden overscroll-x-contain pr-8 touch-pan-x"
			scrollContainerProps={{ "aria-busy": loading }}
			scrollStep={280}
			data-testid="skill-category-filter"
		>
			<LayoutGroup id="skill-market-category-tabs">
				<div
					className="flex min-w-max items-end gap-6 pr-8 sm:gap-8"
					role="tablist"
					aria-label={t("skillsLibrary.category")}
				>
					<button
						type="button"
						role="tab"
						aria-selected={!selectedCategoryId}
						className={cn(
							"relative shrink-0 whitespace-nowrap border-b-2 border-transparent pb-3 text-xl font-semibold tracking-[-0.025em] transition-colors",
							!selectedCategoryId
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						data-testid="skill-category-all"
						onClick={() => onChange([])}
					>
						{t("skillsLibrary.allSkills")}
						{!selectedCategoryId ? activeIndicator : null}
					</button>

					{categories.map((category) => (
						<button
							key={category.id}
							type="button"
							role="tab"
							aria-selected={selectedCategoryId === category.id}
							className={cn(
								"relative shrink-0 whitespace-nowrap border-b-2 border-transparent pb-3 text-xl font-semibold tracking-[-0.025em] transition-colors",
								selectedCategoryId === category.id
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
							data-testid={`skill-category-${category.id}`}
							onClick={() => onChange([category.id])}
						>
							{category.name}
							{selectedCategoryId === category.id ? activeIndicator : null}
						</button>
					))}
				</div>
			</LayoutGroup>

			{error ? (
				<span className="shrink-0 text-xs text-destructive" role="status">
					{t("skillsLibrary.categoriesLoadFailed")}
				</span>
			) : null}
		</HeadlessHorizontalScroll>
	)
}

export default SkillCategoryFilter
