import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DRAG_TYPE } from "@/pages/superMagic/components/MessageEditor/utils/drag"
import { SuperMagicApi } from "@/apis"
import { resolveDesignDropResourcePaths, useDesignFileDropPaths } from "../useDesignFileDropPaths"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		copyFile: vi.fn(),
	},
}))

const DESIGN_A = "新建画布A"
const DESIGN_B = "新建画布B"

function createDataTransfer(payload: unknown): DataTransfer {
	return {
		getData: (type: string) => (type === "text/plain" ? JSON.stringify(payload) : ""),
		types: ["text/plain"],
	} as unknown as DataTransfer
}

function projectFile(relativeFilePath: string, fileName = "asset.png") {
	return createDataTransfer({
		type: DRAG_TYPE.ProjectFile,
		data: {
			file_id: "938499924873998337",
			file_name: fileName,
			relative_file_path: relativeFilePath,
			is_directory: false,
		},
	})
}

describe("resolveDesignDropResourcePaths", () => {
	it("keeps a project-root media file absolute instead of copying it", () => {
		expect(resolveDesignDropResourcePaths(projectFile("/错误样本.png"), DESIGN_A)).toEqual([
			"/错误样本.png",
		])
	})

	it("uses a relative DSL path only for media inside the current canvas", () => {
		expect(
			resolveDesignDropResourcePaths(
				projectFile(`/${DESIGN_A}/images/cat.png`, "cat.png"),
				DESIGN_A,
			),
		).toEqual(["./images/cat.png"])
	})

	it("keeps media from another canvas absolute even without a legacy leading slash", () => {
		expect(
			resolveDesignDropResourcePaths(
				projectFile(`${DESIGN_B}/images/cat.png`, "cat.png"),
				DESIGN_A,
			),
		).toEqual([`/${DESIGN_B}/images/cat.png`])
	})

	it("treats attachment-tree images paths as workspace-root absolute", () => {
		expect(
			resolveDesignDropResourcePaths(projectFile("images/cat.png", "cat.png"), DESIGN_A),
		).toEqual(["/images/cat.png"])
	})

	it("filters unsupported project files without starting a copy flow", () => {
		expect(
			resolveDesignDropResourcePaths(
				projectFile("/notes/readme.txt", "readme.txt"),
				DESIGN_A,
			),
		).toEqual([])
	})
})

describe("useDesignFileDropPaths", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("uses the backend-selected name and primes file info before returning", async () => {
		const copyFile = vi.mocked(SuperMagicApi.copyFile)
		copyFile.mockResolvedValue({
			status: "success",
			files: {
				file_id: "911343142164795394",
				file_name: "a(1).png",
				relative_file_path: `${DESIGN_A}/images/a(1).png`,
			},
		} as never)
		const getFileInfoById = vi.fn(async () => ({
			file_id: "911343142164795394",
			src: "https://example.test/a(1).png",
			fileName: "a(1).png",
		}))
		const setFileInfoCache = vi.fn()
		const updateAttachments = vi.fn()

		const { result } = renderHook(() =>
			useDesignFileDropPaths({
				projectId: "project-1",
				currentFile: { id: "canvas-1", name: DESIGN_A },
				designProjectBasePath: DESIGN_A,
				updateAttachments,
				getOrCreateImagesDir: vi.fn(async () => ({
					imagesDirFileId: "images-dir-1",
					suffixDir: `${DESIGN_A}/images`,
				})),
				getFileInfoById,
				setFileInfoCache,
			}),
		)

		let paths: string[] = []
		await act(async () => {
			paths = await result.current.getDataTransferFileInfo(
				projectFile("/source/a.png", "a.png"),
			)
		})

		expect(copyFile).toHaveBeenCalledWith({
			file_id: "938499924873998337",
			target_parent_id: "images-dir-1",
			target_project_id: "project-1",
			pre_file_id: "-1",
			keep_both_file_ids: ["938499924873998337"],
		})
		expect(getFileInfoById).toHaveBeenCalledWith("911343142164795394", "a(1).png")
		expect(setFileInfoCache).toHaveBeenCalledWith(
			"./images/a(1).png",
			expect.objectContaining({ src: "https://example.test/a(1).png" }),
			{ allowMissingAttachment: true },
		)
		expect(paths).toEqual(["./images/a(1).png"])
		expect(updateAttachments).toHaveBeenCalledTimes(1)
	})

	it("does not copy a resource already inside the current canvas", async () => {
		const copyFile = vi.mocked(SuperMagicApi.copyFile)
		const { result } = renderHook(() =>
			useDesignFileDropPaths({
				projectId: "project-1",
				currentFile: { id: "canvas-1", name: DESIGN_A },
				designProjectBasePath: DESIGN_A,
				updateAttachments: vi.fn(),
				getOrCreateImagesDir: vi.fn(),
			}),
		)

		let paths: string[] = []
		await act(async () => {
			paths = await result.current.getDataTransferFileInfo(
				projectFile(`/${DESIGN_A}/images/a.png`),
			)
		})

		expect(paths).toEqual(["./images/a.png"])
		expect(copyFile).not.toHaveBeenCalled()
	})

	it("returns the copied path when file-info preload fails", async () => {
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		vi.mocked(SuperMagicApi.copyFile).mockResolvedValue({
			status: "success",
			files: {
				file_id: "911343142164795394",
				file_name: "a.png",
			},
		} as never)
		const updateAttachments = vi.fn()
		const { result } = renderHook(() =>
			useDesignFileDropPaths({
				projectId: "project-1",
				currentFile: { id: "canvas-1", name: DESIGN_A },
				designProjectBasePath: DESIGN_A,
				updateAttachments,
				getOrCreateImagesDir: vi.fn(async () => ({
					imagesDirFileId: "images-dir-1",
					suffixDir: `${DESIGN_A}/images`,
				})),
				getFileInfoById: vi.fn(async () => {
					throw new Error("preload failed")
				}),
				setFileInfoCache: vi.fn(),
			}),
		)

		let paths: string[] = []
		await act(async () => {
			paths = await result.current.getDataTransferFileInfo(
				projectFile("/source/a.png", "a.png"),
			)
		})

		expect(paths).toEqual(["./images/a.png"])
		expect(updateAttachments).toHaveBeenCalledTimes(1)
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"[useDesignFileDropPaths] 复制文件信息预热失败:",
			expect.objectContaining({ message: "preload failed" }),
		)
		consoleWarnSpy.mockRestore()
	})
})
