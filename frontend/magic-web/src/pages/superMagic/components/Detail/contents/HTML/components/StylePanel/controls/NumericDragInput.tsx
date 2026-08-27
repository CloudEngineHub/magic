import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/utils/cn"

interface NumericDragInputProps extends Omit<
	React.ComponentProps<typeof Input>,
	"value" | "onChange" | "type"
> {
	value: string | number
	onChange: (value: string) => void
	step?: number
	min?: number
	max?: number
	precision?: number
	dragSensitivity?: number
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
	step = 1,
	min,
	max,
	precision,
	dragSensitivity = 4,
	className,
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
	} | null>(null)
	const [isDragging, setIsDragging] = useState(false)

	const getNumber = useCallback(() => {
		const parsed = typeof value === "number" ? value : Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : null
	}, [value])

	const commit = useCallback(
		(nextValue: number) => {
			onChange(formatValue(clamp(nextValue, min, max), precision))
		},
		[max, min, onChange, precision],
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
			commit(drag.startValue + Math.round(delta / dragSensitivity) * step)
		}
		const finishDrag = () => {
			const drag = dragRef.current
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
		window.addEventListener("pointerup", finishDrag)
		window.addEventListener("pointercancel", finishDrag)
		return () => {
			window.removeEventListener("pointermove", handleWindowPointerMove, captureOptions)
			window.removeEventListener("pointerup", finishDrag)
			window.removeEventListener("pointercancel", finishDrag)
		}
	}, [commit, dragSensitivity, isDragging, step])

	return (
		<Input
			type="text"
			value={value}
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
