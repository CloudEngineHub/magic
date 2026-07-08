import { beforeEach, describe, expect, it, vi } from "vitest"
import { findMagicProjectJsFile } from "../magicProjectUpdater"
import { getFileContentById } from "@/pages/superMagic/utils/api"

vi.mock("@/apis", () => ({
	SuperMagicApi: {},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
}))

describe("magicProjectUpdater", () => {
	beforeEach(() => {
		vi.mocked(getFileContentById).mockReset()
	})

	it("falls back to the only magic.project.js when the current slide is missing from attachments", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
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
		expect(getFileContentById).toHaveBeenCalledWith("magic-file", {
			responseType: "text",
		})
	})
})
