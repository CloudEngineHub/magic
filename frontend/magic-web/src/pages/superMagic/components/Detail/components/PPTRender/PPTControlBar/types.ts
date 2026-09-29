export interface PPTControlBarProps {
	activeIndex: number
	totalSlides: number
	canGoPrevious?: boolean
	canGoNext?: boolean
	isTransitioning: boolean
	isMobile: boolean
	isFullscreen: boolean
	isRefreshingCurrentSlide: boolean
	onRefreshCurrentSlide?: () => void
	onPrevSlide: () => void
	onNextSlide: () => void
	onGoToFirstSlide: () => void
	onRefreshSlides: () => void
	refreshAllProgress?: { done: number; total: number } | null
	onJumpToPage: (index: number) => void
	onToggleFullscreen: () => void
	presenterScreens?: ReadonlyArray<{ label?: string; isPrimary?: boolean }>
	selectedPresenterScreen?: number | null
	onSelectPresenterScreen?: (index: number) => void
	onReplaceTemplate?: () => void
	notesVisible?: boolean
	onToggleNotes?: () => void
	scaleRatio: number
	isAutoScale: boolean
	portalContainer: HTMLElement | null
	onScaleChange: (scale: number) => void
	onResetScale: () => void
	className?: string
	currentFileId?: string
}
