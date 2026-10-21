import { Skeleton } from "@/components/shadcn-ui/skeleton"

const SKELETON_CARD_COUNT = 8

/**
 * Placeholder grid of "My canvases" while the list first loads or a search runs: same columns,
 * 4:3 covers and two text lines as the real cards, so the list replaces it without a jump.
 */
function AiCanvasCardGridSkeleton() {
	return (
		<div
			className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4"
			aria-busy="true"
			data-testid="ai-canvas-card-grid-skeleton"
		>
			{Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
				<div key={index} className="flex flex-col gap-2">
					<Skeleton className="aspect-[4/3] w-full rounded-2xl" />
					<div className="flex flex-col gap-1.5 px-0.5">
						<Skeleton className="h-4 w-3/5 rounded-sm" />
						<Skeleton className="h-3 w-2/5 rounded-sm" />
					</div>
				</div>
			))}
		</div>
	)
}

export default AiCanvasCardGridSkeleton
