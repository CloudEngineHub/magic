export interface PPTControlBarProps {
	activeIndex: number
	totalSlides: number
	isTransitioning: boolean
	isMobile: boolean
	isFullscreen: boolean
	isRefreshingCurrentSlide: boolean
	onRefreshCurrentSlide?: () => void
	onPrevSlide: () => void
	onNextSlide: () => void
	onGoToFirstSlide: () => void
	onRefreshSlides: () => void
	onJumpToPage: (index: number) => void
	onToggleFullscreen: () => void
	onReplaceTemplate?: () => void
	scaleRatio: number
	isAutoScale: boolean
	portalContainer: HTMLElement | null
	onScaleChange: (scale: number) => void
	onResetScale: () => void
	className?: string
}
