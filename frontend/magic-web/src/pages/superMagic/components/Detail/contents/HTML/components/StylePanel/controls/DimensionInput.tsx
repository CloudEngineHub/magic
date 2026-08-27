import { useCallback, useEffect, useState } from "react"
import { useDebounceFn } from "ahooks"
import { NumericDragInput } from "./NumericDragInput"
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn-ui/select"
import { Label } from "@/components/shadcn-ui/label"
import { EditorSelectContent } from "../../EditorFloating"
import { STYLE_PANEL_STYLES } from "../styles"

interface DimensionInputProps {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder?: string
	id?: string
	allowedUnits?: string[]
	fixedUnit?: string
	testIdPrefix?: string
	compact?: boolean
}

const DEFAULT_UNITS = ["px", "%", "em", "rem", "vw", "vh", "auto"]

/**
 * Parse value into number and unit
 */
function parseValue(value: string): { num: string; unit: string } {
	if (!value || value === "auto") {
		return { num: "", unit: "auto" }
	}

	const match = value.match(/^([\d.]+)(.*)$/)
	if (match) {
		return { num: match[1], unit: match[2] || "px" }
	}

	return { num: "", unit: "px" }
}

/**
 * Dimension input with number and unit selector
 */
export function DimensionInput({
	label,
	value,
	onChange,
	placeholder = "auto",
	id,
	allowedUnits = DEFAULT_UNITS,
	fixedUnit,
	testIdPrefix,
	compact = false,
}: DimensionInputProps) {
	const { num, unit } = parseValue(value)
	const [numValue, setNumValue] = useState(num)
	const resolvedUnit = fixedUnit || unit
	const [unitValue, setUnitValue] = useState(resolvedUnit)

	// Sync with external value changes
	useEffect(() => {
		const parsed = parseValue(value)
		setNumValue(parsed.num)
		setUnitValue(fixedUnit || parsed.unit)
	}, [value, fixedUnit])

	// Debounce for input changes
	const { run: onChangeDebounced } = useDebounceFn(
		(newValue: string) => {
			onChange(newValue)
		},
		{ wait: 300 },
	)

	/**
	 * Handle number input change
	 */
	const handleNumChange = useCallback(
		(newNum: string) => {
			// Allow empty or valid number
			if (newNum === "" || /^[\d.]*$/.test(newNum)) {
				setNumValue(newNum)

				if (newNum === "") {
					onChangeDebounced("auto")
				} else {
					onChangeDebounced(`${newNum}${unitValue === "auto" ? "px" : unitValue}`)
				}
			}
		},
		[unitValue, onChangeDebounced],
	)

	/**
	 * Handle unit change
	 */
	const handleUnitChange = useCallback(
		(newUnit: string) => {
			setUnitValue(newUnit)

			if (newUnit === "auto") {
				setNumValue("")
				onChange("auto")
			} else if (numValue) {
				onChange(`${numValue}${newUnit}`)
			}
		},
		[numValue, onChange],
	)

	return (
		<div
			className={compact ? "min-w-0 space-y-1" : "min-w-0 space-y-2"}
			data-testid={testIdPrefix ? `${testIdPrefix}-root` : undefined}
		>
			<Label htmlFor={id} className={STYLE_PANEL_STYLES.label}>
				{label}
			</Label>
			<div
				className={
					compact
						? "grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] gap-1"
						: "flex min-w-0 gap-2"
				}
			>
				<NumericDragInput
					id={id}
					value={numValue}
					onChange={handleNumChange}
					placeholder={placeholder}
					disabled={unitValue === "auto"}
					className={
						compact
							? "h-7 w-full min-w-0 rounded-md border-border/70 bg-background/70 px-2 font-mono text-xs transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/45 hover:bg-primary/5 focus-visible:border-primary/70 focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-default disabled:bg-muted/40"
							: `${STYLE_PANEL_STYLES.control} min-w-0 flex-1 font-mono disabled:cursor-default`
					}
					data-testid={testIdPrefix ? `${testIdPrefix}-input` : undefined}
				/>
				{fixedUnit ? null : (
					<Select value={unitValue} onValueChange={handleUnitChange}>
						<SelectTrigger
							size={compact ? "sm" : "default"}
							className={
								compact
									? `${STYLE_PANEL_STYLES.control} !h-7 w-full`
									: `${STYLE_PANEL_STYLES.control} w-20`
							}
							data-testid={testIdPrefix ? `${testIdPrefix}-unit-trigger` : undefined}
						>
							<SelectValue />
						</SelectTrigger>
						<EditorSelectContent>
							{allowedUnits.map((u) => (
								<SelectItem
									key={u}
									value={u}
									data-testid={
										testIdPrefix ? `${testIdPrefix}-unit-${u}` : undefined
									}
								>
									{u}
								</SelectItem>
							))}
						</EditorSelectContent>
					</Select>
				)}
			</div>
		</div>
	)
}
