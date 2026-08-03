import { beforeEach, describe, expect, it, vi } from "vitest"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import { mergeStaticDependencyFileIds, resolveSingleDocumentStaticDependencies } from ".."

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
}))

describe("resolveSingleDocumentStaticDependencies", () => {
	beforeEach(() => {
		vi.mocked(getFileContentById).mockReset()
	})

	it("loads content and delegates a supported document to its parser", async () => {
		vi.mocked(getFileContentById).mockResolvedValue("# README")

		await expect(
			resolveSingleDocumentStaticDependencies({
				fileIds: ["readme-md"],
				attachments: [
					{
						file_id: "readme-md",
						file_name: "README.md",
						file_extension: "md",
					},
				],
			}),
		).resolves.toEqual({
			fileType: "markdown",
			dependencyFileIds: [],
			dependencyTransferFileIds: [],
			missingResourcePaths: [],
		})
		expect(getFileContentById).toHaveBeenCalledWith("readme-md", {
			responseType: "text",
		})
	})

	it("does not read content for unsupported or batch selections", async () => {
		const attachments = [
			{ file_id: "image", file_name: "cover.png", relative_file_path: "cover.png" },
			{ file_id: "html", file_name: "index.html", relative_file_path: "index.html" },
		]

		await expect(
			resolveSingleDocumentStaticDependencies({ fileIds: ["image"], attachments }),
		).resolves.toMatchObject({ fileType: null, dependencyFileIds: [] })
		await expect(
			resolveSingleDocumentStaticDependencies({
				fileIds: ["html", "image"],
				attachments,
			}),
		).resolves.toMatchObject({ fileType: null, dependencyFileIds: [] })
		expect(getFileContentById).not.toHaveBeenCalled()
	})
})

describe("mergeStaticDependencyFileIds", () => {
	it("merges dependency IDs only when requested", () => {
		expect(mergeStaticDependencyFileIds(["doc", "image"], ["image", "script"], true)).toEqual([
			"doc",
			"image",
			"script",
		])
		expect(mergeStaticDependencyFileIds(["doc"], ["image"], false)).toEqual(["doc"])
	})
})
