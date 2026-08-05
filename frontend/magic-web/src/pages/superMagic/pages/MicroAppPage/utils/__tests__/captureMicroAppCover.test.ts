import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { captureHtmlAsMicroAppCover, prepareMicroAppCoverHtml } from "../captureMicroAppCover"

const mocks = vi.hoisted(() => ({
	captureElementToCanvas: vi.fn(),
	drawImage: vi.fn(),
	getFileContentById: vi.fn(),
	getFullContent: vi.fn(),
	processHtmlContent: vi.fn(),
}))

vi.mock("@magic-web/html2image", () => ({
	captureElementToCanvas: mocks.captureElementToCanvas,
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: mocks.getFileContentById,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor", () => ({
	processHtmlContent: mocks.processHtmlContent,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/utils/full-content", () => ({
	decodeHTMLEntities: (content: string) => content,
	getFullContent: mocks.getFullContent,
}))

describe("captureMicroAppCover", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: mocks.drawImage,
		} as unknown as CanvasRenderingContext2D)
		vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
			callback(new Blob(["cover"], { type: "image/webp" }))
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("loads and processes index.html before rendering", async () => {
		mocks.getFileContentById.mockResolvedValue("<html>raw</html>")
		mocks.processHtmlContent.mockResolvedValue({ processedContent: "<html>ready</html>" })
		mocks.getFullContent.mockReturnValue("<html>full</html>")

		const content = await prepareMicroAppCoverHtml({
			entryFile: { file_id: "index-file", file_name: "index.html" },
			attachments: [{ file_id: "asset-tree" }],
			attachmentList: [{ file_id: "asset-list" }],
		})

		expect(content).toBe("<html>full</html>")
		expect(mocks.getFileContentById).toHaveBeenCalledWith("index-file", {
			responseType: "text",
		})
		expect(mocks.processHtmlContent).toHaveBeenCalledWith({
			content: "<html>raw</html>",
			attachments: [{ file_id: "asset-tree" }],
			fileId: "index-file",
			fileName: "index.html",
			attachmentList: [{ file_id: "asset-list" }],
		})
		expect(mocks.getFullContent).toHaveBeenCalledWith("<html>ready</html>", "index-file", {
			disableParentClickBridge: true,
			dynamicInterception: { enable: false },
		})
	})

	it("renders in a temporary same-origin iframe and reuses captureElementToCanvas", async () => {
		const sourceCanvas = document.createElement("canvas")
		sourceCanvas.width = 2560
		sourceCanvas.height = 1600
		mocks.captureElementToCanvas.mockResolvedValue(sourceCanvas)

		const nativeAppendChild = document.body.appendChild.bind(document.body)
		vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
			const appended = nativeAppendChild(node)
			const iframe = (node as HTMLElement).querySelector("iframe")
			window.setTimeout(() => iframe?.dispatchEvent(new Event("load")), 0)
			return appended
		})

		const blob = await captureHtmlAsMicroAppCover("<html><body>App</body></html>")

		expect(blob.type).toBe("image/webp")
		const captureInput = mocks.captureElementToCanvas.mock.calls[0][0]
		expect(captureInput.element.tagName).toBe("HTML")
		expect(captureInput.signal.aborted).toBe(false)
		expect(mocks.drawImage).toHaveBeenCalledWith(
			sourceCanvas,
			0,
			0,
			2560,
			1600,
			0,
			0,
			1280,
			800,
		)
		expect(document.body.querySelector("iframe[srcdoc]")).toBeNull()
	})
})
