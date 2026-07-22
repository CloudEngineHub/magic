import { describe, expect, it } from "vitest"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignData } from "../../types"
import { migrateLoadedDesignDataPaths } from "../designPathTransitionMigration"
import { generateMagicProjectJsContent } from "../utils"

const DESIGN_A = "新建画布A"

function fileItem(fileId: string, relativeFilePath: string): FileItem {
	const fileName = relativeFilePath.split("/").pop() ?? ""
	return {
		file_id: fileId,
		file_name: fileName,
		file_extension: fileName.split(".").pop() ?? "",
		relative_file_path: relativeFilePath,
		is_directory: false,
	}
}

function designWithImagePath(src: string): DesignData {
	return {
		type: "design",
		name: DESIGN_A,
		version: "1.0.0",
		canvas: {
			elements: [
				{
					id: "image-1",
					type: "image",
					src,
					zIndex: 1,
				} as LayerElement,
			],
		},
	}
}

function getImageSrc(data: DesignData): string {
	return (data.canvas?.elements?.[0] as { src: string }).src
}

describe("design path transition migration", () => {
	it("repairs a legacy bare resource only when the current design owns it", () => {
		const data = designWithImagePath("images/cat.png")

		migrateLoadedDesignDataPaths(data, {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("canvas-cat", `${DESIGN_A}/images/cat.png`)],
		})

		expect(getImageSrc(data)).toBe("./images/cat.png")
	})

	it("preserves a legacy bare workspace-root resource instead of misrepairing it", () => {
		const data = designWithImagePath("images/cat.png")

		migrateLoadedDesignDataPaths(data, {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [fileItem("workspace-cat", "images/cat.png")],
		})

		expect(getImageSrc(data)).toBe("images/cat.png")
	})

	it("preserves ambiguous bare resources and waits for a later safe save", () => {
		const data = designWithImagePath("images/cat.png")

		migrateLoadedDesignDataPaths(data, {
			designProjectBasePath: DESIGN_A,
			flatAttachments: [
				fileItem("canvas-cat", `${DESIGN_A}/images/cat.png`),
				fileItem("workspace-cat", "images/cat.png"),
			],
		})

		expect(getImageSrc(data)).toBe("images/cat.png")
	})

	it("repairs an explicit current-design absolute path without attachment lookup", () => {
		const data = designWithImagePath(`/${DESIGN_A}/images/cat.png`)

		migrateLoadedDesignDataPaths(data, {
			designProjectBasePath: DESIGN_A,
		})

		expect(getImageSrc(data)).toBe("./images/cat.png")
	})

	it("persists only attachment-confirmed legacy repairs during a normal save", () => {
		const currentCanvasContent = generateMagicProjectJsContent(
			designWithImagePath("images/cat.png"),
			{
				projectBasePath: DESIGN_A,
				flatAttachments: [fileItem("canvas-cat", `${DESIGN_A}/images/cat.png`)],
			},
		)
		const workspaceRootContent = generateMagicProjectJsContent(
			designWithImagePath("images/cat.png"),
			{
				projectBasePath: DESIGN_A,
				flatAttachments: [fileItem("workspace-cat", "images/cat.png")],
			},
		)

		expect(currentCanvasContent).toContain("./images/cat.png")
		expect(workspaceRootContent).toContain('"src": "images/cat.png"')
	})
})
