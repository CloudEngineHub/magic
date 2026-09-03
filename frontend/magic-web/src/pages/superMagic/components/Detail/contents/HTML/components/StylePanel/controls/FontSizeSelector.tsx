import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { NumericDragInput } from "./NumericDragInput"
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn-ui/select"
import { cn } from "@/utils/cn"
import { EditorSelectContent } from "../../EditorFloating"
import {
	getMetricControlWidth,
	getMetricInputWidth,
	METRIC_CONTROL_MAX_WIDTH,
} from "./metricControlWidth"

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "64", "72"]

interface FontSizeSelectorProps {
	value: string
	onChange: (value: string) => void
	onApply: (value: string) => void
	disabled?: boolean
	className?: string
}

/**
 * Font size selector with manual input
 */
export function FontSizeSelector({
	value,
	onChange,
	onApply,
	disabled,
	className,
}: FontSizeSelectorProps) {
	const { t } = useTranslation("super")

	const fontSizeOptions = useMemo(() => {
		if (!value || FONT_SIZES.includes(value)) return FONT_SIZES
		return [...FONT_SIZES, value].sort((a, b) => parseInt(a) - parseInt(b))
	}, [value])

	const handleInput = useCallback(
		(inputValue: string) => {
			if (inputValue === "" || /^\d+$/.test(inputValue)) {
				onChange(inputValue)
			}
		},
		[onChange],
	)

	const handleBlur = useCallback(() => {
		if (value && /^\d+$/.test(value)) {
			onApply(value)
		}
	}, [value, onApply])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault()
				if (value && /^\d+$/.test(value)) {
					onApply(value)
					;(e.target as HTMLInputElement).blur()
				}
			}
		},
		[value, onApply],
	)

	const handleSelectChange = useCallback(
		(selectedValue: string) => {
			onChange(selectedValue)
			onApply(selectedValue)
		},
		[onChange, onApply],
	)

	return (
		<div
			data-testid="html-editor-font-size-control"
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
				{t("stylePanel.fontSize")}
			</span>
			<div className="relative flex min-w-0 flex-1 items-center">
				<NumericDragInput
					data-testid="html-editor-font-size-input"
					value={value}
					onChange={handleInput}
					onCommit={onApply}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					disabled={disabled}
					style={{ width: getMetricInputWidth(value) }}
					className="h-full flex-none border-0 bg-transparent pl-0 pr-6 text-center text-xs shadow-none hover:bg-transparent focus-visible:ring-0 disabled:opacity-50"
					placeholder="16"
					title={t("stylePanel.fontSize")}
					min={1}
					step={1}
				/>
				<Select value={value} onValueChange={handleSelectChange} disabled={disabled}>
					<SelectTrigger
						data-testid="html-editor-font-size-menu-button"
						className="absolute right-0 h-full w-5 rounded-r-md border-0 bg-transparent p-0 shadow-none hover:bg-transparent disabled:opacity-50 [&>span]:hidden [&>svg]:h-3 [&>svg]:w-3"
					>
						<SelectValue />
					</SelectTrigger>
					<EditorSelectContent data-testid="html-editor-font-size-menu">
						{fontSizeOptions.map((size) => (
							<SelectItem
								key={size}
								value={size}
								className="text-xs"
								data-testid="html-editor-font-size-item"
								data-font-size={size}
							>
								{size}
							</SelectItem>
						))}
					</EditorSelectContent>
				</Select>
			</div>
		</div>
	)
}
