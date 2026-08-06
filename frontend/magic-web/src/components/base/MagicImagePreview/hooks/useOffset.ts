import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"

export type Offset = { x: number; y: number }

export function calculateZoomAnchoredOffset(
	currentOffset: Offset,
	anchor: { x: number; y: number },
	scaleRatio: number,
): Offset {
	return {
		x: currentOffset.x + (anchor.x - currentOffset.x) * (1 - scaleRatio),
		y: currentOffset.y + (anchor.y - currentOffset.y) * (1 - scaleRatio),
	}
}

const useOffset = (imageRef: React.RefObject<HTMLElement>) => {
	const [offset, setOffsetState] = useState<Offset>({ x: 0, y: 0 })
	const offsetRef = useRef<Offset>(offset)
	const isDragging = useRef(false)
	const startPos = useRef({ x: 0, y: 0 })
	const lastOffset = useRef<Offset>(offset)
	const pendingOffset = useRef<Offset | null>(null)
	const rafId = useRef<number | null>(null)

	const flushPendingOffset = useMemoizedFn(() => {
		rafId.current = null
		if (!pendingOffset.current) return

		const nextOffset = pendingOffset.current
		pendingOffset.current = null
		offsetRef.current = nextOffset
		setOffsetState(nextOffset)
	})

	const scheduleOffset = useMemoizedFn((nextOffset: Offset) => {
		pendingOffset.current = nextOffset
		if (rafId.current === null) rafId.current = requestAnimationFrame(flushPendingOffset)
	})

	const setOffset = useMemoizedFn((nextOffset: Offset) => {
		if (rafId.current !== null) {
			cancelAnimationFrame(rafId.current)
			rafId.current = null
		}
		pendingOffset.current = null
		offsetRef.current = nextOffset
		lastOffset.current = nextOffset
		setOffsetState(nextOffset)
	})
	const getOffset = useMemoizedFn(() => offsetRef.current)

	const handlePointerDown = useMemoizedFn((event: PointerEvent) => {
		// 右键点击，不进行拖拽
		if (event.button === 2) return

		event.preventDefault()
		isDragging.current = true
		startPos.current = { x: event.clientX, y: event.clientY }
		lastOffset.current = offsetRef.current

		if (imageRef.current) {
			imageRef.current.style.cursor = "grabbing"
			imageRef.current.setPointerCapture(event.pointerId)
		}
	})

	const handlePointerMove = useMemoizedFn((event: PointerEvent) => {
		if (!isDragging.current) return

		const deltaX = event.clientX - startPos.current.x
		const deltaY = event.clientY - startPos.current.y
		scheduleOffset({
			x: lastOffset.current.x + deltaX,
			y: lastOffset.current.y + deltaY,
		})
	})

	const handlePointerUp = useMemoizedFn((event: PointerEvent) => {
		isDragging.current = false
		if (imageRef.current) {
			imageRef.current.style.cursor = "grab"
			if (imageRef.current.hasPointerCapture(event.pointerId)) {
				imageRef.current.releasePointerCapture(event.pointerId)
			}
		}
	})

	useEffect(() => {
		const image = imageRef.current
		if (!image) return

		image.addEventListener("pointerdown", handlePointerDown)
		image.addEventListener("pointermove", handlePointerMove)
		image.addEventListener("pointerup", handlePointerUp)
		image.addEventListener("pointercancel", handlePointerUp)

		return () => {
			image.removeEventListener("pointerdown", handlePointerDown)
			image.removeEventListener("pointermove", handlePointerMove)
			image.removeEventListener("pointerup", handlePointerUp)
			image.removeEventListener("pointercancel", handlePointerUp)
			if (rafId.current !== null) cancelAnimationFrame(rafId.current)
			rafId.current = null
			pendingOffset.current = null
		}
	}, [handlePointerDown, handlePointerMove, handlePointerUp, imageRef])

	return {
		offset,
		getOffset,
		setOffset,
	}
}

export default useOffset
