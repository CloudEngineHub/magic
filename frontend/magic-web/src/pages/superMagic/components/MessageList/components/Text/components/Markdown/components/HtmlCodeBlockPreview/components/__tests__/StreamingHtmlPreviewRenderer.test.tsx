import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StreamingHtmlPreviewRenderer } from "../StreamingHtmlPreviewRenderer"

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/utils", () => ({
	rewriteHtmlWithMagicCdn: (content: string) => content,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/utils/full-content", () => ({
	decodeHTMLEntities: (content: string) => content,
	getFullContent: (content: string) => content,
}))

describe("StreamingHtmlPreviewRenderer", () => {
	it("preserves the iframe scroll position across streaming updates", () => {
		render(
			<StreamingHtmlPreviewRenderer
				content={"<!DOCTYPE html><html><body><div>Hello</div></body></html>"}
				onReady={vi.fn()}
				onMetrics={vi.fn()}
			/>,
		)

		const runtimeDocument =
			screen.getByTestId("streaming-html-preview-renderer").getAttribute("srcdoc") ?? ""

		expect(runtimeDocument).toContain("scrollRestoreFrameId")
		expect(runtimeDocument).toContain("function captureScrollPosition()")
		expect(runtimeDocument).toContain("function scheduleScrollRestore(scrollPosition)")
		expect(runtimeDocument).toContain("patchBodyContent(parsedDocument, scrollPosition)")
		expect(runtimeDocument).toContain("scheduleScrollRestore(scrollPosition);")
		expect(runtimeDocument).toContain('type: "streamingPreviewError"')
		expect(screen.getByTestId("streaming-html-preview-renderer")).toHaveAttribute(
			"allow",
			"fullscreen; pointer-lock",
		)
	})

	it("acknowledges only the content version that the iframe rendered successfully", () => {
		const onContentCommitted = vi.fn()
		const onReady = vi.fn()
		render(
			<StreamingHtmlPreviewRenderer
				content={"<!DOCTYPE html><html><body><div>Hello</div></body></html>"}
				onReady={onReady}
				onMetrics={vi.fn()}
				onContentCommitted={onContentCommitted}
			/>,
		)

		const iframe = screen.getByTestId("streaming-html-preview-renderer") as HTMLIFrameElement
		const iframeWindow = iframe.contentWindow
		expect(iframeWindow).not.toBeNull()
		const postMessageMock = vi.spyOn(iframeWindow as Window, "postMessage")

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframeWindow,
					data: { type: "iframeReady" },
				}),
			)
		})

		const postedPayload = postMessageMock.mock.calls[0]?.[0] as
			| { contentVersion?: number }
			| undefined
		expect(postedPayload?.contentVersion).toBe(1)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframeWindow,
					data: { type: "renderComplete", contentVersion: 0 },
				}),
			)
		})

		expect(onReady).not.toHaveBeenCalled()
		expect(onContentCommitted).not.toHaveBeenCalled()

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframeWindow,
					data: { type: "renderComplete", contentVersion: 1 },
				}),
			)
		})

		expect(onContentCommitted).toHaveBeenCalledWith(
			"<!DOCTYPE html><html><body><div>Hello</div></body></html>",
		)
		expect(onReady).toHaveBeenCalledTimes(1)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframeWindow,
					data: { type: "pageFullyLoaded", contentVersion: 1 },
				}),
			)
		})

		expect(onContentCommitted).toHaveBeenCalledTimes(1)
		expect(onReady).toHaveBeenCalledTimes(1)
	})

	it("does not inject scroll CSS into a script string containing a closing head tag", () => {
		const content = [
			"<!DOCTYPE html><html><head>",
			"<script>var nestedDocument = '</style></head><body>';</script>",
			"</head><body><main>Report</main></body></html>",
		].join("")

		render(
			<StreamingHtmlPreviewRenderer
				content={content}
				onReady={vi.fn()}
				onMetrics={vi.fn()}
			/>,
		)

		const iframe = screen.getByTestId("streaming-html-preview-renderer") as HTMLIFrameElement
		const iframeWindow = iframe.contentWindow
		expect(iframeWindow).not.toBeNull()
		const postMessageMock = vi.spyOn(iframeWindow as Window, "postMessage")

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframeWindow,
					data: { type: "iframeReady" },
				}),
			)
		})

		const postedPayload = postMessageMock.mock.calls[0]?.[0] as { content?: string } | undefined
		const postedContent = postedPayload?.content ?? ""

		expect(postedContent).toContain("<head>\n<style data-streaming-preview-scroll-lock")
		expect(postedContent).toContain(
			"<script>var nestedDocument = '</style></head><body>';</script>",
		)
		expect(postedContent.match(/data-streaming-preview-scroll-lock/g)).toHaveLength(1)
	})
})
