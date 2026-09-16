import { useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"

export function useSpeakerNotesResize() {
	const panelRef = useRef<HTMLElement>(null)
	const dragRef = useRef<{ y: number; height: number } | null>(null)
	const [height, setHeight] = useState(180)

	function resize(nextHeight: number) {
		const parentHeight = panelRef.current?.parentElement?.clientHeight || 650
		setHeight(Math.max(100, Math.min(nextHeight, parentHeight * 0.4)))
	}

	function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
		if (event.button !== 0) return
		dragRef.current = {
			y: event.clientY,
			height: panelRef.current?.getBoundingClientRect().height || height,
		}
		// Capture keeps resizing active when the pointer crosses the slide iframe.
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
		if (!dragRef.current) return
		resize(dragRef.current.height + dragRef.current.y - event.clientY)
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
		event.preventDefault()
		// Arrow keys resize this panel instead of triggering window-level slide navigation.
		event.stopPropagation()
		resize(height + (event.key === "ArrowUp" ? 20 : -20))
	}

	return {
		panelRef,
		height,
		resizeHandleProps: {
			onPointerDown,
			onPointerMove,
			onPointerUp: () => (dragRef.current = null),
			onPointerCancel: () => (dragRef.current = null),
			onLostPointerCapture: () => (dragRef.current = null),
			onKeyDown,
		},
	}
}
