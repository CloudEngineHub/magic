import { describe, expect, it, vi } from "vitest"
import { buildSingleFileDownloadMenu } from "../build-single-file-download-menu"

const handlers = {
	handleDownloadOriginal: vi.fn(),
	handleDownloadPdf: vi.fn(),
	handleDownloadPpt: vi.fn(),
	handleDownloadPptx: vi.fn(),
}

const t = (key: string) => key

describe("buildSingleFileDownloadMenu", () => {
	it.each(["html", "md", "markdown"])(
		"uses only the default dependency-aware download entry for %s files",
		(extension) => {
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

			expect(menuItems.some((entry) => entry.key === "downloadWithDependencies")).toBe(false)
			menuItems.find((entry) => entry.key === "downloadOriginal")?.onClick?.()
			expect(handlers.handleDownloadOriginal).toHaveBeenCalled()
		},
	)
})
