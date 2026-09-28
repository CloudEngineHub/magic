import { useLayoutEffect, useRef, useState } from "react"

/** 用真实行距裁出下一行的一半；容器负责可用高度，viewport 负责滚动，避免测量自身导致反复缩小。 */
export function useSelectionListViewport(rowSelector: string, itemCount: number, layout?: string) {
	const containerRef = useRef<HTMLDivElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const [height, setHeight] = useState<number>()
	useLayoutEffect(() => {
		const container = containerRef.current
		const viewport = viewportRef.current
		if (!container || !viewport) return
		const measure = () => {
			const available = container.clientHeight
			const rows = viewport.querySelectorAll<HTMLElement>(rowSelector)
			const first = rows[0]
			if (!first || !available || viewport.scrollHeight <= available) {
				setHeight(undefined)
				return
			}
			const firstRect = first.getBoundingClientRect()
			// 入场缩放动画会缩放 DOMRect；用视口比例还原布局像素，不能把动画中的尺寸保存为列表高度。
			const viewportRect = viewport.getBoundingClientRect()
			const scale = viewport.offsetWidth ? viewportRect.width / viewport.offsetWidth : 1
			const next = Array.from(rows).find(
				(row) => row.getBoundingClientRect().top > firstRect.top + 1,
			)
			const stride =
				(next ? next.getBoundingClientRect().top - firstRect.top : firstRect.height) / scale
			const padding = (firstRect.top - viewportRect.top) / scale + viewport.scrollTop
			if (stride <= 0) return
			const halfRow = firstRect.height / scale / 2
			const wholeRows = Math.floor((available - padding - halfRow) / stride)
			setHeight(
				wholeRows >= 0
					? Math.min(available, padding + wholeRows * stride + halfRow)
					: undefined,
			)
		}
		const observer = new ResizeObserver(measure)
		observer.observe(container)
		if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
		measure()
		return () => observer.disconnect()
	}, [rowSelector, itemCount, layout])
	return { containerRef, viewportRef, height }
}
