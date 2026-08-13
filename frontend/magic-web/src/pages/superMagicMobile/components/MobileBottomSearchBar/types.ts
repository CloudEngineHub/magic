export interface MobileBottomSearchBarProps {
	value: string
	placeholder: string
	clearAriaLabel: string
	onValueChange: (value: string) => void
	testIdPrefix: string
	clearButtonVisibility?: "focus-or-value" | "value-only"
	/** "bottom" keeps the docked shell; "inline" renders only the input row for toolbar embedding */
	layout?: "bottom" | "inline"
	/** Called on clear-button mouseDown to exit search mode (toolbar inline pattern) */
	onDismiss?: () => void
	/** Focus the input on mount — used when toolbar switches into search mode */
	autoFocus?: boolean
	onCompositionStart?: () => void
	onCompositionEnd?: () => void
	className?: string
	disabled?: boolean
	/** Enables the recording-detail layout with a leading close action and result navigation. */
	variant?: "default" | "recording-content"
	currentResult?: number
	totalResults?: number
	closeAriaLabel?: string
	previousAriaLabel?: string
	nextAriaLabel?: string
	onClose?: () => void
	onPrevious?: () => void
	onNext?: () => void
}
