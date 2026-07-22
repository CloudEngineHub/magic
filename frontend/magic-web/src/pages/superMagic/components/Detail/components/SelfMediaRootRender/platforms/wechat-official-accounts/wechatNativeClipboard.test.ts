import { describe, expect, it, vi } from "vitest"
import {
	copyWechatArticleSelection,
	copyWechatArticleSelectionFromDocument,
	wechatNativeClipboardInternals,
} from "./wechatNativeClipboard"

function createSelectionMock(initialRanges: Range[] = []) {
	let ranges: Range[] = [...initialRanges]
	return {
		get rangeCount() {
			return ranges.length
		},
		getRangeAt: (index: number) => ranges[index],
		removeAllRanges: vi.fn(() => {
			ranges = []
		}),
		addRange: vi.fn((range: Range) => {
			ranges.push(range)
		}),
	}
}

describe("wechatNativeClipboard", () => {
	it("copies only article content before the rendered comments section", () => {
		const sourceDocument = document.implementation.createHTMLDocument("wechat article")
		sourceDocument.body.innerHTML = `
			<main><h1>Article title</h1><p>Article body</p></main>
			<section data-wechat-article-comments="true">精选评论 2 Alice</section>
		`
		const previousRange = sourceDocument.createRange()
		const title = sourceDocument.querySelector("h1")
		if (!title) throw new Error("missing article title")
		previousRange.selectNodeContents(title)
		const selection = createSelectionMock([previousRange])
		const execCommand = vi.fn(() => {
			const range = selection.getRangeAt(0)
			expect(range.cloneContents().textContent).toContain("Article body")
			expect(range.cloneContents().textContent).not.toContain("Alice")
			return true
		})
		Object.defineProperty(sourceDocument, "execCommand", {
			configurable: true,
			value: execCommand,
		})

		const frameWindow = {
			getSelection: () => selection,
			focus: vi.fn(),
			scrollX: 12,
			scrollY: 34,
			scrollTo: vi.fn(),
		} as unknown as Window

		expect(copyWechatArticleSelectionFromDocument(sourceDocument, frameWindow)).toBe(true)
		expect(execCommand).toHaveBeenCalledWith("copy")
		expect(frameWindow.scrollTo).toHaveBeenCalledWith({
			top: 34,
			left: 12,
			behavior: "auto",
		})
		expect(selection.rangeCount).toBe(1)
		expect(selection.getRangeAt(0).cloneContents().textContent).toBe("Article title")
	})

	it("selects the whole body when the article has no comments", () => {
		const sourceDocument = document.implementation.createHTMLDocument("wechat article")
		sourceDocument.body.innerHTML = "<main><p>Article body</p></main>"
		const selection = createSelectionMock()
		const execCommand = vi.fn(() => {
			expect(selection.getRangeAt(0).cloneContents().textContent).toContain("Article body")
			return true
		})
		Object.defineProperty(sourceDocument, "execCommand", {
			configurable: true,
			value: execCommand,
		})

		expect(
			copyWechatArticleSelectionFromDocument(sourceDocument, {
				getSelection: () => selection,
			} as unknown as Window),
		).toBe(true)
	})

	it("returns false when the browser does not expose execCommand", () => {
		const sourceDocument = document.implementation.createHTMLDocument("wechat article")
		sourceDocument.body.innerHTML = "<main>Article body</main>"

		expect(
			copyWechatArticleSelectionFromDocument(sourceDocument, {
				getSelection: () => createSelectionMock(),
			} as unknown as Window),
		).toBe(false)
	})

	it("uses the sandbox bridge when iframe access is cross-origin", async () => {
		const postMessage = vi.fn()
		const targetWindow = { postMessage } as unknown as Window
		const iframe = { contentWindow: targetWindow } as HTMLIFrameElement
		Object.defineProperty(iframe, "contentDocument", {
			configurable: true,
			get: () => {
				throw new DOMException("Blocked", "SecurityError")
			},
		})

		const copyPromise = copyWechatArticleSelection(iframe)
		const request = postMessage.mock.calls[0]?.[0] as {
			type: string
			requestId: string
		}
		const message = new MessageEvent("message", {
			data: {
				type: wechatNativeClipboardInternals.COPY_ARTICLE_SELECTION_RESULT_MESSAGE,
				requestId: request.requestId,
				success: true,
			},
		})
		Object.defineProperty(message, "source", { configurable: true, value: targetWindow })
		window.dispatchEvent(message)

		expect(request.type).toBe(wechatNativeClipboardInternals.COPY_ARTICLE_SELECTION_MESSAGE)
		await expect(copyPromise).resolves.toBe(true)
	})
})
