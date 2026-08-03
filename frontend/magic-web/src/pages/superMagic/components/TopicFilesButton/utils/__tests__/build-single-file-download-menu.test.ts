import { describe, expect, it, vi } from "vitest"
import { buildSingleFileDownloadMenu } from "../build-single-file-download-menu"

const handlers = {
	handleDownloadOriginal: vi.fn(),
	handleDownloadWithDependencies: vi.fn(),
	handleDownloadPdf: vi.fn(),
	handleDownloadPpt: vi.fn(),
	handleDownloadPptx: vi.fn(),
}

const t = (key: string) => key

describe("buildSingleFileDownloadMenu", () => {
	it.each(["html", "md"])("adds a linked-resource download for %s files", (extension) => {
		const menuItems = buildSingleFileDownloadMenu({
			item: {
				file_id: `document-${extension}`,
				file_name: `document.${extension}`,
				file_extension: extension,
				is_directory: false,
			},
			handlers,
			t: t as never,
		})

		const item = menuItems.find((entry) => entry.key === "downloadWithDependencies")
		expect(item?.label).toBe("topicFiles.contextMenu.downloadWithDependencies")
		item?.onClick?.()
		expect(handlers.handleDownloadWithDependencies).toHaveBeenCalled()
	})
})
