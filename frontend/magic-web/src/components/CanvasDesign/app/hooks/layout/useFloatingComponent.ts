import { useCallback, useEffect, useRef } from "react"
import { useFloatingUI } from "../../providers/FloatingUIProvider"
import { useCanvas } from "../../providers/CanvasProvider"
import { isCanvasZoomWheel } from "../../../runtime/interaction/viewport/ViewportWheelPolicy"

const OVERFLOW_SCROLL_VALUES = new Set(["auto", "scroll", "overlay"])
const POINTER_INTERACTIVE_SELECTOR = [
	"button",
	"a",
	"input",
	"textarea",
	"select",
	"[role='button']",
	"[contenteditable='true']",
	"[data-floating-pan-trap='true']",
].join(",")

function isAxisScrollable(overflow: string, scrollSize: number, clientSize: number): boolean {
	return OVERFLOW_SCROLL_VALUES.has(overflow) && scrollSize > clientSize + 1
}

/**
 * 滚轮是否应由该元素做默认滚动（不转发画布）；用于常见 overflow 区域（如 MessageEditor），顶/底仍可穿透画布
 */
function elementShouldConsumeWheel(el: HTMLElement, e: WheelEvent): boolean {
	const style = getComputedStyle(el)
	const canY = isAxisScrollable(style.overflowY, el.scrollHeight, el.clientHeight)
	const canX = isAxisScrollable(style.overflowX, el.scrollWidth, el.clientWidth)
	const absY = Math.abs(e.deltaY)
	const absX = Math.abs(e.deltaX)

	if (canY && (absY >= absX || !canX)) {
		const atTop = el.scrollTop <= 0
		const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
		if (e.deltaY < 0 && !atTop) return true
		if (e.deltaY > 0 && !atBottom) return true
	}

	if (canX && (absX > absY || !canY)) {
		const atLeft = el.scrollLeft <= 0
		const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
		if (e.deltaX < 0 && !atLeft) return true
		if (e.deltaX > 0 && !atRight) return true
	}

	return false
}

/** 显式标记：滚轮始终留在 DOM 内、顶/底也不穿透（见 MessageHistory 展开提示词） */
function wheelInsideHardTrapRegion(container: HTMLElement, e: WheelEvent): boolean {
	const path = typeof e.composedPath === "function" ? (e.composedPath() as EventTarget[]) : []
	for (const node of path) {
		if (!(node instanceof HTMLElement)) continue
		if (node.dataset.wheelTrap === "hard") {
			return true
		}
		if (node === container) {
			break
		}
	}
	return false
}

function wheelShouldDeferToDomScroll(container: HTMLElement, e: WheelEvent): boolean {
	const path = typeof e.composedPath === "function" ? (e.composedPath() as EventTarget[]) : []
	for (const node of path) {
		if (!(node instanceof HTMLElement)) continue
		if (elementShouldConsumeWheel(node, e)) {
			return true
		}
		if (node === container) {
			break
		}
	}
	return false
}

function pointerShouldDeferToDomInteraction(container: HTMLElement, e: PointerEvent): boolean {
	const path = typeof e.composedPath === "function" ? (e.composedPath() as EventTarget[]) : []
	for (const node of path) {
		if (!(node instanceof HTMLElement)) continue
		if (node.matches(POINTER_INTERACTIVE_SELECTOR)) {
			return true
		}
		if (node === container) {
			break
		}
	}
	return false
}

interface UseFloatingComponentOptions {
	// 组件唯一标识
	id: string
	// 是否在 pointer hover 时临时提升层级
	interactive?: boolean
	// 是否启用 wheel 事件转发（默认 true）
	enableWheelForwarding?: boolean
	// 是否启用 PanTool 下的拖拽平移转发（默认 false）
	enablePointerPanForwarding?: boolean
}

/**
 * 悬浮组件专用 Hook
 * 自动注册组件并处理 wheel 事件转发
 */
export function useFloatingComponent(options: UseFloatingComponentOptions) {
	const {
		id,
		interactive = false,
		enableWheelForwarding = true,
		enablePointerPanForwarding = false,
	} = options
	const {
		registerFloatingComponent,
		unregisterFloatingComponent,
		activateFloatingComponent,
		deactivateFloatingComponent,
		registerFloatingRelatedElement,
		handleWheel,
	} = useFloatingUI()
	const { canvas } = useCanvas()

	const containerRef = useRef<HTMLDivElement | null>(null)
	const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null)
	const pointerPanMoveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null)
	const pointerPanUpHandlerRef = useRef<((e: PointerEvent) => void) | null>(null)

	const clearPointerPanSession = () => {
		if (pointerPanMoveHandlerRef.current) {
			window.removeEventListener("pointermove", pointerPanMoveHandlerRef.current)
			pointerPanMoveHandlerRef.current = null
		}
		if (pointerPanUpHandlerRef.current) {
			window.removeEventListener("pointerup", pointerPanUpHandlerRef.current)
			window.removeEventListener("pointercancel", pointerPanUpHandlerRef.current)
			pointerPanUpHandlerRef.current = null
		}
	}

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		// 注册组件
		registerFloatingComponent(id, container, { interactive })
		container.dataset.floatingSurfaceId = id

		const pointerEnterHandler = () => {
			if (interactive) activateFloatingComponent(id)
		}
		const pointerLeaveHandler = (event: PointerEvent) => {
			if (interactive) deactivateFloatingComponent(id, event.relatedTarget)
		}
		if (interactive) {
			container.addEventListener("pointerenter", pointerEnterHandler)
			container.addEventListener("pointerleave", pointerLeaveHandler)
		}

		// 如果启用 wheel 转发，添加事件监听
		if (enableWheelForwarding) {
			const wheelHandler = (e: WheelEvent) => {
				// Trackpad pinch is represented as ctrl/meta + wheel. It must always
				// belong to the canvas viewport, even inside scrollable popovers.
				if (isCanvasZoomWheel(e)) {
					handleWheel(e)
					return
				}
				if (wheelInsideHardTrapRegion(container, e)) {
					e.stopPropagation()
					return
				}
				if (wheelShouldDeferToDomScroll(container, e)) {
					return
				}
				handleWheel(e)
			}

			wheelHandlerRef.current = wheelHandler
			container.addEventListener("wheel", wheelHandler, { passive: false })
		}

		const pointerPanDownHandler = (e: PointerEvent) => {
			if (
				!enablePointerPanForwarding ||
				!canvas ||
				e.button !== 0 ||
				!canvas.stage.draggable() ||
				pointerPanMoveHandlerRef.current ||
				pointerShouldDeferToDomInteraction(container, e)
			) {
				return
			}

			e.preventDefault()

			const stage = canvas.stage
			const startClient = { x: e.clientX, y: e.clientY }
			const stageStart = { x: stage.x(), y: stage.y() }

			pointerPanMoveHandlerRef.current = (ev: PointerEvent) => {
				if (ev.pointerId !== e.pointerId) return
				stage.setPointersPositions(ev)
				const position = {
					x: stageStart.x + ev.clientX - startClient.x,
					y: stageStart.y + ev.clientY - startClient.y,
				}
				stage.position(position)
				stage.batchDraw()
				canvas.eventEmitter.emit({ type: "viewport:pan", data: position })
			}

			pointerPanUpHandlerRef.current = (ev: PointerEvent) => {
				if (ev.pointerId !== e.pointerId) return
				clearPointerPanSession()
			}

			window.addEventListener("pointermove", pointerPanMoveHandlerRef.current)
			window.addEventListener("pointerup", pointerPanUpHandlerRef.current)
			window.addEventListener("pointercancel", pointerPanUpHandlerRef.current)
		}

		if (enablePointerPanForwarding) {
			container.addEventListener("pointerdown", pointerPanDownHandler)
		}

		return () => {
			// 注销组件
			unregisterFloatingComponent(id)
			delete container.dataset.floatingSurfaceId
			clearPointerPanSession()

			// 移除事件监听
			if (wheelHandlerRef.current && container) {
				container.removeEventListener("wheel", wheelHandlerRef.current)
				wheelHandlerRef.current = null
			}
			if (enablePointerPanForwarding) {
				container.removeEventListener("pointerdown", pointerPanDownHandler)
			}
			if (interactive) {
				container.removeEventListener("pointerenter", pointerEnterHandler)
				container.removeEventListener("pointerleave", pointerLeaveHandler)
			}
		}
	}, [
		canvas,
		id,
		interactive,
		enableWheelForwarding,
		enablePointerPanForwarding,
		registerFloatingComponent,
		unregisterFloatingComponent,
		handleWheel,
		activateFloatingComponent,
		deactivateFloatingComponent,
	])

	const registerRelatedElement = useCallback(
		(element: HTMLElement | null) => {
			if (!element || !interactive) return () => undefined
			return registerFloatingRelatedElement(id, element)
		},
		[id, interactive, registerFloatingRelatedElement],
	)

	return {
		containerRef,
		registerRelatedElement,
	}
}
