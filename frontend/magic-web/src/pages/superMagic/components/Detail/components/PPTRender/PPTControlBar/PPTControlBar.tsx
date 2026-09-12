import { useState, useRef } from "react"
import { useSize } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	ChevronLeft,
	ChevronRight,
	Home,
	Maximize,
	Minimize,
	RefreshCcw,
	RotateCw,
	LayoutTemplate,
} from "lucide-react"
import type { PPTControlBarProps } from "./types"
import { PPTZoomControl } from "./PPTZoomControl"
import { cn } from "@/utils/cn"
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
	onRefreshCurrentSlide,
	isRefreshingCurrentSlide,
	onJumpToPage,
	onToggleFullscreen,
	onReplaceTemplate,
	scaleRatio,
	isAutoScale,
	portalContainer,
	onScaleChange,
	onResetScale,
	className,
}: PPTControlBarProps) {
	const { t } = useTranslation("super")
	const [jumpPageInput, setJumpPageInput] = useState<string>("")
	const [isPageInputVisible, setIsPageInputVisible] = useState(false)
	const pageInputRef = useRef<HTMLInputElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const mainBarRef = useRef<HTMLDivElement>(null)
	const templateBarRef = useRef<HTMLDivElement>(null)
	const zoomBarRef = useRef<HTMLDivElement>(null)
	const containerSize = useSize(containerRef)
	const mainBarSize = useSize(mainBarRef)
	const templateBarSize = useSize(templateBarRef)
	const zoomBarSize = useSize(zoomBarRef)
	const barClassName =
		"pointer-events-auto flex w-max max-w-full items-center gap-2 rounded-lg border border-border/60 bg-white/95 p-2 shadow-md backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 dark:border-white/[0.08] dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/85"
	// 两侧按较宽的一组对称预留空间，模板是否显示都不移动中间操作区。
	// 按实际文案宽度换行，避免英文或窄预览下侧边按钮与中间重叠。
	const sideWidth = Math.max(templateBarSize?.width ?? 0, zoomBarSize?.width ?? 0)
	const separateRows =
		!isMobile &&
		(!containerSize ||
			!mainBarSize ||
			containerSize.width < mainBarSize.width + 2 * (sideWidth + 8))

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

	return (
		<div
			ref={containerRef}
			data-testid="ppt-control-bar"
			className={cn(
				"pointer-events-none absolute inset-x-2 bottom-2 z-50 grid items-end gap-2",
				separateRows ? "grid-cols-2" : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
				isMobile ? "bottom-[20px]" : "",
				className,
			)}
		>
			<div
				ref={mainBarRef}
				className={cn(
					barClassName,
					"flex-wrap justify-center justify-self-center",
					separateRows || isMobile
						? "col-span-full row-start-2"
						: "col-start-2 row-start-1",
				)}
			>
				<div className="flex items-center gap-2">
					{/* Previous button */}
					<MagicTooltip title={isMobile ? undefined : t("fileViewer.previousPage")}>
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
								aria-label={t("fileViewer.previousPage")}
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
							<MagicTooltip
								title={isMobile ? undefined : t("detail.clickToJumpPage")}
							>
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
					<MagicTooltip title={isMobile ? undefined : t("fileViewer.nextPage")}>
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
								aria-label={t("fileViewer.nextPage")}
								disabled={activeIndex >= totalSlides - 1 || isTransitioning}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
						</span>
					</MagicTooltip>

					{/* Go to first slide button */}
					<MagicTooltip title={isMobile ? undefined : t("detail.goToFirstPage")}>
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
								aria-label={t("detail.goToFirstPage")}
								disabled={activeIndex === 0 || isTransitioning}
							>
								<Home className="h-4 w-4" />
							</Button>
						</span>
					</MagicTooltip>
				</div>
				<div className="flex items-center gap-1 border-l border-border/60 pl-2">
					<Button
						variant="ghost"
						size="sm"
						data-testid="ppt-control-bar-refresh-current-button"
						className="h-7 gap-1.5 px-2 text-xs font-normal"
						onClick={(event) => {
							event.stopPropagation()
							event.currentTarget.blur()
							onRefreshCurrentSlide?.()
						}}
						disabled={
							isTransitioning || isRefreshingCurrentSlide || !onRefreshCurrentSlide
						}
						aria-busy={isRefreshingCurrentSlide}
					>
						<RotateCw
							className={cn("size-4", isRefreshingCurrentSlide && "animate-spin")}
						/>
						{t("ppt.reloadCurrentSlide")}
					</Button>
					{/* Refresh slides button */}
					<MagicTooltip title={isMobile ? undefined : t("ppt.reloadAllSlides")}>
						<span>
							<Button
								variant="ghost"
								size="sm"
								data-testid="ppt-control-bar-refresh-button"
								className="h-7 gap-1.5 px-2 text-xs font-normal text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									e.currentTarget.blur()
									onRefreshSlides()
								}}
								aria-label={t("ppt.reloadAllSlides")}
								disabled={isTransitioning}
							>
								<RefreshCcw className="h-4 w-4" />
								{t("ppt.reloadAllSlides")}
							</Button>
						</span>
					</MagicTooltip>
				</div>

				{/* Fullscreen button */}
				{!isMobile && (
					<MagicTooltip
						title={
							isFullscreen
								? t("fileViewer.exitFullscreen")
								: t("fileViewer.fullscreen")
						}
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
								aria-label={
									isFullscreen
										? t("fileViewer.exitFullscreen")
										: t("fileViewer.fullscreen")
								}
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
			</div>
			{!isMobile && (
				<div
					ref={zoomBarRef}
					className={cn(
						barClassName,
						"row-start-1 justify-self-end",
						separateRows ? "col-start-2" : "col-start-3",
					)}
				>
					<PPTZoomControl
						scaleRatio={scaleRatio}
						isAutoScale={isAutoScale}
						portalContainer={portalContainer}
						onScaleChange={onScaleChange}
						onResetScale={onResetScale}
					/>
				</div>
			)}

			{!isMobile && onReplaceTemplate && (
				<div
					ref={templateBarRef}
					data-testid="ppt-control-bar-template-group"
					className={cn(barClassName, "col-start-1 row-start-1 justify-self-start")}
				>
					<MagicTooltip title={t("ppt.templateReplacement.button")}>
						<span>
							<Button
								variant="ghost"
								size="sm"
								data-testid="ppt-control-bar-template-button"
								className="h-7 gap-1.5 px-2 text-xs font-normal text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									e.currentTarget.blur()
									onReplaceTemplate()
								}}
								aria-label={t("ppt.templateReplacement.button")}
							>
								<LayoutTemplate className="h-4 w-4" />
								<span>{t("ppt.templateReplacement.button")}</span>
							</Button>
						</span>
					</MagicTooltip>
				</div>
			)}
		</div>
	)
}
