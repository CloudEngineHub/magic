import { Skeleton } from "@/components/shadcn-ui/skeleton"

const PRIMARY_FILTER_WIDTHS = ["w-20", "w-16", "w-24", "w-24", "w-24", "w-24", "w-24"]
const TAG_FILTER_WIDTHS = ["w-20", "w-24", "w-24", "w-24", "w-28", "w-24"]

function SlidesTemplatePrimaryFiltersSkeleton() {
	return (
		<div
			className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-1"
			data-testid="slides-template-primary-filters-skeleton"
			aria-hidden
		>
			{PRIMARY_FILTER_WIDTHS.map((widthClassName, index) => (
				<Skeleton
					key={`${widthClassName}-${index}`}
					className={`h-9 ${widthClassName} shrink-0 rounded-full`}
				/>
			))}
		</div>
	)
}

function SlidesTemplateTagFiltersSkeleton() {
	return (
		<div
			className="flex min-w-0 items-center gap-2"
			data-testid="slides-template-tag-filters-skeleton"
			aria-hidden
		>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-0.5">
				{TAG_FILTER_WIDTHS.map((widthClassName, index) => (
					<Skeleton
						key={`${widthClassName}-${index}`}
						className={`h-8 ${widthClassName} shrink-0 rounded-lg`}
					/>
				))}
			</div>
		</div>
	)
}

export { SlidesTemplatePrimaryFiltersSkeleton, SlidesTemplateTagFiltersSkeleton }
