export interface PPTControlBarProps {
	activeIndex: number
	totalSlides: number
	isTransitioning: boolean
	isMobile: boolean
	isFullscreen: boolean
	onPrevSlide: () => void
	onNextSlide: () => void
	onGoToFirstSlide: () => void
	onRefreshSlides: () => void
	onJumpToPage: (index: number) => void
	onToggleFullscreen: () => void
	scaleRatio: number
	onScaleChange: (scale: number) => void
	onResetScale: () => void
	t: (key: string) => string
	className?: string
}
