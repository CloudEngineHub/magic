import { log, LogLevel } from "../logger"
import {
	EXTERNAL_RESOURCE_TIMEOUT_MS,
	NATIVE_LOAD_WAIT_MS,
	READY_STATE_FALLBACK_MS,
	RENDER_TIMEOUT_MS,
} from "../shared/constants"

export function createHiddenIframe({
	pageWidthPx,
	pageHeightPx,
}: {
	pageWidthPx: number
	pageHeightPx: number
}): HTMLIFrameElement {
	const iframe = document.createElement("iframe")
	iframe.style.cssText = `
		width: ${pageWidthPx}px;
		height: ${pageHeightPx}px;
		position: fixed;
		left: -99999px;
		top: -99999px;
		z-index: -1;
		border: none;
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		background: white;
		pointer-events: none;
	`
	iframe.setAttribute(
		"sandbox",
		"allow-scripts allow-modals allow-forms allow-same-origin allow-popups",
	)
	iframe.setAttribute("allow", "autoplay")
	iframe.setAttribute("translate", "no")
	return iframe
}

export function normalizeSandboxHtml(html: string): string {
	return injectIntersectionObserverPatch(
		injectViewportOverflowHidden(
			injectVideoCrossOriginAnonymous(decodeInlineScriptEntities(html)),
		),
	)
}

/**
 * 把 iframe 文档中所有 computed position === "sticky" 的元素改成 static !important。
 *
 * snapdom 等基于 DOM 克隆的栅格化器无法忠实呈现 position:sticky，常见症状是 sticky 表头/侧边栏
 * 在导出图中“消失”或错位。离屏 iframe 在截图前不会滚动（scrollTop 始终为 0），sticky 元素
 * 本就处于初始位置，改为 static 不会影响视觉效果，却能让栅格化稳定输出。
 *
 * 与脚本注入方案不同，这里要求由外部在“业务 JS 跑完、measureContentSize 之前”同步调用，
 * 避免与页面自身的渲染时序竞争（例如虚拟滚动列表在 DOMContentLoaded 之后才挂载 sticky 节点）。
 */
export function disableStickyPositioning(iframeDocument: Document): void {
	const win = iframeDocument.defaultView
	const body = iframeDocument.body
	if (!win || !body) return
	try {
		const all = iframeDocument.getElementsByTagName("*")
		for (let i = 0; i < all.length; i++) {
			const el = all[i] as HTMLElement
			let cs: CSSStyleDeclaration
			try {
				cs = win.getComputedStyle(el)
			} catch {
				continue
			}
			if (cs.position === "sticky") {
				el.style.setProperty("position", "static", "important")
			}
		}
	} catch {
		// ignore
	}
}

export function isDocumentReadyForRender({
	iframeDocument,
	renderStartedAt,
}: {
	iframeDocument: Document
	renderStartedAt: number
}): boolean {
	const isReadyStateComplete = iframeDocument.readyState === "complete"
	if (isReadyStateComplete) return true

	const hasDomScaffold = Boolean(iframeDocument.documentElement && iframeDocument.body)
	if (!hasDomScaffold) return false

	return Date.now() - renderStartedAt >= READY_STATE_FALLBACK_MS
}

const MAX_DESCENDANT_PAINT_PROBE = 12000

/**
 * 用子元素包围盒估计绘制宽高，弥补 body/html scrollHeight 在内部滚动、overflow 等场景下仍等于视口的问题。
 *
 * 注意：虚拟滚动列表（react-virtual、react-window 等）会在祖先 overflow:auto 容器内
 * 放一个 "总高 spacer" 占位（例如 height:140608px），它的 getBoundingClientRect 返回真实尺寸，
 * 但实际不会被绘制（被祖先裁掉）。直接累计 bottom 会把整页高度撑爆。
 * 这里对每个候选元素，向上找最近的 overflow != visible 的祖先，用该祖先的 bottom clamp。
 */
function measureDescendantPaintExtent(iframeDocument: Document): {
	width: number
	height: number
} {
	const win = iframeDocument.defaultView
	const body = iframeDocument.body
	if (!win || !body) return { width: 0, height: 0 }

	const scrollX = win.scrollX ?? win.pageXOffset ?? 0
	const scrollY = win.scrollY ?? win.pageYOffset ?? 0

	let maxRight = 0
	let maxBottom = 0

	const nodes = body.getElementsByTagName("*")
	const cap = Math.min(nodes.length, MAX_DESCENDANT_PAINT_PROBE)
	for (let i = 0; i < cap; i++) {
		const el = nodes[i]
		if (!el.getClientRects?.().length) continue
		let style: CSSStyleDeclaration
		try {
			style = win.getComputedStyle(el)
		} catch {
			continue
		}
		if (style.display === "none" || style.visibility === "hidden") continue

		const r = el.getBoundingClientRect()
		if (r.width <= 0 && r.height <= 0) continue

		// 向上查找最近的"非 visible overflow"祖先，用其 bottom/right clamp 当前元素。
		// 这能正确剔除虚拟滚动 spacer 的虚高，避免它把整页绘制高度撑爆。
		const clip = findClipAncestorRect(el, win, body)
		const effectiveRight = clip ? Math.min(r.right, clip.right) : r.right
		const effectiveBottom = clip ? Math.min(r.bottom, clip.bottom) : r.bottom

		maxRight = Math.max(maxRight, effectiveRight + scrollX)
		maxBottom = Math.max(maxBottom, effectiveBottom + scrollY)
	}

	const br = body.getBoundingClientRect()
	maxRight = Math.max(maxRight, br.right + scrollX)
	maxBottom = Math.max(maxBottom, br.bottom + scrollY)

	return {
		width: Math.ceil(Math.max(0, maxRight)),
		height: Math.ceil(Math.max(0, maxBottom)),
	}
}

/**
 * 沿祖先链查找最近的"裁剪盒"：overflow / overflow-x / overflow-y 任一不是 visible 的祖先。
 * 找到则返回其 getBoundingClientRect，作为该元素的有效可见边界上限。
 */
function findClipAncestorRect(el: Element, win: Window, body: HTMLElement): DOMRect | null {
	let cur: Element | null = el.parentElement
	let depth = 0
	while (cur && cur !== body && depth < 20) {
		try {
			const cs = win.getComputedStyle(cur)
			if (
				(cs.overflow && cs.overflow !== "visible") ||
				(cs.overflowX && cs.overflowX !== "visible") ||
				(cs.overflowY && cs.overflowY !== "visible")
			) {
				return cur.getBoundingClientRect()
			}
		} catch {
			// ignore
		}
		cur = cur.parentElement
		depth++
	}
	return null
}

export function measureContentSize({
	iframeDocument,
	fallbackWidth,
	fallbackHeight,
}: {
	iframeDocument: Document
	fallbackWidth: number
	fallbackHeight: number
}): { width: number; height: number } {
	const root = iframeDocument.documentElement
	const body = iframeDocument.body
	const flowWidth = Math.max(
		root?.scrollWidth ?? 0,
		root?.offsetWidth ?? 0,
		body?.scrollWidth ?? 0,
		body?.offsetWidth ?? 0,
	)
	const flowHeight = Math.max(
		root?.scrollHeight ?? 0,
		root?.offsetHeight ?? 0,
		body?.scrollHeight ?? 0,
		body?.offsetHeight ?? 0,
	)
	const paint = measureDescendantPaintExtent(iframeDocument)
	const measuredWidth = Math.max(flowWidth, paint.width)
	const measuredHeight = Math.max(flowHeight, paint.height)
	return {
		// 仅在完全量不到尺寸时回退到视口，避免把短页面强行撑成视口高度。
		width: measuredWidth > 0 ? measuredWidth : fallbackWidth,
		height: measuredHeight > 0 ? measuredHeight : fallbackHeight,
	}
}

export function resolveRenderTimeoutMs(): number {
	return Math.max(
		RENDER_TIMEOUT_MS,
		READY_STATE_FALLBACK_MS + NATIVE_LOAD_WAIT_MS + EXTERNAL_RESOURCE_TIMEOUT_MS + 5000,
	)
}

function injectVideoCrossOriginAnonymous(html: string): string {
	return html.replace(/<video\b([^>]*)>/gi, (full) => {
		if (/\bcrossorigin\s*=/i.test(full)) return full
		return full.replace(/^<video\b/i, '<video crossorigin="anonymous"')
	})
}

function decodeInlineScriptEntities(rawHtml: string): string {
	return rawHtml.replace(
		/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
		(full, attrs: string, code: string) => {
			if (/\bsrc\s*=/.test(attrs)) return full
			const decodedCode = code
				.replace(/&amp;(?=(?:lt|gt|quot|#39|apos);)/gi, "&")
				.replace(/&lt;/gi, "<")
				.replace(/&gt;/gi, ">")
				.replace(/&quot;/gi, '"')
				.replace(/&#39;|&apos;/gi, "'")
			if (decodedCode === code) return full
			return `<script${attrs}>${decodedCode}</script>`
		},
	)
}

/**
 * 在 HTML 中注入 overflow:hidden 样式，阻止 iframe 初次布局时出现滚动条。
 *
 * 当内容高度超过 iframe 初始高度（默认 900px）时，浏览器会显示纵向滚动条，
 * 占用约 15-17px 宽度，导致文本在较窄的视口中布局。虽然后续 resize 会移除
 * 滚动条并触发 reflow，但某些边界情况下布局差异可能残留。
 * 提前阻止滚动条可确保文本始终在完整视口宽度下布局。
 */
function injectViewportOverflowHidden(html: string): string {
	const style = `<style data-pdf-export="viewport-lock">html{overflow:hidden!important}</style>`
	if (/<head\b[^>]*>/i.test(html)) {
		return html.replace(/<head\b([^>]*)>/i, `<head$1>${style}`)
	}
	if (/<html\b[^>]*>/i.test(html)) {
		return html.replace(/<html\b([^>]*)>/i, `<html$1>${style}`)
	}
	return style + html
}

/**
 * 运行时启发式解锁：找出所有「高度 ≈ viewport」且「内部 overflow 不为 visible」的容器，
 * 把它们改成 height:auto + overflow:visible，让真实内容高度自然伸展出来。
 *
 * 解决的问题（dashboard 模板典型形态）：
 *   html, body            { height: 100vh; overflow: hidden }
 *   .dashboard-container  { height: 100vh; overflow: auto   }
 * 在真实浏览器里 100vh = 屏幕高，内容超出在容器内滚；
 * 在我们的离屏 iframe 里 100vh = iframe 的固定高，导致内容永远被裁到 iframe 大小。
 *
 * 相比静态 HTML 注入方案，这里：
 *   - 不依赖任何业务选择器（#root / .dashboard-container 等都不必出现）
 *   - 按结构特征「viewport 高 + 内部滚动」判定，是 viewport 锁定模式的精确刻画
 *   - 不命中正常的小型 overflow 容器（如虚拟列表的 600px 滚动区），避免误伤
 *
 * 调用时机要求：业务 JS 跑完、measureContentSize 之前同步执行（与 disableStickyPositioning 同位）。
 */
export function unlockViewportLockedContainers(iframeDocument: Document): void {
	const win = iframeDocument.defaultView
	const root = iframeDocument.documentElement
	const body = iframeDocument.body
	if (!win || !root || !body) return

	const unlock = (el: HTMLElement) => {
		el.style.setProperty("height", "auto", "important")
		el.style.setProperty("min-height", "0", "important")
		el.style.setProperty("max-height", "none", "important")
		el.style.setProperty("overflow", "visible", "important")
	}

	try {
		// 根节点恒解锁：html、body 在离屏场景下必须能伸展，否则一切下游测量都被钳制。
		unlock(root)
		unlock(body)

		const viewportHeight = win.innerHeight
		const all = iframeDocument.getElementsByTagName("*")
		const cap = Math.min(all.length, 12000)
		for (let i = 0; i < cap; i++) {
			const el = all[i] as HTMLElement
			if (el === root || el === body) continue
			let cs: CSSStyleDeclaration
			try {
				cs = win.getComputedStyle(el)
			} catch {
				continue
			}
			const h = parseFloat(cs.height)
			if (!Number.isFinite(h)) continue
			// 容差 2px 吸收 sub-pixel 与浮点；只命中真正贴合 viewport 的容器。
			const isViewportTall = Math.abs(h - viewportHeight) <= 2
			if (!isViewportTall) continue
			const scrollsInside =
				(cs.overflow && cs.overflow !== "visible") ||
				(cs.overflowY && cs.overflowY !== "visible") ||
				(cs.overflowX && cs.overflowX !== "visible")
			if (scrollsInside) unlock(el)
		}
	} catch {
		// ignore
	}
}

/**
 * 在 HTML 头部注入 IntersectionObserver 补丁脚本。
 *
 * 离屏 iframe 中 IntersectionObserver 永远不会触发（元素不在视口内），
 * 导致依赖 IO 做入场动画的内容（opacity:0 + transition）永远不可见。
 *
 * 补丁会在 observe() 调用后立即以 isIntersecting=true 触发回调，
 * 让页面 JS 把元素设为最终可见状态。
 *
 * 额外免癎：很多页面作者寫 IO callback 忘了动手（例如 entries.forEach 体是空的），
 * 或者只在 entry.isIntersecting 为 true 才反转 style。我们在 callback 调完后
 * 同步检查目标：若 opacity 仍是 0 或 transform 含 translate，强制复位为可见。
 * 导出场景下这是安全的：取到的装饰动画本来就该是「最终状态」。
 */
function injectIntersectionObserverPatch(html: string): string {
	const patchScript = `<script data-pdf-export="io-patch">(function(){var O=window.IntersectionObserver;if(!O)return;function R(t){try{if(!t||!t.style)return;t.style.setProperty("transition","none","important");var cs=getComputedStyle(t);if(cs.opacity==="0"||t.style.opacity==="0")t.style.setProperty("opacity","1","important");var tr=t.style.transform||cs.transform||"";if(tr&&tr!=="none"&&/translate|matrix/i.test(tr))t.style.setProperty("transform","none","important")}catch(e){}}window.IntersectionObserver=function(c,o){var obs=new O(c,o);var _ob=obs.observe.bind(obs);obs.observe=function(t){_ob(t);setTimeout(function(){var r=t.getBoundingClientRect();try{c([{time:performance.now(),target:t,rootBounds:null,boundingClientRect:r,intersectionRect:r,isIntersecting:true,intersectionRatio:1}],obs)}catch(e){}R(t)},0)};return obs};window.IntersectionObserver.prototype=O.prototype})()</script>`

	// 尽早注入：<head> 之后、或 <!DOCTYPE> / <html> 之后、或最前面
	if (/<head\b[^>]*>/i.test(html)) {
		return html.replace(/<head\b([^>]*)>/i, `<head$1>${patchScript}`)
	}
	if (/<html\b[^>]*>/i.test(html)) {
		return html.replace(/<html\b([^>]*)>/i, `<html$1>${patchScript}`)
	}
	return patchScript + html
}

/**
 * 等待 iframe 内字体加载完成（带超时保护）
 */
export function waitForFonts(iframeDocument: Document, timeoutMs: number): Promise<void> {
	const fonts = iframeDocument.fonts
	if (!fonts) return Promise.resolve()
	return Promise.race([
		fonts.ready.then(() => {
			log(LogLevel.L1, "[Sandbox] Fonts ready")
		}),
		new Promise<void>((resolve) =>
			setTimeout(() => {
				log(LogLevel.L3, "[Sandbox] Fonts ready timeout, proceeding", { timeoutMs })
				resolve()
			}, timeoutMs),
		),
	])
}
