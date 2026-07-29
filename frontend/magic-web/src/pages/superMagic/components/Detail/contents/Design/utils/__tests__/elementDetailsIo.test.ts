import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import type { CanvasDocument, LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import { writeUserElementDetails } from "../elementDetailsIo"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: vi.fn(),
		saveFileContent: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
}))

const EMPTY_DETAILS_DOC = {
	version: "1.0.0",
	elements: {},
}

function file(file_id: string, file_name: string, parent_id: string | null) {
	return {
		file_id,
		file_name,
		parent_id,
		is_directory: false,
	}
}

function designData(elements: LayerElement[] = []) {
	return {
		type: "design",
		name: "design",
		version: "2.0.0",
		canvas: { elements } as CanvasDocument,
	}
}

describe("writeUserElementDetails", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({} as never)
	})

	it("skips saving when an existing user sidecar is already empty", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(JSON.stringify(EMPTY_DETAILS_DOC) as never)

		await writeUserElementDetails(designData(), {
			mainFileId: "main",
			flatAttachments: [
				file("main", "magic.project.js", "dir"),
				file("user-details", "element-details-user.json", "dir"),
			] as never,
			projectId: "project-1",
		})

		expect(SuperMagicApi.createFile).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("skips saving when an existing user sidecar content is unchanged", async () => {
		const userDoc = {
			version: "1.0.0",
			elements: {
				"image-1": {
					generateImageRequest: { prompt: "same" },
					source: "user",
				},
			},
		}
		vi.mocked(getFileContentById).mockResolvedValue(JSON.stringify(userDoc) as never)

		await writeUserElementDetails(
			designData([
				{
					id: "image-1",
					type: "image",
					x: 0,
					y: 0,
					width: 100,
					height: 100,
					generateImageRequest: { prompt: "same" },
				} as LayerElement,
			]),
			{
				mainFileId: "main",
				flatAttachments: [
					file("main", "magic.project.js", "dir"),
					file("user-details", "element-details-user.json", "dir"),
				] as never,
				projectId: "project-1",
			},
		)

		expect(SuperMagicApi.createFile).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("saves one empty document when clearing a previously non-empty user sidecar", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			JSON.stringify({
				version: "1.0.0",
				elements: {
					"image-1": {
						generateImageRequest: { prompt: "old" },
						source: "user",
					},
				},
			}) as never,
		)

		await writeUserElementDetails(designData(), {
			mainFileId: "main",
			flatAttachments: [
				file("main", "magic.project.js", "dir"),
				file("user-details", "element-details-user.json", "dir"),
			] as never,
			projectId: "project-1",
		})

		expect(SuperMagicApi.createFile).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledWith([
			{
				file_id: "user-details",
				content: JSON.stringify(EMPTY_DETAILS_DOC, null, 2),
				enable_shadow: true,
			},
		])
	})
})
