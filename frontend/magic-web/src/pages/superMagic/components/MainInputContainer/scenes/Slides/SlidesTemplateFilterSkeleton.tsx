import { Skeleton } from "@/components/shadcn-ui/skeleton"

// 列数对应实际筛选项数量；比例网格会占满父容器，并随可用宽度同步缩放。
const PRIMARY_FILTER_COUNT = 7
const TAG_FILTER_COUNT = 6

function SlidesTemplatePrimaryFiltersSkeleton() {
	return (
		<div
			className="grid min-w-0 flex-1 grid-cols-[0.8fr_0.65fr_repeat(5,minmax(0,1fr))] items-center gap-2 overflow-hidden py-1"
			data-testid="slides-template-primary-filters-skeleton"
			aria-hidden
		>
			{Array.from({ length: PRIMARY_FILTER_COUNT }, (_, index) => (
				<Skeleton key={index} className="h-9 min-w-0 rounded-full" />
			))}
		</div>
	)
}

interface SlidesTemplateTagFiltersSkeletonProps {
	isMobile?: boolean
}

function SlidesTemplateTagFiltersSkeleton({
	isMobile = false,
}: SlidesTemplateTagFiltersSkeletonProps) {
	if (isMobile) {
		return (
			<div
				className="flex min-w-0 items-center gap-2 py-0.5"
				data-testid="slides-template-tag-filters-skeleton"
				aria-hidden
			>
				<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
					{["w-20", "w-28", "w-24"].map((widthClassName) => (
						<Skeleton
							key={widthClassName}
							className={`h-8 ${widthClassName} shrink-0 rounded-lg`}
						/>
					))}
				</div>
				<Skeleton
					className="size-8 shrink-0 rounded-full"
					data-testid="slides-template-tag-filter-button-skeleton"
				/>
			</div>
		)
	}

	return (
		<div
			className="grid w-full min-w-0 grid-cols-[0.8fr_repeat(3,minmax(0,1fr))_1.15fr_minmax(0,1fr)] items-center gap-2 py-0.5"
			data-testid="slides-template-tag-filters-skeleton"
			aria-hidden
		>
			{Array.from({ length: TAG_FILTER_COUNT }, (_, index) => (
				<Skeleton key={index} className="h-8 min-w-0 rounded-lg" />
			))}
		</div>
	)
}

export { SlidesTemplatePrimaryFiltersSkeleton, SlidesTemplateTagFiltersSkeleton }
