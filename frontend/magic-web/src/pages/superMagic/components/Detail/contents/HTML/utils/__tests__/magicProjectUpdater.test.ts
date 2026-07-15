import { beforeEach, describe, expect, it, vi } from "vitest"
import { findMagicProjectJsFile } from "../magicProjectUpdater"

const mockState = vi.hoisted(() => ({
	getFileContentById: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {},
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
	})

	it("finds magic.project.js when the current PPT entry is a directory", async () => {
		mockState.getFileContentById.mockResolvedValue(
			"window.magicProjectConfig = { slides: ['slides/slide-1.html'] }",
		)

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
			],
		})

		expect(mockState.getFileContentById).toHaveBeenCalledWith("magic-project-file", {
			responseType: "text",
		})
		expect(result).toEqual({
			fileId: "magic-project-file",
			content: "window.magicProjectConfig = { slides: ['slides/slide-1.html'] }",
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
})
