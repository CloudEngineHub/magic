import { animate, useReducedMotion, type AnimationPlaybackControls } from "framer-motion"
import { useEffect, useRef, useState } from "react"

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const STORAGE_PREFIX = "magic:slides-template-statistics:"

interface StoredAnimatedNumber {
	value: number
	savedAt: number
}

type StoredAnimatedNumberResult =
	| { status: "valid"; value: number }
	| { status: "missing" | "expired" | "invalid" | "unavailable" }

function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function readStoredNumber(storageKey: string, maxAgeMs: number): StoredAnimatedNumberResult {
	if (typeof window === "undefined") return { status: "unavailable" }

	try {
		const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
		if (!raw) return { status: "missing" }

		const parsed = JSON.parse(raw) as Partial<StoredAnimatedNumber>
		if (!isValidNumber(parsed.value) || !isValidNumber(parsed.savedAt)) {
			return { status: "invalid" }
		}
		if (parsed.savedAt > Date.now()) return { status: "invalid" }
		if (Date.now() - parsed.savedAt > maxAgeMs) return { status: "expired" }

		return { status: "valid", value: parsed.value }
	} catch {
		return { status: "unavailable" }
	}
}

function writeStoredNumber(storageKey: string, value: number) {
	if (typeof window === "undefined" || !isValidNumber(value)) return

	try {
		const record: StoredAnimatedNumber = { value, savedAt: Date.now() }
		window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(record))
	} catch {
		// Storage can be unavailable in private browsing or restricted iframes.
	}
}

interface UseAnimatedNumberOptions {
	maxAgeMs?: number
	duration?: number
}

/** Animates a server value from the last successfully rendered value when available. */
export function useAnimatedNumber(
	value: number | undefined,
	storageKey: string,
	{ maxAgeMs = DEFAULT_MAX_AGE_MS, duration = 0.8 }: UseAnimatedNumberOptions = {},
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

		const storedNumber = readStoredNumber(storageKey, maxAgeMs)
		const startValue =
			displayValueRef.current ??
			(storedNumber.status === "valid"
				? storedNumber.value
				: storedNumber.status === "missing"
					? 0
					: value)
		displayValueRef.current = startValue
		setDisplayValue(startValue)

		if (prefersReducedMotion || startValue === value) {
			displayValueRef.current = value
			setDisplayValue(value)
			writeStoredNumber(storageKey, value)
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
				writeStoredNumber(storageKey, value)
			},
		})
		animationRef.current = animation

		return () => animation.stop()
	}, [duration, maxAgeMs, prefersReducedMotion, storageKey, value])

	return displayValue
}

export const slidesTemplateStatisticsStorage = {
	prefix: STORAGE_PREFIX,
	defaultMaxAgeMs: DEFAULT_MAX_AGE_MS,
}
