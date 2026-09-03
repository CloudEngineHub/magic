import type { MouseEvent, MutableRefObject, RefObject } from "react"
import { useCallback, useRef } from "react"

interface UseDataGridAutoScrollOptions {
	rootRef: RefObject<HTMLDivElement | null>
	draggingRef: MutableRefObject<boolean>
	pointerRef: MutableRefObject<{ x: number; y: number } | null>
	updateSelectionFromPoint: (x: number, y: number, container?: HTMLElement | null) => boolean
	advanceSelectionColumn: (direction: 1 | -1) => void
}

/**
 * 单元格拖选接近横向边缘时自动滚动，并持续更新当前选区。
 * 独立为 hook，避免展示组件同时承担动画帧和滚动状态管理。
 */
export function useDataGridAutoScroll({
	rootRef,
	draggingRef,
	pointerRef,
	updateSelectionFromPoint,
	advanceSelectionColumn,
}: UseDataGridAutoScrollOptions) {
	const autoScrollFrameRef = useRef<number | null>(null)

	const cancelAutoScroll = useCallback(() => {
		if (autoScrollFrameRef.current === null) return
		window.cancelAnimationFrame(autoScrollFrameRef.current)
		autoScrollFrameRef.current = null
	}, [])

	const runAutoScroll = useCallback(() => {
		autoScrollFrameRef.current = null
		if (!draggingRef.current || !pointerRef.current || !rootRef.current) return

		const container = rootRef.current
		const rect = container.getBoundingClientRect()
		const edgeSize = 56
		const maxStep = 28
		const { x, y } = pointerRef.current
		let scrollStep = 0

		if (x > rect.right - edgeSize) {
			scrollStep = Math.min(maxStep, Math.ceil(x - (rect.right - edgeSize)))
		} else if (x < rect.left + edgeSize) {
			scrollStep = -Math.min(maxStep, Math.ceil(rect.left + edgeSize - x))
		}

		if (scrollStep === 0) return

		container.scrollLeft += scrollStep
		const updated = updateSelectionFromPoint(x, y, container)
		if (!updated) advanceSelectionColumn(scrollStep > 0 ? 1 : -1)
		autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
	}, [advanceSelectionColumn, draggingRef, pointerRef, rootRef, updateSelectionFromPoint])

	const scheduleAutoScroll = useCallback(() => {
		if (autoScrollFrameRef.current !== null) return
		autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
	}, [runAutoScroll])

	const handleGridMouseMove = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!draggingRef.current) return
			pointerRef.current = { x: event.clientX, y: event.clientY }
			scheduleAutoScroll()
		},
		[draggingRef, pointerRef, scheduleAutoScroll],
	)

	return { cancelAutoScroll, handleGridMouseMove, scheduleAutoScroll }
}
