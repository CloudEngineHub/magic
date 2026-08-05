import { useState, useCallback, useRef, useEffect } from "react"
import { useMemoizedFn, useMount } from "ahooks"

interface UseResizablePanelOptions {
	minWidth: number
	maxWidth: number
	defaultWidth: number
	storageKey: string
	/**
	 * 拖拽方向
	 * - "left": 向左拖拽增加宽度（用于右侧边框，如 ProjectSider）
	 * - "right": 向右拖拽增加宽度（用于左侧边框，如消息区域）
	 */
	direction?: "left" | "right"
}

interface UseResizablePanelReturn {
	width: number
	isDragging: boolean
	handleResizeStart: (clientX: number) => void
}

function useResizablePanel({
	minWidth,
	maxWidth,
	defaultWidth,
	storageKey,
	direction = "right",
}: UseResizablePanelOptions): UseResizablePanelReturn {
	// 从 localStorage 读取保存的宽度，如果没有则使用默认值
	const getInitialWidth = useCallback(() => {
		try {
			const savedWidth = localStorage.getItem(storageKey)
			if (savedWidth) {
				const width = parseInt(savedWidth, 10)
				// 确保读取的值在有效范围内
				if (!isNaN(width) && width >= minWidth && width <= maxWidth) {
					return width
				}
			}
		} catch (error) {
			console.error("Failed to read from localStorage:", error)
		}
		return defaultWidth
	}, [storageKey, minWidth, maxWidth, defaultWidth])

	const [width, setWidth] = useState<number>(getInitialWidth)
	const [isDragging, setIsDragging] = useState(false)
	// 使用 ref 追踪最新的宽度值，避免闭包陷阱
	const widthRef = useRef<number>(getInitialWidth())
	const cleanupDragRef = useRef<(() => void) | null>(null)

	// 同步 width 到 ref
	useEffect(() => {
		widthRef.current = width
	}, [width])

	useEffect(() => {
		const nextWidth = Math.max(minWidth, Math.min(maxWidth, widthRef.current))
		if (nextWidth === widthRef.current) return

		widthRef.current = nextWidth
		setWidth(nextWidth)
	}, [maxWidth, minWidth])

	// 组件挂载后从 localStorage 初始化宽度
	useMount(() => {
		const initialWidth = getInitialWidth()
		setWidth(initialWidth)
		widthRef.current = initialWidth
	})

	// 保存宽度到 localStorage
	const saveWidth = useMemoizedFn((newWidth: number) => {
		try {
			localStorage.setItem(storageKey, newWidth.toString())
		} catch (error) {
			console.error("Failed to save to localStorage:", error)
		}
	})

	/** Starts resizing from a normalized pointer coordinate shared by mouse and touch input. */
	const handleResizeStart = useMemoizedFn((clientX: number) => {
		// A new resize can replace an unfinished one, so remove stale document listeners first.
		cleanupDragRef.current?.()
		setIsDragging(true)

		const startX = clientX
		const startWidth = widthRef.current // 使用 ref 获取最新值

		/** Updates panel width during pointer movement while preserving the existing direction rules. */
		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - startX
			// direction="left": 向左拖拽增加宽度（用于右侧边框，如 ProjectSider）
			// direction="right": 向右拖拽增加宽度（用于左侧边框，如消息区域）
			const newWidth =
				direction === "left"
					? Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX))
					: Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX))
			setWidth(newWidth)
			widthRef.current = newWidth // 实时更新 ref
		}

		/** Finishes a normal drag and persists the last observed width. */
		const handlePointerUp = () => {
			setIsDragging(false)
			// 使用 ref 获取最新的宽度值并保存
			const finalWidth = widthRef.current
			saveWidth(finalWidth)
			cleanupDragRef.current?.()
		}

		/** Cancels a drag without persisting a browser-aborted touch gesture. */
		const handlePointerCancel = () => {
			setIsDragging(false)
			cleanupDragRef.current?.()
		}

		cleanupDragRef.current = () => {
			document.removeEventListener("pointermove", handlePointerMove)
			document.removeEventListener("pointerup", handlePointerUp)
			document.removeEventListener("pointercancel", handlePointerCancel)
			cleanupDragRef.current = null
		}

		document.addEventListener("pointermove", handlePointerMove)
		document.addEventListener("pointerup", handlePointerUp)
		document.addEventListener("pointercancel", handlePointerCancel)
	})

	useEffect(() => {
		return () => {
			// Unmounts during an active drag must not leave document listeners behind.
			cleanupDragRef.current?.()
		}
	}, [])

	return {
		width,
		isDragging,
		handleResizeStart,
	}
}

export default useResizablePanel
