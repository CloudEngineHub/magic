import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "../../hooks/types"
import { isSlidesTemplateFolder } from "../slides-template-folder"

function createStandardTemplate(overrides: Partial<AttachmentItem> = {}): AttachmentItem {
	return {
		file_id: "template-folder",
		name: "Quarterly template",
		is_directory: true,
		children: [
			{ name: "template.json", is_directory: false },
			{ name: "visual-spec.md", is_directory: false },
			{ name: "theme.css", is_directory: false },
			{ name: "slides", is_directory: true, children: [] },
		],
		...overrides,
	}
}

describe("isSlidesTemplateFolder", () => {
	it("recognizes the standard direct-child structure", () => {
		expect(isSlidesTemplateFolder(createStandardTemplate())).toBe(true)
	})

	it.each(["template.json", "visual-spec.md", "theme.css", "slides"])(
		"rejects a folder missing %s",
		(missingName) => {
			const item = createStandardTemplate()
			item.children = item.children?.filter((child) => child.name !== missingName)

			expect(isSlidesTemplateFolder(item)).toBe(false)
		},
	)

	it("rejects slides when it is a file", () => {
		const item = createStandardTemplate()
		const slides = item.children?.find((child) => child.name === "slides")
		if (slides) slides.is_directory = false

		expect(isSlidesTemplateFolder(item)).toBe(false)
	})

	it("does not recognize required files nested below direct children", () => {
		const item = createStandardTemplate({
			children: [
				{
					name: "metadata",
					is_directory: true,
					children: [
						{ name: "template.json", is_directory: false },
						{ name: "visual-spec.md", is_directory: false },
						{ name: "theme.css", is_directory: false },
					],
				},
				{ name: "slides", is_directory: true },
			],
		})

		expect(isSlidesTemplateFolder(item)).toBe(false)
	})

	it("does not mutate the original children array", () => {
		const item = createStandardTemplate()
		const originalChildren = item.children
		const originalNames = item.children?.map((child) => child.name)

		isSlidesTemplateFolder(item)

		expect(item.children).toBe(originalChildren)
		expect(item.children?.map((child) => child.name)).toEqual(originalNames)
	})
})
