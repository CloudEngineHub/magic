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

	it("preserves the slide bridge position with an inert placeholder", async () => {
		const attachments = [
			{
				file_id: "placeholder-file",
				file_name: "placeholder.txt",
				relative_file_path: "deck/placeholder.txt",
				updated_at: "2026-07-15T00:00:00.000Z",
			},
		]
		const content = `<!DOCTYPE html>
<html>
<head></head>
<body>
<main>Placeholder content</main>
<script src="slide-bridge.js"></script>
</body>
</html>`

		const result = await processHtmlContent({
			content,
			attachments,
			attachmentList: attachments,
			html_relative_path: "deck/",
		})

		expect(result.processedContent).toContain('data-has-slide-bridge="true"')
		expect(result.processedContent).toContain("\n<!--magic-slide-bridge-placeholder-->\n")
		expect(result.processedContent).not.toContain('<script src="slide-bridge.js"></script>')
	})
})
