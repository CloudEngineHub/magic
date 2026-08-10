const COPY_ARTICLE_SELECTION_MESSAGE = "COPY_ARTICLE_SELECTION"
const COPY_ARTICLE_SELECTION_RESULT_MESSAGE = "COPY_ARTICLE_SELECTION_RESULT"
const COPY_ARTICLE_SELECTION_TIMEOUT_MS = 300
const COMMENTS_SELECTOR = "[data-wechat-article-comments='true']"

interface CopyArticleSelectionResultMessage {
	type: typeof COPY_ARTICLE_SELECTION_RESULT_MESSAGE
	requestId: string
	success: boolean
}

interface PageViewState {
	activeElement: HTMLElement | null
	scrollX: number
	scrollY: number
	window: Window | null
}

function captureOwnerPageState(iframe: HTMLIFrameElement): PageViewState {
	const ownerDocument =
		iframe.ownerDocument || (typeof document !== "undefined" ? document : null)
	const ownerWindow =
		ownerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null)
	return {
		activeElement: (ownerDocument?.activeElement as HTMLElement | null) ?? null,
		scrollX: ownerWindow?.scrollX ?? 0,
		scrollY: ownerWindow?.scrollY ?? 0,
		window: ownerWindow,
	}
}

function restoreOwnerPageState(state: PageViewState): void {
	try {
		state.activeElement?.focus({ preventScroll: true })
	} catch {
		// The original control may have been removed while copying.
	}
	try {
		if (
			state.window &&
			(state.window.scrollX !== state.scrollX || state.window.scrollY !== state.scrollY)
		) {
			state.window.scrollTo({
				top: state.scrollY,
				left: state.scrollX,
				behavior: "auto",
			})
		}
	} catch {
		// Page scroll restoration is best-effort.
	}
}

function getCopyRange(document: Document): Range | null {
	const body = document.body
	if (!body) return null

	const comments = body.querySelector(COMMENTS_SELECTOR)
	const range = document.createRange()
	if (comments) {
		// The preview appends comments after the article body. Ending the range
		// before that node keeps review data out of the exported article.
		range.setStart(body, 0)
		range.setEndBefore(comments)
	} else {
		range.selectNodeContents(body)
	}

	return range.collapsed ? null : range
}

function restoreSelection(selection: Selection, ranges: Range[]): void {
	selection.removeAllRanges()
	ranges.forEach((range) => selection.addRange(range))
}

/**
 * Use the browser's native rich-text copy pipeline for a same-origin iframe.
 * This deliberately avoids serializing HTML ourselves so the browser can
 * preserve the rendered styles, images, and semantic structure like a manual copy.
 */
export function copyWechatArticleSelectionFromDocument(
	document: Document,
	frameWindow: Window | null,
): boolean {
	const range = getCopyRange(document)
	const selection = frameWindow?.getSelection?.() ?? document.getSelection?.()
	if (!range || !selection || typeof document.execCommand !== "function") return false

	const previousRanges = Array.from({ length: selection.rangeCount }, (_, index) =>
		selection.getRangeAt(index).cloneRange(),
	)
	const activeElement = document.activeElement as HTMLElement | null
	const scrollX = frameWindow?.scrollX ?? 0
	const scrollY = frameWindow?.scrollY ?? 0

	try {
		selection.removeAllRanges()
		selection.addRange(range)
		frameWindow?.focus?.()
		return document.execCommand("copy")
	} catch {
		return false
	} finally {
		restoreSelection(selection, previousRanges)
		try {
			activeElement?.focus({ preventScroll: true })
		} catch {
			// Focus restoration is best-effort for cross-origin or detached nodes.
		}
		try {
			frameWindow?.scrollTo({ top: scrollY, left: scrollX, behavior: "auto" })
		} catch {
			// Scroll restoration is best-effort and must not block copying.
		}
	}
}

function requestCrossOriginCopy(iframe: HTMLIFrameElement): Promise<boolean> {
	return new Promise((resolve) => {
		const requestId = `wechat-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`
		const targetWindow = iframe.contentWindow
		if (!targetWindow) {
			resolve(false)
			return
		}

		const cleanup = (success: boolean) => {
			window.clearTimeout(timeoutId)
			window.removeEventListener("message", handleMessage)
			resolve(success)
		}
		const handleMessage = (event: MessageEvent<CopyArticleSelectionResultMessage>) => {
			if (event.source !== targetWindow) return
			if (event.data?.type !== COPY_ARTICLE_SELECTION_RESULT_MESSAGE) return
			if (event.data.requestId !== requestId) return
			cleanup(event.data.success === true)
		}
		const timeoutId = window.setTimeout(() => cleanup(false), COPY_ARTICLE_SELECTION_TIMEOUT_MS)

		window.addEventListener("message", handleMessage)
		try {
			targetWindow.postMessage({ type: COPY_ARTICLE_SELECTION_MESSAGE, requestId }, "*")
		} catch {
			cleanup(false)
		}
	})
}

export async function copyWechatArticleSelection(
	iframe: HTMLIFrameElement | null | undefined,
): Promise<boolean> {
	if (!iframe) return false
	const ownerPageState = captureOwnerPageState(iframe)

	try {
		try {
			const sourceDocument = iframe.contentDocument
			if (sourceDocument?.body) {
				return copyWechatArticleSelectionFromDocument(sourceDocument, iframe.contentWindow)
			}
		} catch {
			// Cross-origin iframe access is expected to fail; use the sandbox bridge.
		}

		// Some browsers do not carry transient user activation across postMessage.
		// A false/timeout result is therefore a capability limit and lets the caller
		// use the ClipboardItem-based HTML fallback.
		return await requestCrossOriginCopy(iframe)
	} finally {
		restoreOwnerPageState(ownerPageState)
	}
}

/**
 * Only use copy mechanisms that finish inside the current user-activation task.
 * Cross-origin postMessage copying is intentionally excluded because awaiting
 * its result would make a later Clipboard API fallback lose click activation.
 */
export function copyWechatArticleSelectionSynchronously(
	iframe: HTMLIFrameElement | null | undefined,
): boolean {
	if (!iframe) return false
	const ownerPageState = captureOwnerPageState(iframe)
	try {
		const sourceDocument = iframe.contentDocument
		if (!sourceDocument?.body) return false
		return copyWechatArticleSelectionFromDocument(sourceDocument, iframe.contentWindow)
	} catch {
		return false
	} finally {
		restoreOwnerPageState(ownerPageState)
	}
}

export const wechatNativeClipboardInternals = {
	COMMENTS_SELECTOR,
	COPY_ARTICLE_SELECTION_MESSAGE,
	COPY_ARTICLE_SELECTION_RESULT_MESSAGE,
}
