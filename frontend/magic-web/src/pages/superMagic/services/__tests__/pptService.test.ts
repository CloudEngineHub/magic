import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	collectFileIds: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
	loadSlide: vi.fn(),
	processSlideWithUrlMapping: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/Detail/components/PPTRender/services", () => ({
	SlideLoaderService: class {
		loadSlide = mocks.loadSlide
	},
	SlideProcessorService: class {
		collectFileIds = mocks.collectFileIds
		processSlideWithUrlMapping = mocks.processSlideWithUrlMapping
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: mocks.getTemporaryDownloadUrl,
}))

import { iterateExportSlides, iterateSingleExportSlide } from "../pptService"

const slidePath = "./slides/slide-1.html"
const attachmentList = [
	{
		file_id: "main",
		file_name: "index.html",
		relative_file_path: "/deck/index.html",
	},
	{
		file_id: "slide-1",
		file_name: "slide-1.html",
		relative_file_path: "/deck/slides/slide-1.html",
	},
]

describe("pptService lazy export providers", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.collectFileIds.mockReturnValue(new Set())
		mocks.processSlideWithUrlMapping.mockImplementation(async (html: string) => html)
		mocks.getTemporaryDownloadUrl.mockImplementation(
			async ({ file_ids }: { file_ids: string[] }) =>
				file_ids.map((fileId) => ({
					file_id: fileId,
					url: `https://example.com/${fileId}`,
				})),
		)
	})

	it("cancels a single-slide provider while its HTML is loading", async () => {
		mocks.loadSlide.mockImplementation(() => new Promise(() => undefined))
		const controller = new AbortController()
		const iterator = iterateSingleExportSlide({
			fileId: "slide-1",
			fileName: "slide-1.html",
			attachmentList,
			signal: controller.signal,
		})[Symbol.asyncIterator]()
		const nextPage = iterator.next()
		await vi.waitFor(() => expect(mocks.loadSlide).toHaveBeenCalledOnce())

		controller.abort()

		await expect(nextPage).rejects.toMatchObject({ name: "AbortError" })
	})

	it("exports a single HTML file when no cancellation signal is provided", async () => {
		mocks.loadSlide.mockResolvedValue("<main>single</main>")

		const pages = []
		for await (const page of iterateSingleExportSlide({
			fileId: "slide-1",
			fileName: "slide-1.html",
			attachmentList,
		})) {
			pages.push(page)
		}

		expect(pages).toEqual([
			{
				index: 0,
				html: "<main>single</main>",
				key: "slide-1",
				pageName: "slide-1.html",
				pagePath: "slide-1.html",
				pageFileId: "slide-1",
			},
		])
	})

	it("does not convert an AbortError from a multi-slide loader into an empty page", async () => {
		mocks.loadSlide.mockRejectedValue(new DOMException("cancelled", "AbortError"))
		const iterator = iterateExportSlides({
			slidePaths: [slidePath],
			attachmentList,
			mainFileId: "main",
		})[Symbol.asyncIterator]()

		await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" })
	})

	it("skips an ordinary per-page failure without yielding a blank page", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.loadSlide.mockRejectedValue(new Error("load failed"))
		const iterator = iterateExportSlides({
			slidePaths: [slidePath],
			attachmentList,
			mainFileId: "main",
		})[Symbol.asyncIterator]()

		await expect(iterator.next()).rejects.toThrow("No exportable slides could be prepared")
		expect(consoleError).toHaveBeenCalled()
	})

	it("keeps successful pages when another page fails to prepare", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const secondSlidePath = "./slides/slide-2.html"
		const attachments = [
			...attachmentList,
			{
				file_id: "slide-2",
				file_name: "slide-2.html",
				relative_file_path: "/deck/slides/slide-2.html",
			},
		]
		mocks.loadSlide
			.mockRejectedValueOnce(new Error("load failed"))
			.mockResolvedValueOnce("<main>second</main>")

		const pages = []
		for await (const page of iterateExportSlides({
			slidePaths: [slidePath, secondSlidePath],
			attachmentList: attachments,
			mainFileId: "main",
		})) {
			pages.push(page)
		}

		expect(pages).toEqual([
			{
				index: 1,
				key: secondSlidePath,
				html: "<main>second</main>",
				pageName: "slide-2.html",
				pagePath: secondSlidePath,
				pageFileId: "slide-2",
			},
		])
		expect(consoleError).toHaveBeenCalled()
	})
})
