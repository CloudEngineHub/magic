import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { useCenteredHorizontalScroll } from "../../hooks/useCenteredHorizontalScroll"

interface SlidesPresetPreviewPagesProps {
	className?: string
	dataTestIdPrefix?: string
	iframeClassName?: string
	initialIndex?: number
	mainFrameClassName?: string
	pages: string[]
	previewUrl?: string
	resetKey?: string
	showThumbnails?: boolean
	thumbnailButtonClassName?: string
	title: string
}

function clampPageIndex(index: number, pageCount: number) {
	if (pageCount <= 0) return 0
	return Math.min(Math.max(index, 0), pageCount - 1)
}

function SlidesPresetPreviewPages({
	className,
	dataTestIdPrefix = "slides-preset-preview-dialog",
	iframeClassName,
	initialIndex = 0,
	mainFrameClassName,
	pages,
	previewUrl,
	resetKey,
	showThumbnails = true,
	thumbnailButtonClassName,
	title,
}: SlidesPresetPreviewPagesProps) {
	const safeInitialIndex = clampPageIndex(initialIndex, pages.length)
	const [activeIndex, setActiveIndex] = useState(safeInitialIndex)
	const pageKey = useMemo(() => pages.join("\n"), [pages])
	const canSwitch = pages.length > 1
	const activePage = pages[activeIndex] ?? pages[0]
	const { scrollContainerRef, setItemRef } = useCenteredHorizontalScroll({
		activeKey: String(activeIndex),
		itemCount: pages.length,
	})

	useEffect(() => {
		setActiveIndex(safeInitialIndex)
	}, [pageKey, resetKey, safeInitialIndex])

	useEffect(() => {
		if (!pages.length || typeof window === "undefined") return

		const preloadImages = pages.map((page) => {
			const image = new window.Image()
			image.decoding = "async"
			image.src = page
			return image
		})

		return () => {
			preloadImages.forEach((image) => {
				image.onload = null
				image.onerror = null
			})
		}
	}, [pageKey, pages])

	const goToPage = useCallback(
		(index: number) => {
			setActiveIndex(clampPageIndex(index, pages.length))
		},
		[pages.length],
	)

	const goToPrevious = useCallback(() => {
		setActiveIndex((currentIndex) => (currentIndex <= 0 ? pages.length - 1 : currentIndex - 1))
	}, [pages.length])

	const goToNext = useCallback(() => {
		setActiveIndex((currentIndex) => (currentIndex >= pages.length - 1 ? 0 : currentIndex + 1))
	}, [pages.length])

	if (pages.length && activePage) {
		return (
			<div className={cn("flex min-h-0 flex-col gap-3 overflow-hidden", className)}>
				<div
					className={cn(
						"relative mx-auto aspect-video w-[min(100%,calc(clamp(280px,52vh,680px)*16/9))] shrink-0 overflow-hidden rounded-md border border-border/60 bg-white shadow-sm",
						mainFrameClassName,
					)}
					data-testid={`${dataTestIdPrefix}-pages`}
				>
					<img
						src={activePage}
						alt={`${title} ${activeIndex + 1}`}
						className="size-full object-contain"
						loading="eager"
						decoding="async"
					/>
					{canSwitch ? (
						<>
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className="absolute left-3 top-1/2 size-9 -translate-y-1/2 rounded-full border border-black/10 bg-white/90 text-neutral-950 shadow-lg backdrop-blur hover:bg-white"
								aria-label={`${title} previous page`}
								onClick={goToPrevious}
								data-testid={`${dataTestIdPrefix}-previous-button`}
							>
								<ChevronLeft className="size-4" />
							</Button>
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className="absolute right-3 top-1/2 size-9 -translate-y-1/2 rounded-full border border-black/10 bg-white/90 text-neutral-950 shadow-lg backdrop-blur hover:bg-white"
								aria-label={`${title} next page`}
								onClick={goToNext}
								data-testid={`${dataTestIdPrefix}-next-button`}
							>
								<ChevronRight className="size-4" />
							</Button>
						</>
					) : null}
					<div
						className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-sm font-medium text-white shadow-sm"
						data-testid={`${dataTestIdPrefix}-page-index`}
					>
						{activeIndex + 1} / {pages.length}
					</div>
				</div>
				{canSwitch && showThumbnails ? (
					<HeadlessHorizontalScroll
						className="shrink-0 overflow-hidden rounded-xl border border-neutral-950/[0.10] bg-neutral-950/[0.08] p-2 shadow-sm backdrop-blur-xl"
						controlBackground="rgba(245,245,245,0.92)"
						scrollContainerRef={scrollContainerRef}
						scrollContainerClassName="no-scrollbar flex gap-4 overflow-x-auto overflow-y-hidden p-1.5"
						scrollStep={280}
						data-testid={`${dataTestIdPrefix}-thumbnail-strip`}
						renderLeftControl={({ scroll }) => (
							<div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full w-12 items-center justify-start">
								<Button
									type="button"
									variant="secondary"
									size="icon"
									className="pointer-events-auto ml-2 size-9 rounded-full border border-border/70 bg-white text-neutral-900 shadow-md hover:bg-white"
									onClick={() => scroll("left")}
								>
									<ChevronLeft className="size-4" />
								</Button>
							</div>
						)}
						renderRightControl={({ scroll }) => (
							<div className="pointer-events-none absolute right-0 top-0 z-10 flex h-full w-12 items-center justify-end">
								<Button
									type="button"
									variant="secondary"
									size="icon"
									className="pointer-events-auto mr-2 size-9 rounded-full border border-border/70 bg-white text-neutral-900 shadow-md hover:bg-white"
									onClick={() => scroll("right")}
								>
									<ChevronRight className="size-4" />
								</Button>
							</div>
						)}
					>
						{pages.map((page, index) => (
							<div
								key={`${page}-${index}`}
								ref={(element) => setItemRef(String(index), element)}
								className="shrink-0"
							>
								<button
									type="button"
									aria-label={`${title} ${index + 1}`}
									onClick={() => goToPage(index)}
									className={cn(
										"relative aspect-video w-[156px] overflow-hidden rounded-md border bg-white shadow-sm transition sm:w-[220px] xl:w-[264px]",
										activeIndex === index
											? "border-neutral-950 ring-2 ring-neutral-950"
											: "border-border/60 hover:border-primary/50",
										thumbnailButtonClassName,
									)}
								>
									<img
										src={page}
										alt=""
										className="size-full object-cover"
										loading="eager"
										decoding="async"
										draggable={false}
										aria-hidden="true"
									/>
									<span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
										#{index + 1}
									</span>
								</button>
							</div>
						))}
					</HeadlessHorizontalScroll>
				) : null}
			</div>
		)
	}

	if (!previewUrl) return null

	return (
		<div className={cn("min-h-0", className)}>
			<iframe
				data-testid={`${dataTestIdPrefix}-iframe`}
				title={title}
				src={previewUrl}
				className={cn(
					"size-full rounded-md border border-border/60 bg-white shadow-sm",
					iframeClassName,
				)}
				referrerPolicy="no-referrer"
				sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
				allowFullScreen
			/>
		</div>
	)
}

export default SlidesPresetPreviewPages
