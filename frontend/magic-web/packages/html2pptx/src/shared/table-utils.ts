/**
 * 表格工具函数
 * 提供表格解析过程中使用的各类辅助计算方法
 */

import type { SlideConfig } from "../api/options"
import { hasVisibleBackground } from "./color"
import { pxToInch } from "./unit"

/**
 * 获取被 text-overflow: ellipsis 截断后的可见文本
 *
 * 当元素同时满足 overflow:hidden + text-overflow:ellipsis 且
 * 内容实际溢出时，克隆一个同样式的隐藏容器，利用浏览器真实排版
 * 通过二分查找定位能容纳的最大字符数，末尾追加省略号。
 *
 * 相比 Canvas measureText，这种方式能正确反映 padding、border、
 * letter-spacing、font kerning 等所有 CSS 属性对文本宽度的影响。
 */
export function getEllipsisText(
	el: Element,
	fullText: string,
	computed: CSSStyleDeclaration,
): string {
	if (!fullText) return fullText

	const textOverflow = computed.textOverflow
	const overflow = computed.overflow
	const whiteSpace = computed.whiteSpace

	const isEllipsis =
		textOverflow === "ellipsis" &&
		(overflow === "hidden" || overflow === "clip") &&
		(whiteSpace === "nowrap" || whiteSpace === "pre")

	if (!isEllipsis) return fullText

	const htmlEl = el as HTMLElement
	if (htmlEl.scrollWidth <= htmlEl.clientWidth) return fullText

	const doc = el.ownerDocument
	const probe = doc.createElement("span")

	probe.style.cssText = `
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		font: ${computed.font};
		letter-spacing: ${computed.letterSpacing};
		word-spacing: ${computed.wordSpacing};
		white-space: nowrap;
	`

	const container = htmlEl.offsetParent ?? doc.body
	container.appendChild(probe)

	const maxWidth = htmlEl.clientWidth
		- (parseFloat(computed.paddingLeft) || 0)
		- (parseFloat(computed.paddingRight) || 0)

	const ellipsis = "…"

	try {
		probe.textContent = ellipsis
		const ellipsisW = probe.getBoundingClientRect().width

		let lo = 0
		let hi = fullText.length

		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2)
			probe.textContent = fullText.slice(0, mid)
			const textW = probe.getBoundingClientRect().width + ellipsisW
			if (textW <= maxWidth) lo = mid
			else hi = mid - 1
		}

		if (lo >= fullText.length) return fullText
		if (lo === 0) return ellipsis
		return fullText.slice(0, lo) + ellipsis
	} finally {
		container.removeChild(probe)
	}
}

/**
 * 计算表格列宽（单位：英寸）
 *
 * 优先从 <col> 元素读取显式宽度；若不存在或全部为 0，
 * 则从第一行单元格的实际渲染宽度测量，同时处理 colspan 展开。
 * 最终补齐至 colCount 列并将零宽列替换为平均值。
 *
 * @param table - HTML 表格元素
 * @param colCount - 列数
 * @param tableWidth - 表格总宽度（px）
 * @param config - 幻灯片配置（用于 px→inch 换算）
 */
export function calculateColumnWidths(
	table: HTMLTableElement,
	colCount: number,
	tableWidth: number,
	config: SlideConfig,
): number[] {
	const widths: number[] = []

	const colElements = table.querySelectorAll("col")
	if (colElements.length > 0) {
		Array.from(colElements).forEach((col) => {
			const style = col.getAttribute("style") || ""
			const widthMatch = style.match(/width:\s*([\d.]+)(px|%)/)
			if (widthMatch) {
				const value = parseFloat(widthMatch[1])
				const unit = widthMatch[2]
				if (unit === "%") {
					widths.push(pxToInch(tableWidth * value / 100, config))
				} else {
					widths.push(pxToInch(value, config))
				}
			} else {
				widths.push(0)
			}
		})
	}

	if (widths.length === 0 || widths.every((w) => w === 0)) {
		const firstRow = table.rows[0]
		if (firstRow) {
			const cells = Array.from(firstRow.cells)
			const totalWidth = tableWidth
			const cellWidths: number[] = []

			cells.forEach((cell) => {
				const rect = cell.getBoundingClientRect()
				cellWidths.push(rect.width)
			})

			const expandedWidths: number[] = []
			cells.forEach((cell, i) => {
				const colspan = parseInt(cell.getAttribute("colspan") || "1")
				const cellWidth = cellWidths[i] || 0
				const perColWidth = cellWidth / colspan

				for (let c = 0; c < colspan; c++) {
					expandedWidths.push(perColWidth)
				}
			})

			while (expandedWidths.length < colCount) {
				expandedWidths.push(totalWidth / colCount)
			}

			return expandedWidths.map((w) => pxToInch(w, config))
		}
	}

	const tableWidthInch = pxToInch(tableWidth, config)
	const avgWidth = tableWidthInch / colCount

	while (widths.length < colCount) {
		widths.push(avgWidth)
	}

	const nonZeroWidths = widths.filter((w) => w > 0)
	const avgNonZero = nonZeroWidths.length > 0
		? nonZeroWidths.reduce((a, b) => a + b, 0) / nonZeroWidths.length
		: avgWidth

	return widths.map((w) => (w > 0 ? w : avgNonZero))
}

/**
 * 计算表格行高（单位：英寸）
 *
 * 直接从每行的渲染高度转换而来。
 *
 * @param tableRows - 表格行元素数组
 * @param config - 幻灯片配置（用于 px→inch 换算）
 */
export function calculateRowHeights(
	tableRows: HTMLTableRowElement[],
	config: SlideConfig,
): number[] {
	return tableRows.map((tr) => {
		const rect = tr.getBoundingClientRect()
		return pxToInch(rect.height, config)
	})
}

/**
 * 计算单元格内边距（单位：英寸）
 *
 * 除了读取 CSS padding，还会检测文本节点的实际左侧偏移量，
 * 用于处理单元格内图标等元素导致的额外文本缩进。
 *
 * @param td - 单元格元素
 * @param computed - 单元格的计算样式
 * @returns [top, right, bottom, left] 或 undefined（全部为 0 时）
 */
export function calculateCellMargin(
	td: HTMLTableCellElement,
	computed: CSSStyleDeclaration,
): [number, number, number, number] | undefined {
	const paddingTopPx = parseFloat(computed.paddingTop) || 0
	const paddingRightPx = parseFloat(computed.paddingRight) || 0
	const paddingBottomPx = parseFloat(computed.paddingBottom) || 0
	const paddingLeftPx = parseFloat(computed.paddingLeft) || 0

	let marginLeftPx = paddingLeftPx
	let marginRightPx = paddingRightPx
	const borderLeftWidth = parseFloat(computed.borderLeftWidth) || 0
	const borderRightWidth = parseFloat(computed.borderRightWidth) || 0
	const tdRect = td.getBoundingClientRect()
	const W_inner = Math.max(0, tdRect.width - borderLeftWidth - borderRightWidth)
	const gapPx = 2

	const graphics = td.querySelectorAll("img, svg")

	let textSpanL: number | null = null
	let textSpanR: number | null = null

	const textNode = findFirstTextNode(td)
	if (textNode) {
		try {
			const range = td.ownerDocument.createRange()
			range.selectNode(textNode)
			const textRect = range.getBoundingClientRect()

			const visualOffset = textRect.left - tdRect.left - borderLeftWidth

			if (visualOffset > paddingLeftPx + 2) {
				marginLeftPx = Math.max(marginLeftPx, visualOffset)
			}
			if (textRect.width > 0.5) {
				textSpanL = visualOffset
				textSpanR = visualOffset + textRect.width
			}
		} catch {
			// 忽略 Range 错误
		}
	}

	if (graphics.length > 0) {
		for (const el of Array.from(graphics)) {
			const r = el.getBoundingClientRect()
			if (r.width < 1 || r.height < 1) continue
			const relL = r.left - tdRect.left - borderLeftWidth
			const relR = r.right - tdRect.left - borderLeftWidth
			if (textSpanL !== null && textSpanR !== null) {
				const tL = textSpanL
				const tR = textSpanR
				if (relR <= tL + gapPx) {
					marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
				} else if (relL >= tR - gapPx) {
					marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
				} else {
					const mid = (tL + tR) / 2
					if (relL >= mid) {
						marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
					} else {
						marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
					}
				}
			} else {
				const center = relL + (relR - relL) / 2
				if (center <= W_inner / 2) {
					marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
				} else {
					marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
				}
			}
		}
	}

	const top = pxToInch(paddingTopPx)
	const right = pxToInch(marginRightPx)
	const bottom = pxToInch(paddingBottomPx)
	const left = pxToInch(marginLeftPx)

	if (top === 0 && right === 0 && bottom === 0 && left === 0) return undefined

	return [top, right, bottom, left]
}

/**
 * 递归查找元素内第一个非空文本节点
 *
 * 用于 calculateCellMargin 定位文本的实际渲染位置。
 *
 * @param element - 起始元素
 */
export function findFirstTextNode(element: Element): Node | null {
	for (const child of Array.from(element.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			if (child.textContent?.trim()) return child
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const found = findFirstTextNode(child as Element)
			if (found) return found
		}
	}
	return null
}

/**
 * 解析单元格背景色继承链
 *
 * 按优先级依次检查：单元格 → 行 → 区段（thead/tbody/tfoot）→ 表格，
 * 返回第一个可见的背景色；若均透明则返回 null。
 *
 * @param input - 各层级的 backgroundColor 值
 */
export function resolveEffectiveBackgroundColor(input: {
	cellBgColor: string
	rowBgColor: string
	sectionBgColor?: string
	tableBgColor?: string
}): string | null {
	const { cellBgColor, rowBgColor, sectionBgColor, tableBgColor } = input
	if (hasVisibleBackground(cellBgColor)) return cellBgColor
	if (hasVisibleBackground(rowBgColor)) return rowBgColor
	if (sectionBgColor && hasVisibleBackground(sectionBgColor)) return sectionBgColor
	if (tableBgColor && hasVisibleBackground(tableBgColor)) return tableBgColor
	return null
}

/**
 * 从单元格向下查找最深层的文字样式元素
 *
 * 沿着"唯一可见子元素"链逐层深入，返回最终到达的元素。
 * 用于从实际包裹文本的元素（而非 td 自身）上读取文字样式
 * （颜色、字号、粗体等）。
 *
 * 例如 `<td><div class="text-orange-500">P0</div></td>`
 * 会返回 `<div>`，使得 parseTable 能读取到橙色等样式。
 *
 * 如果单元格有多个子元素或直接包含文本，返回 null，
 * 调用方将回退到使用 td 自身的样式。
 *
 * @param cell - 表格单元格元素
 * @param iWindow - iframe window（用于获取计算样式）
 */
export function findDeepestTextElement(cell: HTMLTableCellElement, iWindow: Window): Element | null {
	let current: Element = cell
	while (true) {
		const visibleChildren = Array.from(current.children).filter((child) => {
			const s = iWindow.getComputedStyle(child)
			return s.display !== "none" && s.visibility !== "hidden"
		})
		if (visibleChildren.length !== 1) break
		current = visibleChildren[0]
	}
	return current === cell ? null : current
}
