import { READY_STATE_FALLBACK_MS } from "../shared/constants"

/** 创建离屏隐藏 iframe，作为 HTML 渲染沙箱容器 */
export function createHiddenIframe({
	htmlWidth,
	htmlHeight,
}: {
	htmlWidth: number
	htmlHeight: number
}): HTMLIFrameElement {
	const iframe = document.createElement("iframe")
	iframe.style.cssText = `
		width: ${htmlWidth}px;
		height: ${htmlHeight}px;
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
	/** 便于沙箱内 video 解码、seek 首帧（与 muted 等配合） */
	iframe.setAttribute("allow", "autoplay")
	iframe.setAttribute("translate", "no")
	return iframe
}

export function normalizeSandboxHtml(html: string): string {
	return injectExportPatches(injectVideoCrossOriginAnonymous(decodeInlineScriptEntities(html)))
}

/** 判断文档是否已达到可进入导出渲染阶段的状态 */
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

/**
 * 测量文档真实内容尺寸，用于自动分页与 PPT 页面宽度自适应。
 * 兜底取 iframe 自身尺寸，确保短内容也能撑满至少一页。
 */
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
	const width = Math.max(
		root?.scrollWidth ?? 0,
		root?.offsetWidth ?? 0,
		body?.scrollWidth ?? 0,
		body?.offsetWidth ?? 0,
		fallbackWidth,
	)
	const height = Math.max(
		root?.scrollHeight ?? 0,
		root?.offsetHeight ?? 0,
		body?.scrollHeight ?? 0,
		body?.offsetHeight ?? 0,
		fallbackHeight,
	)
	return { width, height }
}

/**
 * 为未声明 crossorigin 的 `<video>` 开始标签注入 `crossorigin="anonymous"`（单次扫描，O(n)）。
 * 实现用 `[^>]*` 匹配到第一个 `>`：若属性值里含未转义的 `>` 会截断错误，需在模板中避免或手写 crossorigin。
 * script/style 内若出现字面量 `<video...>` 也会被替换，导出 HTML 一般不含此类片段。
 */
function injectVideoCrossOriginAnonymous(html: string): string {
	return html.replace(/<video\b([^>]*)>/gi, (full) => {
		if (/\bcrossorigin\s*=/i.test(full)) return full
		return full.replace(/^<video\b/i, '<video crossorigin="anonymous"')
	})
}

/** 解码内联 script 中被 HTML 转义的字符，避免脚本内容失真 */
function decodeInlineScriptEntities(rawHtml: string): string {
	return rawHtml.replace(
		/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
		(full, attrs: string, code: string) => {
			if (/\bsrc\s*=/.test(attrs)) return full
			const decodedCode = code
				.replace(/&amp;(?=(?:lt|gt|quot|#39|apos);)/gi, "&")
				.replace(/&lt;/gi, "<")
				.replace(/&gt;/gi, ">")
				.replace(/&quot;/gi, "\"")
				.replace(/&#39;|&apos;/gi, "'")
			if (decodedCode === code) return full
			return `<script${attrs}>${decodedCode}</script>`
		},
	)
}

/**
 * 注入导出补丁：
 * 1. Mock IntersectionObserver —— 立即触发回调（isIntersecting: true），
 *    避免滚动触发的 fade-in 动画在离屏 iframe 中永远不执行。
 * 2. 禁用 CSS animation / transition —— 确保元素保持最终静态样式，
 *    防止 @keyframes 中 opacity:0 导致元素被判定为不可见。
 */
const EXPORT_PATCHES = `<script>
(function(){
var O=window.IntersectionObserver;
window.IntersectionObserver=function(cb,opts){
this._cb=cb;this._els=[];
};
window.IntersectionObserver.prototype.observe=function(el){
this._els.push(el);
var self=this;
Promise.resolve().then(function(){
self._cb([{target:el,isIntersecting:true,intersectionRatio:1,
boundingClientRect:el.getBoundingClientRect(),
intersectionRect:el.getBoundingClientRect(),
rootBounds:null,time:performance.now()}],self);
});
};
window.IntersectionObserver.prototype.unobserve=function(){};
window.IntersectionObserver.prototype.disconnect=function(){};
})();
<\/script>
<style>*,*::before,*::after{animation:none!important;transition:none!important;}</style>`

function injectExportPatches(html: string): string {
	const headMatch = html.match(/<head\b[^>]*>/i)
	if (headMatch) {
		const insertPos = headMatch.index! + headMatch[0].length
		return html.slice(0, insertPos) + EXPORT_PATCHES + html.slice(insertPos)
	}
	const htmlMatch = html.match(/<html\b[^>]*>/i)
	if (htmlMatch) {
		const insertPos = htmlMatch.index! + htmlMatch[0].length
		return html.slice(0, insertPos) + "<head>" + EXPORT_PATCHES + "</head>" + html.slice(insertPos)
	}
	return EXPORT_PATCHES + html
}
