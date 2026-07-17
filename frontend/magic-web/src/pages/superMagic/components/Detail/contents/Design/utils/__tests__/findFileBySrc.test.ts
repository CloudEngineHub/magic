import { describe, expect, it } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { findFileBySrc } from "../utils"

function fileItem(fileId: string, fileName: string, relativeFilePath: string): FileItem {
	return {
		file_id: fileId,
		file_name: fileName,
		file_extension: fileName.split(".").pop() ?? "",
		relative_file_path: relativeFilePath,
		is_directory: false,
	}
}

describe("findFileBySrc", () => {
	it("strictly matches current canvas relative resources inside the design folder", () => {
		const files = [fileItem("cat", "cat.png", "/design-a/images/cat.png")]

		expect(
			findFileBySrc("./images/cat.png", files, "design-a", null, {
				strictCanvasRelativeResource: true,
			})?.file_id,
		).toBe("cat")
	})

	it("does not fall back to same-name files in other design folders for current canvas resources", () => {
		const files = [fileItem("other-cat", "cat.png", "/design-b/images/cat.png")]

		expect(
			findFileBySrc("./images/cat.png", files, "design-a", null, {
				strictCanvasRelativeResource: true,
			}),
		).toBeNull()
	})

	it("does not fall back to workspace-root legacy resource paths in strict mode", () => {
		const files = [fileItem("root-cat", "cat.png", "/images/cat.png")]

		expect(
			findFileBySrc("images/cat.png", files, "design-a", null, {
				strictCanvasRelativeResource: true,
			}),
		).toBeNull()
	})

	it("keeps the legacy relaxed match when strict canvas resource matching is not requested", () => {
		const files = [fileItem("other-cat", "cat.png", "/design-b/images/cat.png")]

		expect(findFileBySrc("./images/cat.png", files, "design-a")?.file_id).toBe("other-cat")
	})
})
