import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { reaction } from "mobx"
import { pptNotesPreferenceStore } from "@/stores/layout/PPTNotesPreferenceStore"

export function useSpeakerNotesResize() {
	const panelRef = useRef<HTMLElement>(null)
	const dragRef = useRef<{ y: number; height: number } | null>(null)
	const [height, setHeight] = useState(pptNotesPreferenceStore.height)
	const heightRef = useRef(height)

	useEffect(() => reaction(() => pptNotesPreferenceStore.height, setHeight), [])

	function resize(nextHeight: number) {
		const parentHeight = panelRef.current?.parentElement?.clientHeight || 650
		heightRef.current = Math.max(100, Math.min(nextHeight, parentHeight * 0.4))
		setHeight(heightRef.current)
	}

	function finishResize() {
		if (!dragRef.current) return
		dragRef.current = null
		// Persist once per gesture, avoiding synchronous storage writes on every pointer move.
		pptNotesPreferenceStore.setHeight(heightRef.current)
	}

	function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
		if (event.button !== 0) return
		dragRef.current = {
			y: event.clientY,
			height: panelRef.current?.getBoundingClientRect().height || height,
		}
		heightRef.current = height
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
		pptNotesPreferenceStore.setHeight(heightRef.current)
	}

	return {
		panelRef,
		height,
		resizeHandleProps: {
			onPointerDown,
			onPointerMove,
			onPointerUp: finishResize,
			onPointerCancel: finishResize,
			onLostPointerCapture: finishResize,
			onKeyDown,
		},
	}
}
