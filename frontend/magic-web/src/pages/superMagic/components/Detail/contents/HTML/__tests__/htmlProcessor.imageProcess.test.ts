import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { processHtmlContent } from "../htmlProcessor"
import { HTML_PREVIEW_IMAGE_PROCESS } from "../previewImageProcess"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

vi.mock("@/utils/packageAsset", () => ({
	getPackageAssetUrl: () => "",
}))

describe("processHtmlContent image processing", () => {
	beforeEach(() => {
		vi.mocked(getTemporaryDownloadUrl).mockReset()
	})

	it("replaces preloaded image URLs with the WebP variant without reprocessing scripts", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValue([
			{
				file_id: "image-file",
				url: "https://oss.example.com/hero.webp",
			},
		] as never)

		const attachments = [
			{
				file_id: "image-file",
				file_name: "hero.png",
				relative_file_path: "deck/hero.png",
				updated_at: "2026-07-15T00:00:00.000Z",
			},
			{
				file_id: "script-file",
				file_name: "app.js",
				relative_file_path: "deck/app.js",
				updated_at: "2026-07-15T00:00:00.000Z",
			},
		]

		const result = await processHtmlContent({
			content: '<img src="hero.png"><script src="app.js"></script>',
			attachments,
			attachmentList: attachments,
			html_relative_path: "deck/",
			preloadedUrlMapping: new Map([
				["image-file", "https://oss.example.com/hero.png"],
				["script-file", "https://oss.example.com/app.js"],
			]),
			xMagicImageProcess: HTML_PREVIEW_IMAGE_PROCESS,
		})

		expect(getTemporaryDownloadUrl).toHaveBeenCalledWith({
			file_ids: ["image-file"],
			options: { xMagicImageProcess: HTML_PREVIEW_IMAGE_PROCESS },
		})
		expect(result.processedContent).toContain("https://oss.example.com/hero.webp")
		expect(result.processedContent).toContain("https://oss.example.com/app.js")
	})

	it("keeps cached image URLs isolated by processing parameters and original files", async () => {
		vi.mocked(getTemporaryDownloadUrl)
			.mockResolvedValueOnce([
				{
					file_id: "variant-image-file",
					url: "https://oss.example.com/hero-400.webp",
					expires_at: "2099-07-28 12:00:00",
				},
			] as never)
			.mockResolvedValueOnce([
				{
					file_id: "variant-image-file",
					url: "https://oss.example.com/hero-2160.webp",
					expires_at: "2099-07-28 12:00:00",
				},
			] as never)
			.mockResolvedValueOnce([
				{
					file_id: "variant-image-file",
					url: "https://oss.example.com/hero-original.png",
					expires_at: "2099-07-28 12:00:00",
				},
			] as never)

		const attachments = [
			{
				file_id: "variant-image-file",
				file_name: "hero.png",
				relative_file_path: "post/assets/hero.png",
				updated_at: "2026-07-28T00:00:00.000Z",
			},
		]
		const thumbnailOptions = {
			resize: { w: 400, m: "lfit" as const },
			quality: 80,
			format: "webp" as const,
		}
		const contentOptions = {
			resize: { w: 2160, m: "lfit" as const },
			quality: 90,
			format: "webp" as const,
		}

		const thumbnailResult = await processHtmlContent({
			content: '<img src="assets/hero.png">',
			attachments,
			attachmentList: attachments,
			html_relative_path: "post/",
			xMagicImageProcess: thumbnailOptions,
		})
		const contentResult = await processHtmlContent({
			content: '<img src="assets/hero.png">',
			attachments,
			attachmentList: attachments,
			html_relative_path: "post/",
			xMagicImageProcess: contentOptions,
		})
		const originalResult = await processHtmlContent({
			content: '<img src="assets/hero.png">',
			attachments,
			attachmentList: attachments,
			html_relative_path: "post/",
		})

		expect(getTemporaryDownloadUrl).toHaveBeenNthCalledWith(1, {
			file_ids: ["variant-image-file"],
			options: { xMagicImageProcess: thumbnailOptions },
		})
		expect(getTemporaryDownloadUrl).toHaveBeenNthCalledWith(2, {
			file_ids: ["variant-image-file"],
			options: { xMagicImageProcess: contentOptions },
		})
		expect(getTemporaryDownloadUrl).toHaveBeenNthCalledWith(3, {
			file_ids: ["variant-image-file"],
		})
		expect(thumbnailResult.processedContent).toContain("https://oss.example.com/hero-400.webp")
		expect(contentResult.processedContent).toContain("https://oss.example.com/hero-2160.webp")
		expect(originalResult.processedContent).toContain(
			"https://oss.example.com/hero-original.png",
		)
	})
})
