import { useState, useRef } from "react"
import { useSize } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	ChevronLeft,
	ChevronRight,
	Home,
	Maximize,
	Minimize,
	RefreshCw,
	RotateCw,
	PanelsTopLeft,
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
		"pointer-events-auto flex w-max max-w-full items-center gap-1 rounded-[9px] border border-[#dfe2e7]/50 bg-white p-[5px] text-[#252830] shadow-[0_1px_2px_#17213b08,0_3px_8px_#17213b08] dark:border-[#4b515b]/55 dark:bg-[#292c33] dark:text-[#eef0f4] dark:shadow-[0_1px_2px_#00000020,0_3px_8px_#00000015] [&_button]:rounded-[5px] [&_button]:text-[13px] [&_button]:font-normal [&_button]:leading-[1.5] [&_button]:text-inherit [&_button:hover]:bg-[#f0f2f6] dark:[&_button:hover]:bg-[#3a3f49] [&_svg]:stroke-[1.7]"
	// 三块作为整体居中，以实际文案宽度决定换行；窄预览中两块辅助操作仍靠拢。
	// 40px 常规高度由 28px 控件、上下 5px 留白和边框组成，避免默认按钮样式改变视觉尺寸。
	const sideWidth =
		(onReplaceTemplate ? (templateBarSize?.width ?? 0) : 0) + (zoomBarSize?.width ?? 0)
	const separateRows =
		!isMobile &&
		(!containerSize ||
			!mainBarSize ||
			containerSize.width < mainBarSize.width + sideWidth + (onReplaceTemplate ? 16 : 8))

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
				"pointer-events-none absolute inset-x-2 bottom-[18px] z-50 grid items-center justify-center gap-2",
				separateRows || !onReplaceTemplate
					? "grid-cols-[auto_auto]"
					: "grid-cols-[auto_auto_auto]",
				isMobile ? "bottom-[20px]" : "",
				className,
			)}
		>
			<div
				ref={mainBarRef}
				// 显式约束主块宽度，防止 auto 网格轨道被英文按钮撑出预览区。
				style={{ maxWidth: containerSize?.width }}
				className={cn(
					barClassName,
					"flex-wrap justify-center justify-self-center",
					separateRows || isMobile
						? "col-span-full row-start-2"
						: onReplaceTemplate
							? "col-start-2 row-start-1"
							: "col-start-1 row-start-1",
				)}
			>
				<div className="flex items-center gap-1">
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
					<div className="flex shrink-0 items-center gap-1">
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
									className="flex h-7 min-w-[46px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[5px] px-[5px] text-[13px] font-normal tabular-nums leading-[1.5] transition-colors hover:bg-accent"
									onClick={() => {
										setIsPageInputVisible(true)
										setJumpPageInput("")
										// Use setTimeout to ensure input is rendered before focusing
										setTimeout(() => {
											pageInputRef.current?.focus()
										}, 0)
									}}
								>
									{activeIndex + 1}
									<span className="whitespace-pre text-muted-foreground">
										{" "}
										/ {totalSlides}
									</span>
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
				<div className="flex items-center gap-1 before:mx-[3px] before:h-4 before:w-px before:shrink-0 before:bg-[#e8ebf0] dark:before:bg-[#424650]">
					<Button
						variant="ghost"
						size="sm"
						data-testid="ppt-control-bar-refresh-current-button"
						className="h-7 gap-[5px] px-[7px] text-[13px] font-normal"
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
								className="h-7 gap-[5px] px-[7px] text-[13px] font-normal text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									e.currentTarget.blur()
									onRefreshSlides()
								}}
								aria-label={t("ppt.reloadAllSlides")}
								disabled={isTransitioning}
							>
								<RefreshCw className="h-4 w-4" />
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
						"row-start-1 justify-self-start",
						separateRows || !onReplaceTemplate ? "col-start-2" : "col-start-3",
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
					className={cn(barClassName, "col-start-1 row-start-1 justify-self-end")}
				>
					<MagicTooltip title={t("ppt.templateReplacement.button")}>
						<span>
							<Button
								variant="ghost"
								size="sm"
								data-testid="ppt-control-bar-template-button"
								className="h-7 gap-[5px] px-[7px] text-[13px] font-normal text-foreground"
								onClick={(e) => {
									e.stopPropagation()
									e.currentTarget.blur()
									onReplaceTemplate()
								}}
								aria-label={t("ppt.templateReplacement.button")}
							>
								<PanelsTopLeft className="h-4 w-4" />
								<span>{t("ppt.templateReplacement.button")}</span>
							</Button>
						</span>
					</MagicTooltip>
				</div>
			)}
		</div>
	)
}
