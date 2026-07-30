import { describe, expect, it } from "vitest"
import { DetailType } from "../../../../types"
import type { FileItem } from "../../types"
import { detectContentTypeRender } from "../preview"

describe("detectContentTypeRender", () => {
	it("treats slide project folders as PPT render entries", () => {
		const item: FileItem = {
			file_id: "deck-folder",
			file_name: "2026前沿UI设计盘点",
			is_directory: true,
			relative_file_path: "projects/deck",
			parent_id: "project-root",
			display_config: {
				type: "slide",
				slides: ["slides/slide-1.html"],
			},
			children: [],
		}

		const config = detectContentTypeRender(item)

		expect(config?.detailType).toBe(DetailType.Html)
		expect(config?.dataTransformer?.(item)).toMatchObject({
			file_name: "2026前沿UI设计盘点",
			is_directory: true,
			relative_file_path: "projects/deck",
			parent_id: "project-root",
			display_config: {
				type: "slide",
			},
		})
	})

	it("does not emit undefined PPT path metadata over a complete attachment node", () => {
		const item: FileItem = {
			file_id: "partial-deck-folder",
			file_name: "Partial deck",
			is_directory: true,
			display_config: {
				type: "slide",
				slides: ["slide-1.html"],
			},
		}

		const transformedData = detectContentTypeRender(item)?.dataTransformer?.(item)

		expect(transformedData).not.toHaveProperty("relative_file_path")
		expect(transformedData).not.toHaveProperty("parent_id")
	})
})
