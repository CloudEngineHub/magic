import { beforeEach, describe, expect, it, vi } from "vitest"
import { duplicateSlide, findMagicProjectJsFile } from "../magicProjectUpdater"

const mockState = vi.hoisted(() => ({
	getFileContentById: vi.fn(),
	createFile: vi.fn(),
	saveFileContent: vi.fn(),
	deleteFile: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: mockState.createFile,
		saveFileContent: mockState.saveFileContent,
		deleteFile: mockState.deleteFile,
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: mockState.getFileContentById,
}))

vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	},
}))

vi.mock("i18next", () => ({
	t: (key: string) => key,
}))

describe("findMagicProjectJsFile", () => {
	beforeEach(() => {
		mockState.getFileContentById.mockReset()
		mockState.createFile.mockReset()
		mockState.saveFileContent.mockReset()
		mockState.deleteFile.mockReset()
		mockState.saveFileContent.mockResolvedValue({})
		mockState.deleteFile.mockResolvedValue({})
	})

	it("finds the matching magic.project.js for a directory among multiple projects", async () => {
		mockState.getFileContentById.mockImplementation(async (fileId: string) => {
			return `window.magicProjectConfig = { fileId: '${fileId}' }`
		})

		const result = await findMagicProjectJsFile({
			currentFileId: "deck-folder",
			currentFileName: "2026前沿UI设计盘点",
			attachments: [
				{
					file_id: "deck-folder",
					file_name: "2026前沿UI设计盘点",
					is_directory: true,
					relative_file_path: "deck",
					children: [
						{
							file_id: "magic-project-file",
							file_name: "magic.project.js",
							relative_file_path: "deck/magic.project.js",
						},
					],
				},
				{
					file_id: "other-deck-folder",
					file_name: "其他演示文稿",
					is_directory: true,
					relative_file_path: "other-deck",
					children: [
						{
							file_id: "other-magic-project-file",
							file_name: "magic.project.js",
							relative_file_path: "other-deck/magic.project.js",
						},
					],
				},
			],
		})

		expect(mockState.getFileContentById).toHaveBeenCalledWith("magic-project-file", {
			responseType: "text",
		})
		expect(mockState.getFileContentById).toHaveBeenCalledTimes(1)
		expect(result).toEqual({
			fileId: "magic-project-file",
			content: "window.magicProjectConfig = { fileId: 'magic-project-file' }",
		})
	})

	it("falls back to the only magic.project.js when the current slide is missing from attachments", async () => {
		mockState.getFileContentById.mockResolvedValue(
			"window.magicProjectConfig = { slides: ['missing.html'] }",
		)

		const result = await findMagicProjectJsFile({
			attachments: [
				{
					file_id: "magic-file",
					file_name: "magic.project.js",
					relative_file_path: "deck/magic.project.js",
					parent_id: "deck-folder",
					is_directory: false,
				},
			],
			currentFileId: "missing-slide-file",
			currentFileName: "missing.html",
		})

		expect(result?.fileId).toBe("magic-file")
		expect(result?.content).toContain("missing.html")
		expect(mockState.getFileContentById).toHaveBeenCalledWith("magic-file", {
			responseType: "text",
		})
	})

	it("duplicates a slide with the next available numbered filename", async () => {
		mockState.createFile.mockResolvedValue({ file_id: "slide-copy" })
		mockState.getFileContentById
			.mockResolvedValueOnce("<html>source</html>")
			.mockResolvedValueOnce(
				'window.magicProjectConfig = {"slides":["slides/intro.html","slides/intro (1).html"]}',
			)

		const result = await duplicateSlide({
			projectId: "project-1",
			parentId: "slides-dir",
			slidePath: "slides/intro.html",
			position: 0,
			currentSlides: ["slides/intro.html", "slides/intro (1).html"],
			magicProjectFileId: "magic-project",
			sourceFileId: "source-slide",
			attachments: [
				{ file_name: "intro (2).html", relative_file_path: "other/intro (2).html" },
			],
		})

		expect(result).toMatchObject({
			newFilePath: "slides/intro (2).html",
			newFileId: "slide-copy",
			insertIndex: 1,
		})
		expect(mockState.createFile).toHaveBeenCalledWith({
			project_id: "project-1",
			parent_id: "slides-dir",
			file_name: "intro (2).html",
			is_directory: false,
		})
		expect(mockState.saveFileContent).toHaveBeenNthCalledWith(1, [
			{ file_id: "slide-copy", content: "<html>source</html>", enable_shadow: true },
		])
		expect(mockState.saveFileContent).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({
				file_id: "magic-project",
				content: expect.stringContaining(
					'"slides": [\n        "slides/intro.html",\n        "slides/intro (2).html"',
				),
			}),
		])
	})

	it("removes the copied file when project order persistence fails", async () => {
		mockState.createFile.mockResolvedValue({ file_id: "slide-copy" })
		mockState.getFileContentById
			.mockResolvedValueOnce("<html>source</html>")
			.mockResolvedValueOnce('window.magicProjectConfig = {"slides":[]}')
		mockState.saveFileContent
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("save failed"))

		await expect(
			duplicateSlide({
				projectId: "project-1",
				parentId: "slides-dir",
				slidePath: "intro.html",
				position: 0,
				currentSlides: ["intro.html"],
				magicProjectFileId: "magic-project",
				sourceFileId: "source-slide",
			}),
		).rejects.toThrow("save failed")
		expect(mockState.deleteFile).toHaveBeenCalledWith("slide-copy")
	})
})
