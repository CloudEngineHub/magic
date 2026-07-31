import { useMemoizedFn, useThrottle } from "ahooks"
import type { RefObject } from "react"
import { useState, useEffect } from "react"

interface Options {
	step?: number
	minScale?: number
	maxScale?: number
	fitScale?: number
}

/**
 * 图片缩放
 */
const useScale = (
	imageRef: RefObject<HTMLElement>,
	{ step = 0.1, minScale = 0.1, maxScale = 5, fitScale = 1 }: Options = {},
) => {
	// null means "fit to viewport". Once the user zooms, scale represents the ratio
	// between the displayed bitmap size and the original physical image size.
	const [requestedScale, setRequestedScale] = useState<number | null>(null)
	const fittedScale = Math.min(fitScale, maxScale)
	const effectiveMinScale = Math.min(minScale, fittedScale)
	const scale = requestedScale ?? fittedScale

	const clampScale = useMemoizedFn((value: number) =>
		Math.max(effectiveMinScale, Math.min(value, maxScale)),
	)

	useEffect(() => {
		const imageDom = imageRef.current
		let rafId: number | null = null
		const callback = (e: WheelEvent) => {
			if (rafId) {
				cancelAnimationFrame(rafId)
			}
			rafId = requestAnimationFrame(() => {
				const delta = e.deltaY > 0 ? -0.1 : 0.1
				setRequestedScale((currentScale) =>
					clampScale((currentScale ?? fittedScale) + delta),
				)
				rafId = null
			})
		}

		imageDom?.addEventListener("wheel", callback)
		return () => {
			imageDom?.removeEventListener("wheel", callback)
		}
	}, [clampScale, fittedScale, imageRef])

	const addTenPercent = useMemoizedFn(() => {
		setRequestedScale((currentScale) => clampScale((currentScale ?? fittedScale) + step))
	})

	const subTenPercent = useMemoizedFn(() => {
		setRequestedScale((currentScale) => clampScale((currentScale ?? fittedScale) - step))
	})

	const setScale = useMemoizedFn((nextScale: number) => {
		setRequestedScale(clampScale(nextScale))
	})

	const resetScale = useMemoizedFn(() => {
		setRequestedScale(null)
	})

	const throttledScale = useThrottle(scale, { wait: 16.67 })

	return {
		scale: throttledScale,
		transformScale: fitScale > 0 ? throttledScale / fitScale : 1,
		minScale: effectiveMinScale,
		addTenPercent,
		subTenPercent,
		setScale,
		resetScale,
	}
}

export default useScale
