import { useEffect, useRef, useState, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { getResizeCollapseIntent, type ResizeCollapseIntent } from "@/utils/resizableCollapse"

interface SidebarCollapseDrag extends ResizeCollapseIntent {
	pointerId: number
	startX: number
	startWidthPx: number
	minWidthPx: number
	released: boolean
	cancelled: boolean
}

interface UseSidebarCollapseDragParams {
	sidebarPanelRef: RefObject<ImperativePanelHandle>
	minSizePercent: number
	enabled: boolean
	onCancel: (widthPx: number, restorePanel: boolean) => void
}

const EMPTY_INTENT: ResizeCollapseIntent = { progress: 0, armed: false }

/** 原生分栏负责实际宽度；这里仅跟踪越界意图，并把取消交回同一拖动生命周期。 */
export default function useSidebarCollapseDrag({
	sidebarPanelRef,
	minSizePercent,
	enabled,
	onCancel,
}: UseSidebarCollapseDragParams) {
	const pointerDownRef = useRef<{ pointerId: number; clientX: number } | null>(null)
	const dragRef = useRef<SidebarCollapseDrag | null>(null)
	const [intent, setIntent] = useState(EMPTY_INTENT)
	const [dragging, setDragging] = useState(false)
	const [cancelled, setCancelled] = useState(false)

	const cancelDrag = useMemoizedFn(() => {
		const drag = dragRef.current
		if (!drag || drag.cancelled) return
		drag.cancelled = true
		onCancel(drag.startWidthPx, true)
		setIntent(EMPTY_INTENT)
		// disabled 会使原生手柄注销并触发 onDragging(false)，终止后续指针改宽。
		setCancelled(true)
	})

	const updateIntent = useMemoizedFn((event: PointerEvent) => {
		const drag = dragRef.current
		if (!drag || drag.cancelled || event.pointerId !== drag.pointerId) return
		const next = getResizeCollapseIntent(
			drag.startWidthPx + event.clientX - drag.startX,
			drag.minWidthPx,
			drag.armed,
		)
		drag.progress = next.progress
		drag.armed = next.armed
		setIntent((previous) =>
			previous.progress === next.progress && previous.armed === next.armed ? previous : next,
		)
	})

	const handleDragging = useMemoizedFn((isDragging: boolean) => {
		if (isDragging) {
			const pointer = pointerDownRef.current
			const panel = sidebarPanelRef.current
			if (!enabled || !pointer || !panel) return null
			dragRef.current = {
				...EMPTY_INTENT,
				pointerId: pointer.pointerId,
				startX: pointer.clientX,
				startWidthPx: (panel.getSize() / 100) * window.innerWidth,
				minWidthPx: (minSizePercent / 100) * window.innerWidth,
				released: false,
				cancelled: false,
			}
			setDragging(true)
			return null
		}

		const drag = dragRef.current
		// 卸载、禁用或上下文菜单引起的结束不能当成用户松手提交。
		if (drag && !drag.released) cancelDrag()
		dragRef.current = null
		pointerDownRef.current = null
		setDragging(false)
		setCancelled(false)
		setIntent(EMPTY_INTENT)
		return drag && !drag.cancelled ? drag : null
	})

	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			if (dragRef.current) return
			pointerDownRef.current = { pointerId: event.pointerId, clientX: event.clientX }
		}
		function handlePointerMove(event: PointerEvent) {
			if (event.buttons === 0) cancelDrag()
			else updateIntent(event)
		}
		function handlePointerUp(event: PointerEvent) {
			const drag = dragRef.current
			if (!drag || event.pointerId !== drag.pointerId) return
			updateIntent(event)
			drag.released = true
		}
		function handlePointerCancel(event: PointerEvent) {
			if (dragRef.current?.pointerId === event.pointerId) cancelDrag()
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape" || !dragRef.current) return
			event.preventDefault()
			cancelDrag()
		}

		// 原生库在 body 捕获 pointerdown，随后才注册 window 的结束监听。
		// 提前在 window 捕获起点和最后一次 pointerup，覆盖扩大的手柄命中区域。
		window.addEventListener("pointerdown", handlePointerDown, true)
		window.addEventListener("pointermove", handlePointerMove, true)
		window.addEventListener("pointerup", handlePointerUp, true)
		window.addEventListener("pointercancel", handlePointerCancel, true)
		window.addEventListener("keydown", handleKeyDown, true)
		window.addEventListener("resize", cancelDrag)
		window.addEventListener("blur", cancelDrag)
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown, true)
			window.removeEventListener("pointermove", handlePointerMove, true)
			window.removeEventListener("pointerup", handlePointerUp, true)
			window.removeEventListener("pointercancel", handlePointerCancel, true)
			window.removeEventListener("keydown", handleKeyDown, true)
			window.removeEventListener("resize", cancelDrag)
			window.removeEventListener("blur", cancelDrag)
			const drag = dragRef.current
			if (drag && !drag.cancelled) onCancel(drag.startWidthPx, false)
			dragRef.current = null
		}
	}, [cancelDrag, onCancel, updateIntent])

	useEffect(() => {
		if (!enabled) cancelDrag()
	}, [cancelDrag, enabled])

	return { ...intent, dragging, cancelled, handleDragging }
}
