/**
 * Markdown/TipTap EditorBody DOM 预处理工具
 * 用于导出 PDF/图片前清理交互 UI 元素、光栅化 Mermaid SVG、物化 checkbox 状态
 */

// ─── Mermaid SVG 光栅化 ──────────────────────────────────────

/**
 * 将 Mermaid SVG 光栅化为 <img>，避免 snapdom 的 foreignObject 嵌套导致文字丢失
 */
async function rasterizeMermaidSvgs(container: HTMLElement): Promise<void> {
	const mermaidContainers = container.querySelectorAll<HTMLElement>("[data-mermaid-id]")
	if (mermaidContainers.length === 0) return

	const tasks = Array.from(mermaidContainers).map(async (mermaidEl) => {
		const svg = mermaidEl.querySelector("svg")
		if (!svg) return

		const rect = svg.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) return

		try {
			const dataUrl = await svgToDataUrl(svg, rect.width, rect.height)

			const img = document.createElement("img")
			img.src = dataUrl
			img.style.width = `${rect.width}px`
			img.style.height = `${rect.height}px`
			img.style.display = "block"
			svg.replaceWith(img)
		} catch {
			// 光栅化失败，保留原始 SVG（降级）
		}
	})

	await Promise.all(tasks)
}

/**
 * 将 SVG 元素光栅化为 PNG data URL
 */
async function svgToDataUrl(svg: SVGElement, width: number, height: number): Promise<string> {
	const scale = 2
	const clone = svg.cloneNode(true) as SVGElement

	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
	clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
	clone.setAttribute("width", String(width))
	clone.setAttribute("height", String(height))

	replaceForeignObjectsWithSvgText(svg, clone)

	const svgString = new XMLSerializer().serializeToString(clone)
	const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`

	const image = await loadImage(encodedSvg)
	const canvas = document.createElement("canvas")
	canvas.width = width * scale
	canvas.height = height * scale
	const ctx = canvas.getContext("2d")!
	ctx.scale(scale, scale)
	ctx.drawImage(image, 0, 0, width, height)

	return await new Promise<string>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) return reject(new Error("toBlob null"))
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = () => reject(reader.error)
			reader.readAsDataURL(blob)
		}, "image/png")
	})
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = src
	})
}

const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * 将克隆 SVG 中的所有 <foreignObject> 替换为原生 SVG <text>
 */
function replaceForeignObjectsWithSvgText(originalSvg: SVGElement, cloneSvg: SVGElement): void {
	const origFOs = originalSvg.querySelectorAll("foreignObject")
	const cloneFOs = cloneSvg.querySelectorAll("foreignObject")

	for (let i = cloneFOs.length - 1; i >= 0; i--) {
		const cloneFO = cloneFOs[i]
		const origFO = origFOs[i]
		if (!origFO || !cloneFO.parentNode) continue

		const x = parseFloat(cloneFO.getAttribute("x") || "0")
		const y = parseFloat(cloneFO.getAttribute("y") || "0")
		const foWidth = parseFloat(cloneFO.getAttribute("width") || "0")
		const foHeight = parseFloat(cloneFO.getAttribute("height") || "0")

		const textContent = (origFO.textContent || "").trim()
		if (!textContent) {
			cloneFO.parentNode.removeChild(cloneFO)
			continue
		}

		const textEl = origFO.querySelector("div, span, p") || origFO
		const computed = window.getComputedStyle(textEl)

		const fontSize = computed.fontSize || "14px"
		const fontFamily = computed.fontFamily || "sans-serif"
		const fontWeight = computed.fontWeight || "normal"
		const color = computed.color || "#000000"
		const textAlign = computed.textAlign || "center"

		const svgText = document.createElementNS(SVG_NS, "text")

		let textAnchor = "middle"
		let textX = x + foWidth / 2
		if (textAlign === "left" || textAlign === "start") {
			textAnchor = "start"
			textX = x + 2
		} else if (textAlign === "right" || textAlign === "end") {
			textAnchor = "end"
			textX = x + foWidth - 2
		}

		const textY = y + foHeight / 2

		svgText.setAttribute("x", String(textX))
		svgText.setAttribute("y", String(textY))
		svgText.setAttribute("text-anchor", textAnchor)
		svgText.setAttribute("dominant-baseline", "central")
		svgText.setAttribute("font-size", fontSize)
		svgText.setAttribute("font-family", fontFamily)
		svgText.setAttribute("font-weight", fontWeight)
		svgText.setAttribute("fill", color)

		const lines = textContent.split(/\n/).filter(Boolean)
		if (lines.length <= 1) {
			svgText.textContent = textContent
		} else {
			const lineHeight = parseFloat(fontSize) * 1.2
			const startY = textY - ((lines.length - 1) * lineHeight) / 2

			lines.forEach((line, idx) => {
				const tspan = document.createElementNS(SVG_NS, "tspan")
				tspan.setAttribute("x", String(textX))
				tspan.setAttribute("y", String(startY + idx * lineHeight))
				tspan.textContent = line
				svgText.appendChild(tspan)
			})
		}

		cloneFO.parentNode.replaceChild(svgText, cloneFO)
	}
}

// ─── Checkbox 物化 ──────────────────────────────────────────

/**
 * 物化 checkbox 的 :checked 视觉状态
 */
export function materializeCheckboxState(container: HTMLElement): void {
	const checkedItems = container.querySelectorAll<HTMLLIElement>('li[data-checked="true"]')
	checkedItems.forEach((li) => {
		const label = li.querySelector("label")
		if (!label) return
		const span = label.querySelector("span")
		if (!span) return

		const computedSpan = window.getComputedStyle(span)
		span.style.backgroundColor = computedSpan.backgroundColor
		span.style.borderColor = computedSpan.borderColor

		const computedBefore = window.getComputedStyle(span, "::before")
		if (!span.querySelector(".pdf-checkmark")) {
			const checkmark = document.createElement("span")
			checkmark.className = "pdf-checkmark"
			checkmark.style.cssText = `
				position: absolute;
				left: 50%;
				top: 50%;
				transform: translate(-50%, -50%);
				width: 0.75em;
				height: 0.75em;
				display: block;
				opacity: 1;
				background-color: ${computedBefore.backgroundColor !== "rgba(0, 0, 0, 0)" ? computedBefore.backgroundColor : computedSpan.color || "#ffffff"};
				-webkit-mask: url("data:image/svg+xml,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M20%206L9%2017L4%2012%22%20stroke%3D%22currentColor%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") center/contain no-repeat;
				mask: url("data:image/svg+xml,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M20%206L9%2017L4%2012%22%20stroke%3D%22currentColor%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") center/contain no-repeat;
			`
			span.appendChild(checkmark)
		}
	})

	const uncheckedItems = container.querySelectorAll<HTMLLIElement>('li[data-checked="false"]')
	uncheckedItems.forEach((li) => {
		const label = li.querySelector("label")
		if (!label) return
		const span = label.querySelector("span")
		if (!span) return
		const computedSpan = window.getComputedStyle(span)
		span.style.backgroundColor = computedSpan.backgroundColor
		span.style.borderColor = computedSpan.borderColor
		span.style.borderWidth = computedSpan.borderWidth
		span.style.borderStyle = computedSpan.borderStyle
		span.style.borderRadius = computedSpan.borderRadius
		span.style.width = computedSpan.width
		span.style.height = computedSpan.height
		span.style.position = "relative"
		span.style.display = "block"
	})
}

// ─── 完整预处理 ──────────────────────────────────────────────

/**
 * 非破坏性地预处理 EditorBody DOM：隐藏交互按钮 + 光栅化 Mermaid + 物化 Checkbox
 * 返回 cleanup 函数，截图完成后调用以恢复 DOM
 */
export async function sanitizeEditorDomForExport(container: HTMLElement): Promise<() => void> {
	const restores: (() => void)[] = []

	// 隐藏 Mermaid 模式切换按钮（不删除，用 display:none）
	container.querySelectorAll<HTMLElement>(".mode-switch").forEach((el) => {
		const orig = el.style.display
		el.style.display = "none"
		restores.push(() => {
			el.style.display = orig
		})
	})

	// 隐藏代码块复制按钮
	container.querySelectorAll<HTMLElement>(".magic-code-copy").forEach((el) => {
		const orig = el.style.display
		el.style.display = "none"
		restores.push(() => {
			el.style.display = orig
		})
	})

	// Mermaid 代码块：隐藏原始代码视图，只保留图表
	container.querySelectorAll("[data-node-view-wrapper]").forEach((wrapper) => {
		const hasChart = wrapper.querySelector("svg")
		if (!hasChart) return

		const mermaidContainer = wrapper.firstElementChild
		if (!mermaidContainer) return

		Array.from(mermaidContainer.children).forEach((child) => {
			const htmlChild = child as HTMLElement
			if (!child.contains(hasChart)) {
				const orig = htmlChild.style.display
				htmlChild.style.display = "none"
				restores.push(() => {
					htmlChild.style.display = orig
				})
			} else {
				const orig = htmlChild.style.display
				htmlChild.style.display = "block"
				restores.push(() => {
					htmlChild.style.display = orig
				})
			}
		})
	})

	// 光栅化 Mermaid SVG → <img>（这个是破坏性的，但 Mermaid 不会因此丢失数据）
	await rasterizeMermaidSvgs(container)

	// 物化 checkbox :checked 视觉状态
	materializeCheckboxState(container)

	return () => {
		for (let i = restores.length - 1; i >= 0; i--) {
			restores[i]()
		}
	}
}
