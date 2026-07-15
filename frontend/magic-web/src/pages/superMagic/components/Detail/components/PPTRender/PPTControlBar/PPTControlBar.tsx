import { useState, useRef } from "react"
import {
	ChevronLeft,
	ChevronRight,
	Home,
	Maximize,
	Minimize,
	RefreshCcw,
	RotateCcw,
	Minus,
	Plus,
} from "lucide-react"
import type { PPTControlBarProps } from "./types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn-ui/button"
import { MagicTooltip } from "@/components/base"

export function PPTControlBar({
	activeIndex,
	totalSlides,
	isTransitioning,
	isMobile,
	isFullscreen,
	onPrevSlide,
	onNextSlide,
	onGoToFirstSlide,
	onRefreshSlides,
	onJumpToPage,
	onToggleFullscreen,
	scaleRatio,
	onScaleChange,
	onResetScale,
	t,
	className,
}: PPTControlBarProps) {
	const [jumpPageInput, setJumpPageInput] = useState<string>("")
	const [isPageInputVisible, setIsPageInputVisible] = useState(false)
	const pageInputRef = useRef<HTMLInputElement>(null)
	const scalePercentage = Math.round(scaleRatio * 100)
	const isMinScale = scalePercentage <= 10
	const isMaxScale = scalePercentage >= 150

	function getTooltipTitle(key: string) {
		if (isMobile) return undefined
		return t(key)
	}

	// Handle page jump
	function handleJumpToPage(pageNum: string) {
		if (!pageNum.trim()) {
			setJumpPageInput("")
			return
		}

		const num = parseInt(pageNum, 10)

		// Validate input
		if (isNaN(num)) {
			console.warn("Invalid page number:", pageNum)
			setJumpPageInput("")
			return
		}

		// Range check
		if (num < 1 || num > totalSlides) {
			console.warn(`Page number out of range: ${num}, valid range: 1-${totalSlides}`)
			setJumpPageInput("")
			return
		}

		// Check if transitioning
		if (isTransitioning) {
			setJumpPageInput("")
			return
		}

		// Jump to the specified page (page numbers start from 1, indices from 0)
		onJumpToPage(num - 1)
		setJumpPageInput("")
	}

	function changeScale(delta: number) {
		onScaleChange(Math.min(1.5, Math.max(0.1, (scalePercentage + delta) / 100)))
	}

	return (
		<div
			data-testid="ppt-control-bar"
			className={cn(
				"absolute bottom-2 left-1/2 z-50 max-w-[calc(100%-16px)] -translate-x-1/2 overflow-x-auto rounded-lg border border-border/60 bg-white/95 p-2 shadow-md backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 dark:border-white/[0.08] dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/85",
				isMobile ? "bottom-[20px]" : "",
				className,
			)}
		>
			<div className="flex w-max min-w-full items-center gap-2 whitespace-nowrap">
				{/* Previous button */}
				<MagicTooltip title={getTooltipTitle("fileViewer.previousPage")}>
					<span>
						<Button
							variant="ghost"
							size="sm"
							data-testid="ppt-control-bar-prev-button"
							className="h-7 w-7 p-0"
							onClick={(e) => {
								e.stopPropagation()
								e.currentTarget.blur()
								onPrevSlide()
							}}
							aria-label="Previous slide"
							disabled={activeIndex === 0 || isTransitioning}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>

				{/* Page indicator and jump input */}
				<div className="flex flex-shrink-0 items-center gap-2 max-md:gap-1.5">
					{isPageInputVisible ? (
						<input
							ref={pageInputRef}
							type="number"
							data-testid="ppt-control-bar-jump-input"
							className="h-7 w-12 rounded-md border border-input bg-background text-center text-sm text-foreground transition-all [appearance:textfield] placeholder:text-xs placeholder:text-muted-foreground hover:border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-7 max-md:w-14 max-md:px-1.5 max-md:py-0.5 max-md:text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
							value={jumpPageInput}
							onChange={(e) => setJumpPageInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleJumpToPage(jumpPageInput)
									e.currentTarget.blur()
								}
								if (e.key === "Escape") {
									setJumpPageInput("")
									setIsPageInputVisible(false)
								}
							}}
							onBlur={() => {
								if (jumpPageInput) {
									handleJumpToPage(jumpPageInput)
								}
								setIsPageInputVisible(false)
							}}
							onFocus={(e) => e.target.select()}
							min={1}
							max={totalSlides}
							disabled={isTransitioning}
							placeholder={`${activeIndex + 1}`}
						/>
					) : (
						<MagicTooltip title={getTooltipTitle("detail.clickToJumpPage")}>
							<span
								data-testid="ppt-control-bar-page-indicator"
								className="flex-shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-accent max-md:text-xs"
								onClick={() => {
									setIsPageInputVisible(true)
									setJumpPageInput("")
									// Use setTimeout to ensure input is rendered before focusing
									setTimeout(() => {
										pageInputRef.current?.focus()
									}, 0)
								}}
							>
								{activeIndex + 1} / {totalSlides}
							</span>
						</MagicTooltip>
					)}
				</div>

				{/* Next button */}
				<MagicTooltip title={getTooltipTitle("fileViewer.nextPage")}>
					<span>
						<Button
							variant="ghost"
							size="sm"
							data-testid="ppt-control-bar-next-button"
							className="h-7 w-7 p-0 text-foreground"
							onClick={(e) => {
								e.stopPropagation()
								e.currentTarget.blur()
								onNextSlide()
							}}
							aria-label="Next slide"
							disabled={activeIndex >= totalSlides - 1 || isTransitioning}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>

				{/* Go to first slide button */}
				<MagicTooltip title={getTooltipTitle("detail.goToFirstPage")}>
					<span>
						<Button
							variant="ghost"
							size="sm"
							data-testid="ppt-control-bar-first-button"
							className="h-7 w-7 p-0 text-foreground"
							onClick={(e) => {
								e.stopPropagation()
								e.currentTarget.blur()
								onGoToFirstSlide()
							}}
							aria-label="Go to first slide"
							disabled={activeIndex === 0 || isTransitioning}
						>
							<Home className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>

				{/* Refresh slides button */}
				<MagicTooltip title={getTooltipTitle("detail.refreshSlides")}>
					<span>
						<Button
							variant="ghost"
							size="sm"
							data-testid="ppt-control-bar-refresh-button"
							className="h-7 w-7 p-0 text-foreground"
							onClick={(e) => {
								e.stopPropagation()
								e.currentTarget.blur()
								onRefreshSlides()
							}}
							aria-label="Refresh slides"
							disabled={isTransitioning}
						>
							<RefreshCcw className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>

				{/* Fullscreen button */}
				{!isMobile && (
					<MagicTooltip
						title={getTooltipTitle(
							isFullscreen ? "fileViewer.exitFullscreen" : "fileViewer.fullscreen",
						)}
					>
						<span>
							<Button
								variant="ghost"
								size="sm"
								data-testid="ppt-control-bar-fullscreen-button"
								className="h-7 w-7 p-0 text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									e.currentTarget.blur()
									onToggleFullscreen()
								}}
								aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
							>
								{isFullscreen ? (
									<Minimize className="h-4 w-4" />
								) : (
									<Maximize className="h-4 w-4" />
								)}
							</Button>
						</span>
					</MagicTooltip>
				)}

				{!isMobile && (
					<div className="ml-1 flex items-center gap-1 border-l border-border/60 pl-2 dark:border-white/[0.08]">
						<MagicTooltip title={t("stylePanel.decreaseZoom")}>
							<span>
								<Button
									variant="ghost"
									size="sm"
									data-testid="ppt-control-bar-scale-decrease"
									className="h-7 w-7 p-0"
									onClick={() => changeScale(-5)}
									disabled={isMinScale}
								>
									<Minus className="h-4 w-4" />
								</Button>
							</span>
						</MagicTooltip>
						<span
							data-testid="ppt-control-bar-scale-value"
							className="min-w-[42px] text-center text-sm font-medium text-muted-foreground"
						>
							{scalePercentage}%
						</span>
						<MagicTooltip title={t("stylePanel.increaseZoom")}>
							<span>
								<Button
									variant="ghost"
									size="sm"
									data-testid="ppt-control-bar-scale-increase"
									className="h-7 w-7 p-0"
									onClick={() => changeScale(5)}
									disabled={isMaxScale}
								>
									<Plus className="h-4 w-4" />
								</Button>
							</span>
						</MagicTooltip>
						<MagicTooltip title={t("stylePanel.resetZoom")}>
							<span>
								<Button
									variant="ghost"
									size="sm"
									data-testid="ppt-control-bar-scale-reset"
									className="h-7 w-7 p-0"
									onClick={onResetScale}
								>
									<RotateCcw className="h-4 w-4" />
								</Button>
							</span>
						</MagicTooltip>
					</div>
				)}
			</div>
		</div>
	)
}
