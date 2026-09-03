import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn-ui/select"
import { cn } from "@/utils/cn"
import { EditorSelectContent } from "../../EditorFloating"
import { NumericDragInput } from "./NumericDragInput"
import {
	getMetricControlWidth,
	getMetricInputWidth,
	METRIC_CONTROL_MAX_WIDTH,
} from "./metricControlWidth"

const LINE_HEIGHT_PRESETS = ["normal", "1", "1.15", "1.2", "1.5", "1.75", "2", "2.5", "3"]

function splitNumericLineHeight(value: string): { number: string; unit: string } | null {
	const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(.*)$/)
	if (!match) return null
	return { number: match[1], unit: match[2] }
}

interface LineHeightSelectorProps {
	value: string
	fontSize?: string
	onChange: (value: string) => void
	onApply: (value: string) => void
	disabled?: boolean
	className?: string
}

function formatMetricValue(value: number): string {
	return String(Number(value.toFixed(4)))
}

// Only unitless and pixel values have a deterministic conversion from the
// selected element's font size; preserving other units avoids showing a false value.
function getEquivalentLineHeight(value: string, fontSize?: string): string | null {
	if (!fontSize) return null

	const parsedLineHeight = splitNumericLineHeight(value)
	const parsedFontSize = splitNumericLineHeight(fontSize)
	if (!parsedLineHeight || !parsedFontSize) return null

	const lineHeightValue = Number.parseFloat(parsedLineHeight.number)
	const fontSizeValue = Number.parseFloat(parsedFontSize.number)
	const lineHeightUnit = parsedLineHeight.unit.toLowerCase()
	const fontSizeUnit = parsedFontSize.unit.toLowerCase()
	if (
		!Number.isFinite(lineHeightValue) ||
		lineHeightValue < 0 ||
		!Number.isFinite(fontSizeValue) ||
		fontSizeValue <= 0 ||
		(fontSizeUnit && fontSizeUnit !== "px")
	) {
		return null
	}

	if (!lineHeightUnit) {
		return `${formatMetricValue(lineHeightValue * fontSizeValue)}px`
	}
	if (lineHeightUnit === "px") {
		return formatMetricValue(lineHeightValue / fontSizeValue)
	}
	return null
}

/**
 * Compact line-height control for the contextual toolbar.
 * CSS unitless values and length values are both accepted because computed
 * styles may be returned as either form by the iframe document.
 */
export function LineHeightSelector({
	value,
	fontSize,
	onChange,
	onApply,
	disabled,
	className,
}: LineHeightSelectorProps) {
	const { t } = useTranslation("super")
	const numericLineHeight = splitNumericLineHeight(value)
	// Keep partial input local while restoring the last non-empty CSS value on blur.
	const committedValueRef = useRef(value)
	useEffect(() => {
		if (value.trim()) committedValueRef.current = value
	}, [value])
	const lineHeightOptions = useMemo(() => {
		if (!value || LINE_HEIGHT_PRESETS.includes(value)) return LINE_HEIGHT_PRESETS
		return [...LINE_HEIGHT_PRESETS, value]
	}, [value])
	const equivalentLineHeight = useMemo(
		() => getEquivalentLineHeight(value, fontSize),
		[fontSize, value],
	)

	const handleApply = useCallback(() => {
		const normalizedValue = value.trim()
		if (normalizedValue) {
			committedValueRef.current = normalizedValue
			onChange(normalizedValue)
			onApply(normalizedValue)
			return
		}
		onChange(committedValueRef.current)
	}, [onApply, onChange, value])

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key !== "Enter") return
			event.preventDefault()
			handleApply()
			event.currentTarget.blur()
		},
		[handleApply],
	)

	const handleSelectChange = useCallback(
		(nextValue: string) => {
			committedValueRef.current = nextValue
			onChange(nextValue)
			onApply(nextValue)
		},
		[onApply, onChange],
	)

	const handleNumericChange = useCallback(
		(nextValue: string) => {
			const nextNumericValue = splitNumericLineHeight(nextValue)
			onChange(
				nextNumericValue?.unit ? nextValue : `${nextValue}${numericLineHeight?.unit ?? ""}`,
			)
		},
		[numericLineHeight?.unit, onChange],
	)

	const handleNumericCommit = useCallback(
		(nextValue: string) => {
			const nextNumericValue = splitNumericLineHeight(nextValue)
			const normalizedValue = nextNumericValue
				? `${nextNumericValue.number}${nextNumericValue.unit || numericLineHeight?.unit || ""}`
				: nextValue.trim()
			if (normalizedValue) {
				committedValueRef.current = normalizedValue
				onChange(normalizedValue)
				onApply(normalizedValue)
			}
		},
		[numericLineHeight?.unit, onApply, onChange],
	)

	return (
		<div
			data-testid="html-editor-line-height-control"
			style={{
				width: getMetricControlWidth(value),
				maxWidth: `${METRIC_CONTROL_MAX_WIDTH}px`,
			}}
			className={cn(
				"flex h-7 min-w-0 shrink-0 items-center gap-0.5 overflow-hidden rounded-md border border-border/70 bg-background/70 pl-2 shadow-none transition-[background-color,border-color,box-shadow] duration-150 focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/20 hover:border-primary/45 hover:bg-primary/5",
				className,
			)}
		>
			<span className="shrink-0 text-xs font-medium text-muted-foreground">
				{t("stylePanel.lineHeight")}
			</span>
			<div className="relative flex min-w-0 flex-1 items-center">
				<NumericDragInput
					data-testid="html-editor-line-height-input"
					value={value}
					onChange={handleNumericChange}
					onCommit={handleNumericCommit}
					onBlur={handleApply}
					onKeyDown={handleKeyDown}
					disabled={disabled}
					style={{ width: getMetricInputWidth(value) }}
					className="h-full flex-none border-0 bg-transparent pl-0 pr-6 text-center text-xs shadow-none hover:bg-transparent focus-visible:ring-0 disabled:opacity-50"
					placeholder="1.5"
					title={t("stylePanel.lineHeight")}
					step={1}
				/>
				<Select value={value} onValueChange={handleSelectChange} disabled={disabled}>
					<SelectTrigger
						data-testid="html-editor-line-height-menu-button"
						className="absolute right-0 h-full w-5 rounded-r-md border-0 bg-transparent p-0 shadow-none hover:bg-transparent disabled:opacity-50 [&>span]:hidden [&>svg]:h-3 [&>svg]:w-3"
					>
						<SelectValue />
					</SelectTrigger>
					<EditorSelectContent data-testid="html-editor-line-height-menu">
						{lineHeightOptions
							.filter((option) => option !== equivalentLineHeight)
							.map((option) => (
								<SelectItem
									key={option}
									value={option}
									className="text-xs"
									data-testid="html-editor-line-height-item"
									data-line-height={option}
								>
									{option}
								</SelectItem>
							))}
						{equivalentLineHeight ? (
							<>
								<div className="-mx-1 my-1 h-px bg-border" role="separator" />
								<div className="px-2 pb-1 pt-0.5 text-[10px] text-muted-foreground">
									{t("stylePanel.lineHeightSwitchUnit")}
								</div>
								<SelectItem
									value={equivalentLineHeight}
									className="text-xs"
									data-testid="html-editor-line-height-equivalent"
									data-line-height={equivalentLineHeight}
								>
									{equivalentLineHeight}
								</SelectItem>
							</>
						) : null}
					</EditorSelectContent>
				</Select>
			</div>
		</div>
	)
}
