import { beforeEach, describe, expect, it, vi } from "vitest"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import {
	mergeHtmlStaticDependencyFileIds,
	resolveSingleHtmlStaticDependencies,
} from "../htmlStaticDependencies"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
}))

describe("single HTML static dependency resolution", () => {
	beforeEach(() => {
		vi.mocked(getFileContentById).mockReset()
	})

	it("resolves relative static resources for one HTML file", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			'<img src="./images/cover.png"><script src="../shared/app.js"></script>',
		)

		const result = await resolveSingleHtmlStaticDependencies({
			fileIds: ["report-html"],
			attachments: [
				{
					file_id: "reports-folder",
					file_name: "reports",
					is_directory: true,
					children: [
						{
							file_id: "monthly-folder",
							file_name: "monthly",
							is_directory: true,
							children: [
								{
									file_id: "report-html",
									file_name: "index.html",
									file_extension: "html",
									relative_file_path: "reports/monthly/index.html",
								},
								{
									file_id: "images-folder",
									file_name: "images",
									is_directory: true,
									children: [
										{
											file_id: "cover-image",
											file_name: "cover.png",
											relative_file_path: "reports/monthly/images/cover.png",
										},
									],
								},
							],
						},
						{
							file_id: "shared-folder",
							file_name: "shared",
							is_directory: true,
							children: [
								{
									file_id: "shared-script",
									file_name: "app.js",
									relative_file_path: "reports/shared/app.js",
								},
							],
						},
					],
				},
			],
		})

		expect(getFileContentById).toHaveBeenCalledWith("report-html", { responseType: "text" })
		expect(result).toEqual({
			isHtml: true,
			dependencyFileIds: ["cover-image", "shared-script"],
			dependencyTransferFileIds: ["images-folder", "shared-folder"],
		})
	})

	it("does not read content for a batch selection or non-HTML file", async () => {
		const attachments = [
			{ file_id: "image", file_name: "cover.png", relative_file_path: "cover.png" },
			{ file_id: "html", file_name: "index.html", relative_file_path: "index.html" },
		]

		await expect(
			resolveSingleHtmlStaticDependencies({ fileIds: ["image"], attachments }),
		).resolves.toEqual({
			isHtml: false,
			dependencyFileIds: [],
			dependencyTransferFileIds: [],
		})
		await expect(
			resolveSingleHtmlStaticDependencies({ fileIds: ["html", "image"], attachments }),
		).resolves.toEqual({
			isHtml: false,
			dependencyFileIds: [],
			dependencyTransferFileIds: [],
		})
		expect(getFileContentById).not.toHaveBeenCalled()
	})

	it("only appends dependencies when inclusion is enabled", () => {
		expect(
			mergeHtmlStaticDependencyFileIds(["html", "image"], ["image", "script"], true),
		).toEqual(["html", "image", "script"])
		expect(mergeHtmlStaticDependencyFileIds(["html"], ["image"], false)).toEqual(["html"])
	})
})
