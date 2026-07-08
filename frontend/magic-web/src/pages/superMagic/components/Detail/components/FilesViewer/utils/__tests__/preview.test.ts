import { describe, expect, it, vi } from "vitest"
import { DetailType } from "../../../../types"
import type { FileItem } from "../../types"
import { detectContentTypeRender } from "../preview"

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	getFileType: vi.fn(),
}))

describe("detectContentTypeRender", () => {
	it("treats slide project folders as PPT render entries", () => {
		const item: FileItem = {
			file_id: "deck-folder",
			file_name: "2026前沿UI设计盘点",
			is_directory: true,
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
			display_config: {
				type: "slide",
			},
		})
	})
})
