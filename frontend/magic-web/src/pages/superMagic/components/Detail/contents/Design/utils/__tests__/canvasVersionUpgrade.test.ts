import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import type { DesignData } from "../../types"
import { upgradeCanvasToV2 } from "../canvasVersionUpgrade"
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

vi.mock("../elementDetailsIo", () => ({
	writeUserElementDetails: vi.fn(),
}))

function createDesignData(elements: LayerElement[] = []): DesignData {
	return {
		type: "design",
		name: "design",
		version: "1.0.0",
		canvas: { elements },
	}
}

describe("upgradeCanvasToV2", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.createFile).mockResolvedValue({ file_id: "backup-file" } as never)
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({} as never)
		vi.mocked(writeUserElementDetails).mockResolvedValue(true)
	})

	it("blocks upgrade before any remote write when the original v1 canvas is missing", async () => {
		const originalContent = `
			window.magicProjectConfig = {
				version: "1.0.0",
				type: "design",
				name: "missing",
			};
		`
		vi.mocked(getFileContentById).mockResolvedValue(originalContent as never)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		await expect(
			upgradeCanvasToV2(createDesignData(), {
				magicProjectJsFileId: "main-file",
				projectId: "project-1",
			}),
		).rejects.toThrow("Unsafe canvas status for v1 upgrade: missing")

		expect(SuperMagicApi.createFile).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
		expect(writeUserElementDetails).not.toHaveBeenCalled()
		expect(warnSpy).toHaveBeenCalledWith(
			"[DesignVersionUpgrade]",
			expect.stringContaining("blocked-unsafe-v1-upgrade"),
		)
		warnSpy.mockRestore()
	})

	it("allows upgrade when the original v1 canvas is explicitly empty", async () => {
		const originalContent = `
			window.magicProjectConfig = {
				version: "1.0.0",
				type: "design",
				name: "empty",
				canvas: { elements: [] },
			};
		`
		vi.mocked(getFileContentById).mockResolvedValue(originalContent as never)

		const result = await upgradeCanvasToV2(createDesignData(), {
			magicProjectJsFileId: "main-file",
			projectId: "project-1",
			attachments: [{ file_id: "main-file", parent_id: "parent-1" } as never],
		})

		expect(result.version).toBe("2.0.0")
		expect(result.canvas?.elements).toEqual([])
		expect(SuperMagicApi.saveFileContent).toHaveBeenNthCalledWith(1, [
			{ file_id: "backup-file", content: originalContent },
		])
		expect(SuperMagicApi.saveFileContent).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({
				file_id: "main-file",
				enable_shadow: true,
				content: expect.stringContaining('"version": "2.0.0"'),
			}),
		])
		expect(writeUserElementDetails).toHaveBeenCalledWith(
			expect.objectContaining({ version: "2.0.0" }),
			expect.objectContaining({ mainFileId: "main-file", projectId: "project-1" }),
		)
	})

	it("uses the original remote canvas as the upgrade source", async () => {
		const originalContent = `
				window.magicProjectConfig = {
					version: "1.0.0",
					type: "design",
					name: "remote",
					canvas: { elements: [{ id: "remote-rect", type: "rectangle" }] },
				};
			`
		vi.mocked(getFileContentById).mockResolvedValue(originalContent as never)

		const result = await upgradeCanvasToV2(
			createDesignData([{ id: "memory-rect", type: "rectangle" } as LayerElement]),
			{
				magicProjectJsFileId: "main-file",
				projectId: "project-1",
			},
		)

		expect(result.version).toBe("2.0.0")
		expect(result.canvas?.elements).toEqual([expect.objectContaining({ id: "remote-rect" })])
	})
})
