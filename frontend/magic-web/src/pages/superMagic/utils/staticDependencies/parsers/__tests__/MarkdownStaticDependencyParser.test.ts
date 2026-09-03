import { describe, expect, it } from "vitest"
import { buildAttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import { MarkdownStaticDependencyParser } from "../MarkdownStaticDependencyParser"

describe("MarkdownStaticDependencyParser", () => {
	it("resolves Markdown images and embedded media relative to the document", async () => {
		const attachments = [
			{
				file_id: "docs-folder",
				file_name: "docs",
				is_directory: true,
				children: [
					{
						file_id: "readme-md",
						file_name: "README.md",
						file_extension: "md",
						relative_file_path: "docs/guide/README.md",
					},
				],
			},
			{
				file_id: "assets-folder",
				file_name: "assets",
				is_directory: true,
				children: [
					{
						file_id: "cover-image",
						file_name: "cover.png",
						relative_file_path: "docs/assets/cover.png",
					},
					{
						file_id: "poster-image",
						file_name: "poster.jpg",
						relative_file_path: "docs/assets/poster.jpg",
					},
				],
			},
			{
				file_id: "media-folder",
				file_name: "media",
				is_directory: true,
				children: [
					{
						file_id: "demo-video",
						file_name: "demo.mp4",
						relative_file_path: "docs/media/demo.mp4",
					},
				],
			},
		]
		const attachmentIndex = buildAttachmentIndex(attachments, { includeHidden: true })
		const file = attachmentIndex.getItemById("readme-md")
		if (!file) throw new Error("Markdown fixture file is missing")

		const result = await new MarkdownStaticDependencyParser().resolve({
			file,
			content:
				'![cover](../assets/cover.png)\n<video poster="../assets/poster.jpg"><source src="../media/demo.mp4"></video>',
			attachments,
			attachmentIndex,
		})

		expect(result).toEqual({
			fileType: "markdown",
			dependencyFileIds: ["cover-image", "poster-image", "demo-video"],
			dependencyTransferFileIds: ["assets-folder", "media-folder"],
			missingResourcePaths: [],
		})
	})

	it("ignores external resources and reports missing local resources", async () => {
		const attachments = [
			{
				file_id: "readme-md",
				file_name: "README.md",
				file_extension: "md",
				relative_file_path: "README.md",
			},
		]
		const attachmentIndex = buildAttachmentIndex(attachments, { includeHidden: true })

		const result = await new MarkdownStaticDependencyParser().resolve({
			file: attachments[0],
			content: "![remote](https://example.com/a.png)\n![missing](./missing.png)",
			attachments,
			attachmentIndex,
		})

		expect(result.dependencyFileIds).toEqual([])
		expect(result.missingResourcePaths).toEqual(["./missing.png"])
	})
})
