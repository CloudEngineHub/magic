import { describe, expect, it } from "vitest"
import type { CanvasDesignStorageData } from "@/components/CanvasDesign/public/magic-types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { normalizeCanvasStorageData } from "../useCanvasStorage"

const DESIGN_A = "新建画布A"

function fileItem(fileId: string, relativeFilePath: string): FileItem {
	const fileName = relativeFilePath.split("/").pop() ?? ""
	return {
		file_id: fileId,
		file_name: fileName,
		file_extension: "png",
		relative_file_path: relativeFilePath,
		is_directory: false,
	}
}

function storageWithReferencePath(path: string): CanvasDesignStorageData {
	return {
		tempImageConfigs: {
			"image-1": {
				reference_images: [path],
			},
		},
	} as CanvasDesignStorageData
}

function getStoredReferencePath(data: CanvasDesignStorageData): string | undefined {
	return data.tempImageConfigs?.["image-1"]?.reference_images?.[0]
}

describe("normalizeCanvasStorageData", () => {
	it("repairs a bare resource only when the current canvas uniquely owns it", () => {
		const normalized = normalizeCanvasStorageData(storageWithReferencePath("images/cat.png"), {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("canvas-cat", `${DESIGN_A}/images/cat.png`)],
		})

		expect(getStoredReferencePath(normalized)).toBe("./images/cat.png")
	})

	it("preserves a bare workspace-root resource in local drafts", () => {
		const normalized = normalizeCanvasStorageData(storageWithReferencePath("images/cat.png"), {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("workspace-cat", "images/cat.png")],
		})

		expect(getStoredReferencePath(normalized)).toBe("images/cat.png")
	})

	it("preserves an ambiguous bare resource instead of rewriting it during a UI-state save", () => {
		const normalized = normalizeCanvasStorageData(storageWithReferencePath("images/cat.png"), {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("canvas-cat", `${DESIGN_A}/images/cat.png`),
				fileItem("workspace-cat", "images/cat.png"),
			],
		})

		expect(getStoredReferencePath(normalized)).toBe("images/cat.png")
	})
})
