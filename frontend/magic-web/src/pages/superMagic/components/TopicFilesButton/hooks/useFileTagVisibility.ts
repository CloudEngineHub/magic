import { useEffect, type RefObject } from "react"

/**
 * 文件名与完整标签都放得下才显示标签。每个列表只观察容器及已挂载行，虚拟树不扫描未渲染数据。
 * 先将标签移出布局再测量，避免上次显隐改变可用宽度后产生反复跳动；隐藏标签同时退出键盘焦点。
 */
export function useFileTagVisibility(containerRef: RefObject<HTMLElement>) {
	useEffect(() => {
		const container = containerRef.current
		if (!container) return
		let frame = 0
		let disposed = false
		const measure = () => {
			frame = 0
			const rows = [...container.querySelectorAll<HTMLElement>("[data-file-label-row]")]
			const entries = rows.flatMap((row) => {
				const tag = row.querySelector<HTMLElement>("[data-file-tag]")
				const region = row.querySelector<HTMLElement>("[data-file-name-container]")
				const name = row.querySelector<HTMLElement>("[data-file-name]")
				if (!tag || !region || !name) return []
				tag.style.position = "absolute"
				tag.style.visibility = "hidden"
				tag.style.width = "max-content"
				tag.style.maxWidth = "none"
				return [{ row, tag, region, name }]
			})
			const visibility = entries.map(({ row, tag, region, name }) => {
				const range = document.createRange()
				const textNodes = document.createTreeWalker(name, NodeFilter.SHOW_TEXT)
				let textWidth = 0
				while (textNodes.nextNode()) {
					range.selectNodeContents(textNodes.currentNode)
					textWidth += range.getBoundingClientRect().width
				}
				const available =
					region.getBoundingClientRect().right - name.getBoundingClientRect().left
				const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
				return textWidth + tag.getBoundingClientRect().width + gap <= available
			})
			entries.forEach(({ tag }, index) => {
				const visible = visibility[index]
				tag.style.position = visible ? "" : "absolute"
				tag.style.visibility = visible ? "" : "hidden"
				tag.inert = !visible
			})
		}
		const schedule = () => {
			if (!disposed && !frame) frame = requestAnimationFrame(measure)
		}
		const resize = new ResizeObserver(schedule)
		const mutation = new MutationObserver(schedule)
		resize.observe(container)
		mutation.observe(container, { childList: true, subtree: true, characterData: true })
		document.fonts.ready.then(schedule)
		schedule()
		return () => {
			disposed = true
			resize.disconnect()
			mutation.disconnect()
			cancelAnimationFrame(frame)
		}
	}, [containerRef])
}
