export interface PinchPoint {
	id: number
	x: number
	y: number
}

export type PinchPhase = "start" | "move" | "end"

/** Only own two-finger gestures; ordinary scrolling and swipe listeners still receive events. */
export function bindTouchPinch(
	target: EventTarget,
	onGesture: (phase: PinchPhase, points: PinchPoint[]) => void,
): () => void {
	let activeIds: number[] | null = null
	let blocked = false
	const end = () => {
		if (activeIds) onGesture("end", [])
		activeIds = null
	}
	const handleTouch = (event: Event) => {
		const touchEvent = event as TouchEvent
		if (event.type === "touchcancel") {
			end()
			blocked = touchEvent.touches.length > 0
			return
		}
		const points = Array.from(touchEvent.touches, (touch) => ({
			id: touch.identifier,
			x: touch.clientX,
			y: touch.clientY,
		}))
		if (points.length !== 2) {
			if (activeIds || points.length > 2) blocked = true
			end()
			if (points.length === 0) blocked = false
			return
		}
		if (blocked) return
		if (!activeIds && event.type === "touchstart") {
			activeIds = points.map((point) => point.id)
			onGesture("start", points)
		} else if (activeIds && points.every((point) => activeIds?.includes(point.id))) {
			if (event.type === "touchmove") onGesture("move", points)
		} else {
			end()
			blocked = true
			return
		}
		if (activeIds && event.cancelable) event.preventDefault()
	}
	const events = ["touchstart", "touchmove", "touchend", "touchcancel"]
	events.forEach((name) =>
		target.addEventListener(name, handleTouch, { capture: true, passive: false }),
	)
	return () => {
		events.forEach((name) => target.removeEventListener(name, handleTouch, true))
		end()
	}
}
