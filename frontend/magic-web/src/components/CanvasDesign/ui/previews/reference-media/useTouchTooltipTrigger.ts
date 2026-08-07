import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react"

interface UseTouchTooltipTriggerOptions {
	open: boolean
	onClose: () => void
}

/**
 * Tooltip 在触屏设备上不会走 hover 触发；媒体槽位需要把一次触屏点击转换为受控打开，
 * 同时阻止点击继续冒泡到槽位的资源替换行为。
 */
export function useTouchTooltipTrigger(onOpen: () => void, options: UseTouchTooltipTriggerOptions) {
	const touchInteractionRef = useRef(false)
	const { open, onClose } = options

	useEffect(() => {
		if (!open) return
		const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target
			if (!(target instanceof Element)) return
			if (
				target.closest(
					"[data-reference-media-tooltip-trigger], [data-reference-media-tooltip-content]",
				)
			) {
				return
			}
			onClose()
		}
		document.addEventListener("pointerdown", handleDocumentPointerDown, true)
		return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, true)
	}, [onClose, open])

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLElement>) => {
			if (event.pointerType !== "touch") return
			touchInteractionRef.current = true
			event.preventDefault()
			event.stopPropagation()
			onOpen()
		},
		[onOpen],
	)

	const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
		if (!touchInteractionRef.current) return
		touchInteractionRef.current = false
		event.preventDefault()
		event.stopPropagation()
	}, [])

	const handlePointerCancel = useCallback(() => {
		touchInteractionRef.current = false
	}, [])

	return {
		handlePointerDown,
		handleClick,
		handlePointerCancel,
	}
}
