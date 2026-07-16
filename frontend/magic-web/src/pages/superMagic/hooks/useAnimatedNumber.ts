import { animate, useReducedMotion, type AnimationPlaybackControls } from "framer-motion"
import { useEffect, useRef, useState } from "react"

function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

interface UseAnimatedNumberOptions {
	duration?: number
}

/** Uses the first server value directly, then animates subsequent changes. */
export function useAnimatedNumber(
	value: number | undefined,
	{ duration = 0.8 }: UseAnimatedNumberOptions = {},
) {
	const prefersReducedMotion = useReducedMotion()
	const [displayValue, setDisplayValue] = useState<number | undefined>(undefined)
	const displayValueRef = useRef<number | undefined>(undefined)
	const animationRef = useRef<AnimationPlaybackControls | null>(null)

	useEffect(() => {
		if (!isValidNumber(value)) {
			animationRef.current?.stop()
			displayValueRef.current = undefined
			setDisplayValue(undefined)
			return
		}

		animationRef.current?.stop()

		const startValue = displayValueRef.current
		if (startValue === undefined) {
			displayValueRef.current = value
			setDisplayValue(value)
			return
		}

		if (prefersReducedMotion || startValue === value) {
			displayValueRef.current = value
			setDisplayValue(value)
			return
		}

		const animation = animate(startValue, value, {
			duration,
			ease: "easeOut",
			onUpdate: (latest) => {
				const roundedValue = Math.round(latest)
				displayValueRef.current = roundedValue
				setDisplayValue(roundedValue)
			},
			onComplete: () => {
				displayValueRef.current = value
				setDisplayValue(value)
			},
		})
		animationRef.current = animation

		return () => animation.stop()
	}, [duration, prefersReducedMotion, value])

	return displayValue
}
