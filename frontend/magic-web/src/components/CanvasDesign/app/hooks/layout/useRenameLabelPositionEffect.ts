import { useCallback, useLayoutEffect, useRef } from "react"
import { useCanvas } from "../../providers/CanvasProvider"
import { useCanvasEvents } from "../canvas"

export interface UseRenameLabelPositionEffectOptions {
	elementId: string
	inputRef: React.RefObject<HTMLInputElement | null>
	/** 输入内容变化时重新测量宽度 */
	value: string
	/** 当前重命名元素被删除时回调 */
	onTargetDeleted: () => void
	/** 图片使用固定宽度面板；普通元素继续与原名称行对齐。 */
	panel?: boolean
}

/**
 * 将重命名输入框定位到画布名称标签（Konva）对应的屏幕坐标，
 * 与 useElementPositionEffect 相同：直接更新 DOM transform，避免无关节点重渲染。
 */
export default function useRenameLabelPositionEffect(options: UseRenameLabelPositionEffectOptions) {
	const { elementId, inputRef, value, onTargetDeleted, panel = false } = options
	const { canvas } = useCanvas()
	const containerRef = useRef<HTMLDivElement | null>(null)
	const positionFrameRef = useRef<number | null>(null)

	const updatePosition = useCallback(() => {
		if (!canvas || !elementId || !containerRef.current || !inputRef.current) {
			return
		}

		const layout = canvas.nameLabelManager.getRenameInputLayout(elementId)
		if (!layout) {
			return
		}
		if (panel) {
			const node = containerRef.current
			const { clientWidth: width, clientHeight: height } = canvas.container
			const margin = 8
			node.style.width = `${Math.max(0, Math.min(384, width - margin * 2))}px`
			node.style.maxHeight = `${Math.max(0, height - margin * 2)}px`
			const bounds = canvas.elementManager.getElementInstance(elementId)?.getBoundingRect()
			const scale = canvas.stage.scaleX()
			const right = bounds
				? (bounds.x + bounds.width) * scale + canvas.stage.x() + 12
				: layout.x
			const left = layout.x - node.offsetWidth - 12
			const x =
				right + node.offsetWidth <= width - margin
					? right
					: left >= margin
						? left
						: layout.x
			const y =
				right + node.offsetWidth <= width - margin || left >= margin
					? layout.y - 16
					: layout.y + layout.height + 8
			node.style.transform = `translate(${Math.max(margin, Math.min(x, width - node.offsetWidth - margin))}px, ${Math.max(margin, Math.min(y, height - node.offsetHeight - margin))}px)`
			return
		}

		// 与下方 input 高度公式保持一致：DOM 输入框往往比 Konva Text 更高，若左上角与 layout 对齐会向下压住元素。
		// 向上平移「多出来的高度」，使输入框底边与标签文字底边大致对齐（layout.y + layout.height）。
		const inputHeightPx = Math.max(layout.height + 6, 22)
		const verticalAlignOffset = inputHeightPx - layout.height
		const translateY = layout.y - verticalAlignOffset
		containerRef.current.style.transform = `translate(${layout.x}px, ${translateY}px)`
		inputRef.current.style.width = "1px"
		inputRef.current.style.height = `${inputHeightPx}px`
		inputRef.current.style.fontSize = `${layout.fontSize}px`
		inputRef.current.style.fontFamily = layout.fontFamily
		inputRef.current.style.color = layout.color
		inputRef.current.style.width = `${Math.max(
			inputRef.current.scrollWidth + 16,
			layout.width + 16,
			72,
		)}px`
	}, [canvas, elementId, inputRef, panel])

	const cancelScheduledPositionUpdate = useCallback(() => {
		if (positionFrameRef.current === null) return
		const cancel =
			typeof cancelAnimationFrame === "function"
				? cancelAnimationFrame
				: (frameId: number) => globalThis.clearTimeout(frameId)
		cancel(positionFrameRef.current)
		positionFrameRef.current = null
	}, [])

	const schedulePositionUpdate = useCallback(() => {
		if (positionFrameRef.current !== null) return
		const schedule =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: FrameRequestCallback) =>
						globalThis.setTimeout(
							() => callback(performance.now()),
							16,
						) as unknown as number
		positionFrameRef.current = schedule(() => {
			positionFrameRef.current = null
			updatePosition()
		})
	}, [updatePosition])

	useCanvasEvents(
		[
			"canvas:resize",
			"viewport:scale",
			"viewport:pan",
			"element:updated",
			"element:rerendered",
			"elements:transform:dragmove",
			"elements:transform:anchorDragmove",
			"element:deleted",
		] as const,
		(
			resizeEvent,
			scaleEvent,
			panEvent,
			updatedEvent,
			rerenderedEvent,
			dragMoveEvent,
			anchorDragMoveEvent,
			deletedEvent,
		) => {
			void resizeEvent
			void scaleEvent
			void panEvent

			if (!elementId) {
				return
			}

			if (deletedEvent?.data.elementId === elementId) {
				cancelScheduledPositionUpdate()
				onTargetDeleted()
				return
			}

			if (
				updatedEvent &&
				updatedEvent.data.elementId !== elementId &&
				rerenderedEvent === undefined
			) {
				return
			}

			if (
				rerenderedEvent &&
				rerenderedEvent.data.elementId !== elementId &&
				updatedEvent === undefined
			) {
				return
			}

			if (
				dragMoveEvent &&
				!dragMoveEvent.data.elementIds.includes(elementId) &&
				anchorDragMoveEvent === undefined
			) {
				return
			}

			if (
				anchorDragMoveEvent &&
				!anchorDragMoveEvent.data.elementIds.includes(elementId) &&
				dragMoveEvent === undefined
			) {
				return
			}

			// Pan, scale and transform events can arrive together in one turn. Keep the
			// single-element rename overlay off that synchronous event chain and measure it
			// once in the next frame.
			schedulePositionUpdate()
		},
		[elementId, cancelScheduledPositionUpdate, onTargetDeleted, schedulePositionUpdate],
	)
	useCanvasEvents(
		[
			"viewport:changed",
			"elements:transform:dragend",
			"elements:transform:anchorDragend",
		] as const,
		(viewportChangedEvent, dragEndEvent, anchorDragEndEvent) => {
			if (viewportChangedEvent && viewportChangedEvent.data.phase !== "end") return
			const transformEndEvent = dragEndEvent || anchorDragEndEvent
			if (transformEndEvent && !transformEndEvent.data.elementIds.includes(elementId)) return
			schedulePositionUpdate()
		},
		[elementId, schedulePositionUpdate],
	)

	useLayoutEffect(() => {
		if (!elementId) {
			return
		}

		cancelScheduledPositionUpdate()
		updatePosition()
	}, [cancelScheduledPositionUpdate, elementId, value, updatePosition])

	useLayoutEffect(() => {
		return () => cancelScheduledPositionUpdate()
	}, [cancelScheduledPositionUpdate, elementId, updatePosition])

	useLayoutEffect(() => {
		if (!panel || !containerRef.current || !canvas) return
		// 长名称和错误提示会改变面板高度；仍须留在画布视口内。
		const observer = new ResizeObserver(schedulePositionUpdate)
		observer.observe(containerRef.current)
		observer.observe(canvas.container)
		return () => observer.disconnect()
	}, [canvas, panel, schedulePositionUpdate])

	return {
		containerRef,
	}
}
