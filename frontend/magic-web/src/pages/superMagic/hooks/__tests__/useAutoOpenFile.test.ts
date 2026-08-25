import { describe, expect, it } from "vitest"
import { pickPreferredAutoOpenAttachment } from "../useAutoOpenFile"

function createTemplateRoot() {
	return {
		file_id: "template-root",
		file_name: "产品发布模板",
		is_directory: true,
		children: [
			{ file_id: "template-json", file_name: "template.json", is_directory: false },
			{ file_id: "spec", file_name: "visual-spec.md", is_directory: false },
			{ file_id: "theme", file_name: "theme.css", is_directory: false },
			{ file_id: "slides", file_name: "slides", is_directory: true, children: [] },
		],
	}
}

describe("pickPreferredAutoOpenAttachment", () => {
	it("prefers the template root over newer preview images", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "thumb",
				file_name: "thumbnail.png",
				file_extension: "png",
				is_directory: false,
			},
			createTemplateRoot(),
			{
				file_id: "template-json",
				file_name: "template.json",
				file_extension: "json",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("template-root")
	})

	it("falls back to template.json when the root folder is not in attachments", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "thumb",
				file_name: "thumbnail.png",
				file_extension: "png",
				is_directory: false,
			},
			{
				file_id: "template-json",
				file_name: "template.json",
				file_extension: "json",
				is_directory: false,
			},
			{
				file_id: "slide-1",
				file_name: "cover.html",
				file_extension: "html",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("template-json")
	})

	it("falls back to the first openable attachment for ordinary files", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "readme",
				file_name: "readme.md",
				file_extension: "md",
				is_directory: false,
			},
			{
				file_id: "image",
				file_name: "preview.png",
				file_extension: "png",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("readme")
	})
})
