import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight, Check, LogOut, Monitor } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { cn } from "@/utils/cn"

interface PresenterScreenOption {
	label?: string
	isPrimary?: boolean
}

interface PPTPresenterConsoleControlsProps {
	activeIndex: number
	totalSlides: number
	canGoPrevious?: boolean
	canGoNext?: boolean
	isTransitioning: boolean
	screens: ReadonlyArray<PresenterScreenOption>
	selectedScreen: number | null
	onPrevSlide: () => void
	onNextSlide: () => void
	onJumpToPage: (index: number) => void
	onSelectScreen: (index: number) => void
	onExit: () => void
}

/** The local operator controls stay with the preview; the popup remains a clean audience view. */
export default function PPTPresenterConsoleControls({
	activeIndex,
	totalSlides,
	canGoPrevious = activeIndex > 0,
	canGoNext = activeIndex < totalSlides - 1,
	isTransitioning,
	screens,
	selectedScreen,
	onPrevSlide,
	onNextSlide,
	onJumpToPage,
	onSelectScreen,
	onExit,
}: PPTPresenterConsoleControlsProps) {
	const { t } = useTranslation("super")
	const [isPageInputVisible, setIsPageInputVisible] = useState(false)
	const [pageInput, setPageInput] = useState("")
	const [elapsedSeconds, setElapsedSeconds] = useState(0)
	useEffect(() => {
		const startedAt = Date.now()
		const timer = window.setInterval(() => {
			// Derive elapsed time from the clock so background timer throttling does not lose time.
			setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
		}, 1000)
		return () => window.clearInterval(timer)
	}, [])
	const elapsed = `${Math.floor(elapsedSeconds / 60)
		.toString()
		.padStart(2, "0")}:${(elapsedSeconds % 60).toString().padStart(2, "0")}`

	const submitPage = () => {
		const page = Number(pageInput)
		if (Number.isInteger(page) && page >= 1 && page <= totalSlides) onJumpToPage(page - 1)
		setPageInput("")
		setIsPageInputVisible(false)
	}

	return (
		<div
			data-testid="ppt-presenter-console-controls"
			className="col-span-2 row-start-3 flex min-w-0 flex-wrap items-center justify-center gap-1 rounded-xl border border-white/15 bg-black/75 p-1.5 text-white"
		>
			<span
				className="mr-auto px-2 text-sm tabular-nums text-white/70"
				aria-label={t("ppt.presenter.elapsedTime")}
			>
				{elapsed}
			</span>
			<Button
				variant="ghost"
				size="icon"
				data-testid="ppt-presenter-console-prev-button"
				className="size-8 text-white hover:bg-white/15 hover:text-white"
				disabled={!canGoPrevious || isTransitioning}
				onClick={onPrevSlide}
				aria-label={t("fileViewer.previousPage")}
			>
				<ChevronLeft className="size-4" />
			</Button>
			{isPageInputVisible ? (
				<input
					autoFocus
					value={pageInput}
					data-testid="ppt-presenter-console-page-input"
					aria-label={t("detail.clickToJumpPage")}
					className="h-8 w-16 rounded-md border border-white/30 bg-white/10 text-center text-sm text-white outline-none focus:ring-2 focus:ring-white/50"
					type="number"
					min={1}
					max={totalSlides}
					placeholder={`${activeIndex + 1}`}
					onChange={(event) => setPageInput(event.target.value)}
					onBlur={submitPage}
					onKeyDown={(event) => {
						event.stopPropagation()
						if (event.key === "Enter") submitPage()
						if (event.key === "Escape") {
							setPageInput("")
							setIsPageInputVisible(false)
						}
					}}
				/>
			) : (
				<button
					type="button"
					data-testid="ppt-presenter-console-page-indicator"
					className="h-8 min-w-16 rounded-md px-2 text-sm tabular-nums hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
					onClick={() => setIsPageInputVisible(true)}
					aria-label={t("detail.clickToJumpPage")}
				>
					{activeIndex + 1} <span className="text-white/60">/ {totalSlides}</span>
				</button>
			)}
			<Button
				variant="ghost"
				size="icon"
				data-testid="ppt-presenter-console-next-button"
				className="size-8 text-white hover:bg-white/15 hover:text-white"
				disabled={!canGoNext || isTransitioning}
				onClick={onNextSlide}
				aria-label={t("fileViewer.nextPage")}
			>
				<ChevronRight className="size-4" />
			</Button>
			{screens.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							data-testid="ppt-presenter-console-screen-button"
							className="h-8 gap-1.5 text-white hover:bg-white/15 hover:text-white"
							aria-label={t("ppt.presenter.selectScreen")}
						>
							<Monitor className="size-4" />
							<span className="hidden sm:inline">{t("ppt.presenter.screen")}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{screens.map((screen, index) => (
							<DropdownMenuItem
								key={index}
								onSelect={() => onSelectScreen(index)}
								className={cn("min-w-48", selectedScreen === index && "bg-accent")}
							>
								<span className="flex-1">
									{screen.label ||
										t("ppt.presenter.screenOption", { index: index + 1 })}
									{screen.isPrimary ? t("ppt.presenter.primarySuffix") : ""}
								</span>
								{selectedScreen === index && <Check className="size-4" />}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			<Button
				variant="ghost"
				size="sm"
				data-testid="ppt-presenter-console-exit-button"
				className="h-8 gap-1.5 text-white hover:bg-white/15 hover:text-white"
				onClick={onExit}
				aria-label={t("ppt.presenter.endSlideShow")}
			>
				<LogOut className="size-4" />
				<span className="hidden sm:inline">{t("ppt.presenter.endSlideShow")}</span>
			</Button>
		</div>
	)
}
