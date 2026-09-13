import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { useMemoizedFn } from "ahooks"

export interface DialogWindowSize {
	width: number
	height: number
}

export interface DialogWindowOptions {
	/** 与所属 Dialog 使用同一个开关；保留挂载的窗口也能在重开时居中。 */
	open: boolean
	draggable?: boolean
	resizable?: boolean
	defaultSize: DialogWindowSize
	minSize: DialogWindowSize
	sizeStorageKey?: string
	dragHandleSelector?: string
}

export type DialogResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
type WindowGesture = DialogResizeDirection | "move"
interface WindowRect extends DialogWindowSize {
	left: number
	top: number
}
interface Gesture {
	direction: WindowGesture
	pointerId: number
	x: number
	y: number
	start: WindowRect
	target: HTMLElement
}

const VIEWPORT_MARGIN = 16
const INTERACTIVE_SELECTOR =
	"button, input, textarea, select, a, [role=button], [contenteditable]:not([contenteditable=false]), [data-dialog-resize-handle]"

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), Math.max(min, max))
}

function getViewport(): WindowRect {
	const viewport = window.visualViewport
	return {
		left: (viewport?.offsetLeft ?? 0) + VIEWPORT_MARGIN,
		top: (viewport?.offsetTop ?? 0) + VIEWPORT_MARGIN,
		width: Math.max(1, (viewport?.width ?? window.innerWidth) - VIEWPORT_MARGIN * 2),
		height: Math.max(1, (viewport?.height ?? window.innerHeight) - VIEWPORT_MARGIN * 2),
	}
}

function constrainRect(rect: WindowRect, minSize: DialogWindowSize): WindowRect {
	const viewport = getViewport()
	const width = clamp(rect.width, Math.min(minSize.width, viewport.width), viewport.width)
	const height = clamp(rect.height, Math.min(minSize.height, viewport.height), viewport.height)
	return {
		width,
		height,
		left: clamp(rect.left, viewport.left, viewport.left + viewport.width - width),
		top: clamp(rect.top, viewport.top, viewport.top + viewport.height - height),
	}
}

function readSize(key: string | undefined, fallback: DialogWindowSize): DialogWindowSize {
	if (!key) return fallback
	try {
		const raw = localStorage.getItem(key)
		const value: unknown = raw ? JSON.parse(raw) : null
		if (
			value &&
			typeof value === "object" &&
			"width" in value &&
			typeof value.width === "number" &&
			Number.isFinite(value.width) &&
			value.width > 0 &&
			"height" in value &&
			typeof value.height === "number" &&
			Number.isFinite(value.height) &&
			value.height > 0
		)
			return { width: value.width, height: value.height }
	} catch {
		// 尺寸只是偏好；损坏或不可用的本地存储不应阻止窗口打开。
	}
	return fallback
}

/** 只管理当前弹窗的矩形；业务数据、焦点与浮层层级仍由调用方和 Radix 管理。 */
export function useDialogWindow(options?: DialogWindowOptions) {
	const [rect, setRect] = useState<WindowRect | null>(null)
	const rectRef = useRef<WindowRect | null>(null)
	const gestureRef = useRef<Gesture | null>(null)
	const preferredSizeRef = useRef<DialogWindowSize | null>(null)
	const lastStorageKeyRef = useRef(options?.sizeStorageKey)
	const open = options?.open ?? false
	const storageKey = options?.sizeStorageKey

	const updateRect = useMemoizedFn((next: WindowRect) => {
		rectRef.current = next
		setRect(next)
	})
	const endGesture = useMemoizedFn((cancel: boolean) => {
		const gesture = gestureRef.current
		if (!gesture) return false
		gestureRef.current = null
		if (cancel) {
			if (options) updateRect(constrainRect(gesture.start, options.minSize))
		} else if (
			gesture.direction !== "move" &&
			rectRef.current &&
			(rectRef.current.width !== gesture.start.width ||
				rectRef.current.height !== gesture.start.height)
		) {
			const { width, height } = rectRef.current
			const size = { width, height }
			preferredSizeRef.current = size
			if (storageKey) {
				try {
					localStorage.setItem(storageKey, JSON.stringify(size))
				} catch {
					// 保存失败仍保留本次挂载期间的尺寸，拖动位置从不持久化。
				}
			}
		}
		if (gesture.target.hasPointerCapture(gesture.pointerId))
			gesture.target.releasePointerCapture(gesture.pointerId)
		return true
	})

	const resetWindow = useMemoizedFn(() => {
		if (!options) return
		if (lastStorageKeyRef.current !== storageKey) preferredSizeRef.current = null
		lastStorageKeyRef.current = storageKey
		const size = readSize(storageKey, preferredSizeRef.current ?? options.defaultSize)
		preferredSizeRef.current = size
		const viewport = getViewport()
		const next = constrainRect(
			{ ...size, left: viewport.left, top: viewport.top },
			options.minSize,
		)
		updateRect({
			...next,
			left: viewport.left + (viewport.width - next.width) / 2,
			top: viewport.top + (viewport.height - next.height) / 2,
		})
	})

	useLayoutEffect(() => {
		if (!open) return
		resetWindow()
		const constrain = () => {
			endGesture(true)
			if (options && rectRef.current)
				updateRect(constrainRect(rectRef.current, options.minSize))
		}
		// 自动适配小屏只改变显示矩形，不把临时缩小后的尺寸写回偏好。
		window.addEventListener("resize", constrain)
		window.visualViewport?.addEventListener("resize", constrain)
		window.visualViewport?.addEventListener("scroll", constrain)
		return () => {
			endGesture(true)
			window.removeEventListener("resize", constrain)
			window.visualViewport?.removeEventListener("resize", constrain)
			window.visualViewport?.removeEventListener("scroll", constrain)
		}
		// 配置对象每次 render 可重新创建；仅开关和存储身份改变时重置位置。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, storageKey])

	const startGesture = useMemoizedFn(
		(event: PointerEvent<HTMLElement>, direction: WindowGesture) => {
			if (!open || !options || event.button !== 0 || !event.isPrimary || gestureRef.current)
				return
			if (direction === "move" ? !options.draggable : !options.resizable) return
			const start = rectRef.current
			if (!start) return
			event.preventDefault()
			gestureRef.current = {
				direction,
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				start,
				target: event.currentTarget,
			}
			event.currentTarget.setPointerCapture(event.pointerId)
		},
	)

	const onPointerDown = useMemoizedFn((event: PointerEvent<HTMLDivElement>) => {
		if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_SELECTOR)) return
		const handle = event.target.closest(
			options?.dragHandleSelector ?? "[data-dialog-drag-handle]",
		)
		if (handle && event.currentTarget.contains(handle)) startGesture(event, "move")
	})
	const onPointerMove = useMemoizedFn((event: PointerEvent<HTMLDivElement>) => {
		const gesture = gestureRef.current
		if (!gesture || !options || gesture.pointerId !== event.pointerId) return
		const { start, direction } = gesture
		const dx = event.clientX - gesture.x
		const dy = event.clientY - gesture.y
		if (direction === "move") {
			updateRect(
				constrainRect(
					{ ...start, left: start.left + dx, top: start.top + dy },
					options.minSize,
				),
			)
			return
		}
		const viewport = getViewport()
		const minWidth = Math.min(options.minSize.width, viewport.width)
		const minHeight = Math.min(options.minSize.height, viewport.height)
		let { left, top } = start
		let right = left + start.width
		let bottom = top + start.height
		// 拖左／上边时固定对边；窗口不会因为尺寸变化再次居中。
		if (direction.includes("e"))
			right = clamp(right + dx, left + minWidth, viewport.left + viewport.width)
		if (direction.includes("w")) left = clamp(left + dx, viewport.left, right - minWidth)
		if (direction.includes("s"))
			bottom = clamp(bottom + dy, top + minHeight, viewport.top + viewport.height)
		if (direction.includes("n")) top = clamp(top + dy, viewport.top, bottom - minHeight)
		updateRect({ left, top, width: right - left, height: bottom - top })
	})
	const onPointerUp = useMemoizedFn((event: PointerEvent<HTMLDivElement>) => {
		if (gestureRef.current?.pointerId === event.pointerId) endGesture(false)
	})
	const onPointerCancel = useMemoizedFn((event: PointerEvent<HTMLDivElement>) => {
		if (gestureRef.current?.pointerId === event.pointerId) endGesture(true)
	})
	const onEscapeKeyDown = useMemoizedFn((event: KeyboardEvent) => {
		if (endGesture(true)) event.preventDefault()
	})
	const style: CSSProperties | undefined =
		options && rect
			? {
					...rect,
					right: "auto",
					bottom: "auto",
					maxWidth: "none",
					maxHeight: "none",
					transform: "none",
					translate: "none",
				}
			: undefined

	return {
		style,
		startGesture,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
		onEscapeKeyDown,
	}
}
