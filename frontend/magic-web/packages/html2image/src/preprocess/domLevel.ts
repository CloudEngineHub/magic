const FLOATING_SELECTOR = [
	"[role='dialog']",
	"[role='tooltip']",
	"[data-radix-popper-content-wrapper]",
	".toast",
	".Toastify",
	".modal",
	".popover",
	".tooltip",
	".drawer",
	".ant-modal-root",
	".ant-drawer",
	".ant-tooltip",
	".ant-popover",
	".ant-message",
	".ant-notification",
].join(",")

export function preprocessDOM(iDocument: Document): void {
	const win = iDocument.defaultView
	if (!win) return

	// 冻结所有 CSS 动画/过渡，确保元素处于最终可见状态
	const freezeStyle = iDocument.createElement("style")
	freezeStyle.setAttribute("data-pdf-export", "freeze")
	freezeStyle.textContent = `
		*, *::before, *::after {
			animation-play-state: paused !important;
			animation-delay: -1s !important;
			animation-duration: 0s !important;
			transition-duration: 0s !important;
			transition-delay: 0s !important;
		}
	`
	iDocument.head?.appendChild(freezeStyle)

	iDocument.querySelectorAll<HTMLElement>("*").forEach((element) => {
		const style = win.getComputedStyle(element)
		const anyStyle = style as unknown as Record<string, string>

		// ---- content-visibility: auto → visible ----
		// foreignObject 不触发 IntersectionObserver，auto 区域不会被渲染
		if (style.contentVisibility === "auto") {
			element.style.contentVisibility = "visible"
		}

		// ---- mix-blend-mode ----
		// foreignObject 中 blend mode 可能导致元素完全透明或渲染异常
		if (style.mixBlendMode && style.mixBlendMode !== "normal") {
			element.style.mixBlendMode = "normal"
		}

		// ---- background-blend-mode ----
		// 多背景混合在 foreignObject 中不可靠
		if (anyStyle.backgroundBlendMode && anyStyle.backgroundBlendMode !== "normal") {
			element.style.backgroundBlendMode = "normal"
		}

		// ---- mask / mask-image / -webkit-mask-image ----
		// foreignObject 不支持 CSS mask
		if (style.mask && style.mask !== "none") {
			element.style.mask = "none"
		}
		if (style.maskImage && style.maskImage !== "none") {
			element.style.maskImage = "none"
		}
		if (anyStyle.webkitMaskImage && anyStyle.webkitMaskImage !== "none") {
			element.style.setProperty("-webkit-mask-image", "none")
		}

		// ---- clip-path (复杂形状) ----
		// foreignObject 对 polygon/path 等复杂 clip-path 支持不稳定
		const clipPath = style.clipPath
		if (clipPath && clipPath !== "none" && !/^inset\(/.test(clipPath)) {
			element.style.clipPath = "none"
		}

		// ---- CSS filter (非 none) ----
		// blur / drop-shadow 等在 foreignObject 中渲染可能异常
		if (style.filter && style.filter !== "none") {
			element.style.filter = "none"
		}

		// ---- -webkit-text-stroke ----
		// foreignObject 不支持
		if (anyStyle.webkitTextStroke && anyStyle.webkitTextStroke !== "0px") {
			element.style.setProperty("-webkit-text-stroke", "0px")
			// 保持文字可见，如果文字颜色是透明的（常见的 text-stroke 技巧）
			if (style.color === "transparent" || style.color === "rgba(0, 0, 0, 0)") {
				element.style.color = "#000"
			}
		}

		// ---- opacity: 0 (动画残留 / IO 入场动画未触发) ----
		// 冻结动画后，某些元素可能停留在 opacity:0 的初始关键帧；
		// 离屏 iframe 中 IntersectionObserver 永远不触发，JS 设置的
		// 入场动画（opacity:0 + transition）也不会恢复。
		// 策略：有 animation 或 transition 属性的元素视为"应当可见"。
		if (style.opacity === "0") {
			const animName = style.animationName
			const hasAnimation = animName && animName !== "none"
			const transitionProp = style.transitionProperty || ""
			const hasOpacityTransition =
				transitionProp === "all" || transitionProp.includes("opacity")
			if (hasAnimation || hasOpacityTransition) {
				element.style.opacity = "1"
				// 同时清除入场动画附带的 transform 偏移（如 translateY(16px)）
				const transform = style.transform
				if (transform && transform !== "none") {
					element.style.transform = "none"
				}
			}
		}

		// ---- position: fixed ----
		// sticky 已在 sandbox 内 measureContentSize 之前由 disableStickyPositioning 统一降级为 static，
		// 这里不再重复处理，也避免 sticky 元素被下面“小元素隐藏”“底部隐藏”误杀。
		const position = style.position
		if (position === "fixed") {
			neutralizeFixedElement(element, win)
		}
	})

	iDocument.querySelectorAll<HTMLElement>(FLOATING_SELECTOR).forEach((element) => {
		element.style.display = "none"
	})

	// 锁定当前单行文本元素的 white-space，防止 foreignObject 亚像素差异导致换行
	// snapdom 使用 SVG foreignObject 截图时，文本在非整数 scale（如 Retina 1.5x）
	// 或 flex/inline-flex 容器中会因亚像素舍入差异而重排，导致原本单行的文本换行。
	lockSingleLineTextElements(iDocument, win)
}

/**
 * 将 rgba 颜色转为不透明版本（在白色背景上合成）。
 * 例: rgba(255, 255, 255, 0.8) → rgb(255, 255, 255)
 */
function opaqueifyRgba(color: string): string {
	const match = color.match(
		/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/,
	)
	if (!match) return color
	const r = Number(match[1])
	const g = Number(match[2])
	const b = Number(match[3])
	const a = match[4] !== undefined ? Number(match[4]) : 1
	if (a >= 1) return color
	// Alpha-composite over white (#fff)
	const blendR = Math.round(r * a + 255 * (1 - a))
	const blendG = Math.round(g * a + 255 * (1 - a))
	const blendB = Math.round(b * a + 255 * (1 - a))
	return `rgb(${blendR}, ${blendG}, ${blendB})`
}

/**
 * Convert fixed elements before canvas pagination.
 *
 * Strategy:
 * - fixed top-area elements (nav bars, headers) -> absolute, so they stay at
 *   document top and do not repeat on every PDF page.
 * - bottom/small floating elements -> hidden, as they are usually controls.
 *
 * Note: sticky is handled separately by disableStickyPositioning in the sandbox
 * before measureContentSize runs, so it is not processed here.
 */
function neutralizeFixedElement(element: HTMLElement, win: Window): void {
	const rect = element.getBoundingClientRect()
	const viewportHeight = win.innerHeight || 900
	const viewportWidth = win.innerWidth || 800

	// Small floating elements (FAB, back-to-top, chat widgets) → hide
	const isSmall = rect.width < viewportWidth * 0.3 && rect.height < viewportHeight * 0.15
	if (isSmall) {
		element.style.display = "none"
		return
	}

	// Bottom-area elements (cookie banners, bottom bars) → hide
	if (rect.top > viewportHeight * 0.5) {
		element.style.display = "none"
		return
	}

	element.style.position = "absolute"
	element.style.top = `${Math.max(rect.top + win.scrollY, 0)}px`
	element.style.left = `${Math.max(rect.left + win.scrollX, 0)}px`
	element.style.width = `${rect.width}px`
}

/**
 * 遍历所有可见元素，对当前渲染为单行文本的元素设置 white-space:nowrap。
 *
 * 背景：snapdom 使用 SVG foreignObject 进行截图，foreignObject 内的文本布局
 * 在非整数 devicePixelRatio（如 macOS Retina scale=1.5）或 flex 容器中
 * 会产生亚像素级的宽度舍入差异，导致原本刚好一行的文本在截图中被挤成两行。
 *
 * 策略：如果元素的当前高度不足以容纳两行文本（lineHeight × 1.8 + padding + border），
 * 且没有溢出内容，视为单行文本容器，添加 nowrap 锁定不换行。
 *
 * 对 flex/grid 容器做特殊处理：CSS 规范要求 flex/grid 子元素被"块化"
 * （computed display 变为 block），因此不能用 containsBlockChild 过滤它们，
 * 否则几乎所有 flex 容器都会被跳过。
 *
 * @see https://github.com/zumerlab/snapdom/issues/322
 */
function lockSingleLineTextElements(iDocument: Document, win: Window): void {
	const elements = iDocument.querySelectorAll<HTMLElement>("*")
	for (let i = 0; i < elements.length; i++) {
		const el = elements[i]

		// 不可见或无尺寸的元素跳过
		if (el.offsetHeight === 0 || el.offsetWidth === 0) continue
		// 无文本内容的元素不受 white-space 影响
		if (!el.textContent?.trim()) continue

		let style: CSSStyleDeclaration
		try {
			style = win.getComputedStyle(el)
		} catch {
			continue
		}

		if (style.display === "none" || style.visibility === "hidden") continue

		// 已经是 nowrap / pre 系列的无需处理
		const ws = style.whiteSpace
		if (ws === "nowrap" || ws === "pre") continue

		// flex/grid 容器的子元素会被规范"块化"（blockified），computed display = block，
		// 但这不意味着容器是多行的。只对非 flex/grid 的普通容器做 block 子元素检查。
		const display = style.display
		const isFlexOrGrid =
			display === "flex" ||
			display === "inline-flex" ||
			display === "grid" ||
			display === "inline-grid"
		if (!isFlexOrGrid && containsBlockChild(el, win)) continue

		// 两行阈值：元素高度 ≥ lineHeight×1.8 + padding + border 才视为多行
		// 使用 1.8 而非 2.0 是因为亚像素舍入可能让实际双行高度略低于 2×lineHeight
		// 这个宽松阈值也能正确处理 flex 容器内有图标/图片等比文字行高更高的场景
		const lineHeight = parseFloat(style.lineHeight)
		const fontSize = parseFloat(style.fontSize) || 16
		const effectiveLh = Number.isNaN(lineHeight) ? fontSize * 1.2 : lineHeight
		const paddingBlock = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
		const borderBlock = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
		const twoLineThreshold = effectiveLh * 1.8 + paddingBlock + borderBlock

		if (el.offsetHeight >= twoLineThreshold) continue

		// 有内容溢出的元素跳过（可能被 overflow:hidden 裁剪了多行文本）
		if (el.scrollHeight > el.offsetHeight + 2) continue

		el.style.whiteSpace = "nowrap"
	}
}

/** 检查元素是否包含 block 级子元素 */
function containsBlockChild(el: HTMLElement, win: Window): boolean {
	const children = el.children
	for (let i = 0; i < children.length; i++) {
		try {
			const d = win.getComputedStyle(children[i]).display
			if (
				d === "block" ||
				d === "flex" ||
				d === "grid" ||
				d === "table" ||
				d === "list-item"
			) {
				return true
			}
		} catch {
			continue
		}
	}
	return false
}
