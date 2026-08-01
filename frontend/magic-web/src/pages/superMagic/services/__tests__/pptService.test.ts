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

	it("does not convert an AbortError from a multi-slide loader into an empty page", async () => {
		mocks.loadSlide.mockRejectedValue(new DOMException("cancelled", "AbortError"))
		const iterator = iterateExportSlides({
			slidePaths: [slidePath],
			attachmentList,
			mainFileId: "main",
		})[Symbol.asyncIterator]()

		await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" })
	})

	it("keeps ordinary per-page failures compatible by yielding an empty page", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.loadSlide.mockRejectedValue(new Error("load failed"))
		const iterator = iterateExportSlides({
			slidePaths: [slidePath],
			attachmentList,
			mainFileId: "main",
		})[Symbol.asyncIterator]()

		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: { index: 0, key: slidePath, html: "" },
		})
		expect(consoleError).toHaveBeenCalled()
	})
})
