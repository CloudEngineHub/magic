import { useMemoizedFn } from "ahooks"
import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

interface Options {
	/** Relative zoom step. `0.1` means 10% of the current scale. */
	step?: number
	minScale?: number
	maxScale?: number
	fitScale?: number
	onWheelZoom?: (change: WheelZoomChange) => void
}

export interface WheelZoomChange {
	previousScale: number
	nextScale: number
	clientX: number
	clientY: number
}

const MAX_PINCH_DELTA_PER_FRAME = 100
const MAX_MOUSE_WHEEL_DELTA_PER_FRAME = 80
const MOUSE_WHEEL_SENSITIVITY = 0.0015
const SCALE_PRECISION = 10000

const roundScale = (value: number) => Math.round(value * SCALE_PRECISION) / SCALE_PRECISION

function normalizeWheelDelta(event: WheelEvent, container: HTMLElement) {
	switch (event.deltaMode) {
		case WheelEvent.DOM_DELTA_LINE:
			return event.deltaY * 16
		case WheelEvent.DOM_DELTA_PAGE:
			return event.deltaY * Math.max(container.clientHeight, 1)
		default:
			return event.deltaY
	}
}

/**
 * Mac trackpad pinch events use tiny pixel deltas (and set ctrl/meta). This
 * adaptive exponential curve keeps those small deltas responsive while still
 * damping unusually large spikes.
 */
export function getPinchZoomFactor(deltaY: number) {
	const clampedDelta = Math.max(
		-MAX_PINCH_DELTA_PER_FRAME,
		Math.min(MAX_PINCH_DELTA_PER_FRAME, deltaY),
	)
	const absDelta = Math.abs(clampedDelta)
	if (absDelta < 10) return Math.exp(-clampedDelta * 0.01)
	if (absDelta < 50) return Math.exp(-clampedDelta * 0.005)
	return Math.exp(-clampedDelta * 0.002)
}

/** Mouse wheels keep a deliberately slower curve than a trackpad pinch. */
export function getMouseWheelZoomFactor(deltaY: number) {
	const clampedDelta = Math.max(
		-MAX_MOUSE_WHEEL_DELTA_PER_FRAME,
		Math.min(MAX_MOUSE_WHEEL_DELTA_PER_FRAME, deltaY),
	)
	return Math.exp(-clampedDelta * MOUSE_WHEEL_SENSITIVITY)
}

/**
 * Maps a physical image scale to the logarithmic position used by the toolbar
 * slider. A linear slider makes the low end unusably sensitive when the range
 * spans 0.1x to 10x.
 */
export function scaleToSliderValue(scale: number, minScale: number, maxScale: number) {
	if (!Number.isFinite(scale) || !Number.isFinite(minScale) || !Number.isFinite(maxScale)) {
		return 0
	}

	const safeMinScale = Math.max(minScale, Number.EPSILON)
	if (maxScale <= safeMinScale) return 0

	const clampedScale = Math.max(safeMinScale, Math.min(scale, maxScale))
	return (Math.log(clampedScale / safeMinScale) / Math.log(maxScale / safeMinScale)) * 100
}

/** Converts a toolbar slider position back to the physical image scale. */
export function sliderValueToScale(value: number, minScale: number, maxScale: number) {
	if (!Number.isFinite(value) || !Number.isFinite(minScale) || !Number.isFinite(maxScale)) {
		return minScale
	}

	const safeMinScale = Math.max(minScale, Number.EPSILON)
	if (maxScale <= safeMinScale) return safeMinScale

	const normalizedValue = Math.max(0, Math.min(value, 100)) / 100
	return roundScale(safeMinScale * Math.pow(maxScale / safeMinScale, normalizedValue))
}

/**
 * 图片缩放
 */
const useScale = (
	imageRef: RefObject<HTMLElement>,
	{ step = 0.1, minScale = 0.1, maxScale = 5, fitScale = 1, onWheelZoom }: Options = {},
) => {
	// null means "fit to viewport". Once the user zooms, scale represents the ratio
	// between the displayed bitmap size and the original physical image size.
	const [requestedScale, setRequestedScale] = useState<number | null>(null)
	const fittedScale = Math.min(fitScale, maxScale)
	const effectiveMinScale = Math.min(minScale, fittedScale)

	const clampScale = useMemoizedFn((value: number) =>
		roundScale(Math.max(effectiveMinScale, Math.min(value, maxScale))),
	)
	const scale = clampScale(requestedScale ?? fittedScale)
	const scaleRef = useRef(scale)
	scaleRef.current = scale

	const updateRequestedScale = useMemoizedFn((value: number) => {
		const nextScale = clampScale(value)
		scaleRef.current = nextScale
		setRequestedScale((currentScale) =>
			currentScale !== null && Math.abs(currentScale - nextScale) < 0.0001
				? currentScale
				: nextScale,
		)
	})
	const notifyWheelZoom = useMemoizedFn((change: WheelZoomChange) => {
		onWheelZoom?.(change)
	})

	useEffect(() => {
		const imageDom = imageRef.current
		if (!imageDom) return

		let rafId: number | null = null
		let pendingWheelDelta = 0
		let pendingIsPinch = false
		let pendingClientX = 0
		let pendingClientY = 0

		const flushWheelZoom = () => {
			const deltaY = pendingWheelDelta
			const isPinch = pendingIsPinch
			const clientX = pendingClientX
			const clientY = pendingClientY
			pendingWheelDelta = 0
			pendingIsPinch = false
			rafId = null

			if (deltaY === 0) return

			const previousScale = scaleRef.current
			const zoomFactor = isPinch
				? getPinchZoomFactor(deltaY)
				: getMouseWheelZoomFactor(deltaY)
			const nextScale = clampScale(previousScale * zoomFactor)
			if (Math.abs(nextScale - previousScale) < 0.0001) return

			notifyWheelZoom({ previousScale, nextScale, clientX, clientY })
			updateRequestedScale(nextScale)
		}

		const callback = (event: WheelEvent) => {
			if (event.deltaY === 0) return
			event.preventDefault()
			pendingWheelDelta += normalizeWheelDelta(event, imageDom)
			pendingIsPinch ||= event.ctrlKey || event.metaKey
			pendingClientX = event.clientX
			pendingClientY = event.clientY
			if (rafId === null) rafId = requestAnimationFrame(flushWheelZoom)
		}

		imageDom.addEventListener("wheel", callback, { passive: false })
		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId)
			imageDom.removeEventListener("wheel", callback)
		}
	}, [clampScale, imageRef, notifyWheelZoom, updateRequestedScale])

	const addTenPercent = useMemoizedFn(() => {
		updateRequestedScale(scaleRef.current * (1 + step))
	})

	const subTenPercent = useMemoizedFn(() => {
		updateRequestedScale(scaleRef.current / (1 + step))
	})

	const setScale = useMemoizedFn((nextScale: number) => {
		updateRequestedScale(nextScale)
	})

	const resetScale = useMemoizedFn(() => {
		scaleRef.current = fittedScale
		setRequestedScale(null)
	})

	return {
		scale,
		transformScale: fitScale > 0 ? scale / fitScale : 1,
		minScale: effectiveMinScale,
		addTenPercent,
		subTenPercent,
		setScale,
		resetScale,
	}
}

export default useScale
