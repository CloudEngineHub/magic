import { animate, useReducedMotion, type AnimationPlaybackControls } from "framer-motion"
import { useEffect, useRef, useState } from "react"

function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

interface UseAnimatedNumberOptions {
	duration?: number
}

const DEFAULT_PULSE_DURATION = 1200

/** Uses the first server value directly, then animates subsequent changes. */
export function useAnimatedNumber(
	value: number | undefined,
	{ duration = 1.1 }: UseAnimatedNumberOptions = {},
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

/** Adds a short visual emphasis when an already-rendered number changes. */
export function useAnimatedNumberPulse(
	value: number | undefined,
	duration = DEFAULT_PULSE_DURATION,
) {
	const prefersReducedMotion = useReducedMotion()
	const [isPulsing, setIsPulsing] = useState(false)
	const previousValueRef = useRef<number | undefined>(undefined)

	useEffect(() => {
		const previousValue = previousValueRef.current
		previousValueRef.current = isValidNumber(value) ? value : undefined

		if (
			prefersReducedMotion ||
			!isValidNumber(value) ||
			previousValue === undefined ||
			previousValue === value
		) {
			setIsPulsing(false)
			return
		}

		setIsPulsing(true)
		const timeoutId = window.setTimeout(() => setIsPulsing(false), duration)

		return () => window.clearTimeout(timeoutId)
	}, [duration, prefersReducedMotion, value])

	return isPulsing
}
