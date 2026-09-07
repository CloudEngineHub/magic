import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/utils/cn"

interface NumericDragInputProps extends Omit<
	React.ComponentProps<typeof Input>,
	"value" | "onChange" | "type"
> {
	value: string | number
	onChange: (value: string) => void
	onCommit?: (value: string) => void
	step?: number
	min?: number
	max?: number
	precision?: number
	dragSensitivity?: number
	formatDisplayValue?: (value: string | number) => string
	/** Used as the drag/nudge origin when the field shows a non-px unit. */
	scrubStartValue?: number | null
}

function clamp(value: number, min?: number, max?: number): number {
	if (min !== undefined) value = Math.max(min, value)
	if (max !== undefined) value = Math.min(max, value)
	return value
}

function formatValue(value: number, precision?: number): string {
	if (precision !== undefined) return value.toFixed(precision)
	return String(Number(value.toFixed(6)))
}

/**
 * Numeric field with the interaction used by design tools: drag vertically
 * or use ArrowUp/ArrowDown to nudge the value. Mouse-wheel changes are
 * intentionally disabled so scrolling the surrounding panel never edits a
 * value accidentally.
 */
export function NumericDragInput({
	value,
	onChange,
	onCommit,
	step = 1,
	min,
	max,
	precision,
	dragSensitivity = 4,
	formatDisplayValue,
	scrubStartValue,
	className,
	onFocus,
	onBlur,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onWheel,
	onKeyDown,
	...props
}: NumericDragInputProps) {
	const dragRef = useRef<{
		startY: number
		startValue: number
		target: HTMLInputElement | null
		pointerId: number | null
		pendingValue: string | null
	} | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [isFocused, setIsFocused] = useState(false)
	const inputValue = !isFocused && formatDisplayValue ? formatDisplayValue(value) : value

	const getNumber = useCallback(() => {
		if (
			scrubStartValue !== undefined &&
			scrubStartValue !== null &&
			Number.isFinite(scrubStartValue)
		) {
			return scrubStartValue
		}
		const parsed = typeof value === "number" ? value : Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : null
	}, [scrubStartValue, value])

	const updateValue = useCallback(
		(nextValue: number) => {
			const formattedValue = formatValue(clamp(nextValue, min, max), precision)
			onChange(formattedValue)
			return formattedValue
		},
		[max, min, onChange, precision],
	)

	const commit = useCallback(
		(nextValue: number) => {
			const formattedValue = updateValue(nextValue)
			onCommit?.(formattedValue)
		},
		[onCommit, updateValue],
	)

	const nudge = useCallback(
		(direction: 1 | -1) => {
			const current = getNumber()
			if (current === null) return
			commit(current + direction * step)
		},
		[commit, getNumber, step],
	)

	useEffect(() => {
		if (!isDragging) return
		const handleWindowPointerMove = (event: PointerEvent) => {
			const drag = dragRef.current
			if (!drag) return
			const delta = drag.startY - event.clientY
			if (Math.abs(delta) < 2) return
			event.preventDefault()
			drag.pendingValue = updateValue(
				drag.startValue + Math.round(delta / dragSensitivity) * step,
			)
		}
		const finishDrag = (shouldCommit: boolean) => {
			const drag = dragRef.current
			if (shouldCommit && drag?.pendingValue !== null && drag?.pendingValue !== undefined) {
				onCommit?.(drag.pendingValue)
			}
			if (
				drag?.target &&
				drag.pointerId !== null &&
				drag.target.hasPointerCapture?.(drag.pointerId)
			) {
				drag.target.releasePointerCapture?.(drag.pointerId)
			}
			dragRef.current = null
			setIsDragging(false)
		}
		const captureOptions = { capture: true, passive: false }
		window.addEventListener("pointermove", handleWindowPointerMove, captureOptions)
		const handlePointerUp = () => finishDrag(true)
		const handlePointerCancel = () => finishDrag(false)
		window.addEventListener("pointerup", handlePointerUp)
		window.addEventListener("pointercancel", handlePointerCancel)
		return () => {
			window.removeEventListener("pointermove", handleWindowPointerMove, captureOptions)
			window.removeEventListener("pointerup", handlePointerUp)
			window.removeEventListener("pointercancel", handlePointerCancel)
		}
	}, [dragSensitivity, isDragging, onCommit, step, updateValue])

	return (
		<Input
			type="text"
			value={inputValue}
			inputMode="decimal"
			{...props}
			className={cn(
				"cursor-ns-resize touch-none select-none",
				isDragging && "cursor-ns-resize bg-primary/10 text-primary",
				className,
			)}
			onPointerDown={(event) => {
				if (event.button === 0 && !props.disabled) {
					const current = getNumber()
					if (current !== null) {
						dragRef.current = {
							startY: event.clientY,
							startValue: current,
							target: event.currentTarget,
							pointerId: event.pointerId ?? null,
							pendingValue: null,
						}
						event.currentTarget.setPointerCapture?.(event.pointerId)
						setIsDragging(true)
					}
				}
				onPointerDown?.(event)
			}}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onWheel={onWheel}
			onFocus={(event) => {
				setIsFocused(true)
				onFocus?.(event)
			}}
			onBlur={(event) => {
				setIsFocused(false)
				onBlur?.(event)
			}}
			onKeyDown={(event) => {
				if (event.key === "ArrowUp" || event.key === "ArrowDown") {
					event.preventDefault()
					nudge(event.key === "ArrowUp" ? 1 : -1)
				}
				onKeyDown?.(event)
			}}
			onChange={(event) => onChange(event.target.value)}
			aria-description="Drag vertically or use ArrowUp and ArrowDown to adjust"
			data-dragging={isDragging ? "true" : undefined}
		/>
	)
}
