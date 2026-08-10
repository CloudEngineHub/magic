import { describe, expect, it } from "vitest"
import { buildAttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import { HtmlStaticDependencyParser } from "../HtmlStaticDependencyParser"

describe("HtmlStaticDependencyParser", () => {
	it("resolves HTML resources and derives move/copy transfer roots", async () => {
		const attachments = [
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
		]
		const attachmentIndex = buildAttachmentIndex(attachments, { includeHidden: true })
		const file = attachmentIndex.getItemById("report-html")
		if (!file) throw new Error("HTML fixture file is missing")

		const result = await new HtmlStaticDependencyParser().resolve({
			file,
			content: '<img src="./images/cover.png"><script src="../shared/app.js"></script>',
			attachments,
			attachmentIndex,
		})

		expect(result).toEqual({
			fileType: "html",
			dependencyFileIds: ["cover-image", "shared-script"],
			dependencyTransferFileIds: ["images-folder", "shared-folder"],
			missingResourcePaths: [],
		})
	})
})
