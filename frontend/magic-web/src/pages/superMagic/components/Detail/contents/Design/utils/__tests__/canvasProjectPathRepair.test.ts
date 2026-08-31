import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { getFileContentById, getFileContentsByIds } from "@/pages/superMagic/utils/api"
import { parseMagicProjectConfigContent } from "@/pages/superMagic/utils/magicProjectConfigParser"
import { compressCanvasData, decompressCanvasData } from "../magicProjectCompression"
import { repairCanvasProjectsBeforeFileOperation } from "../canvasProjectPathRepair"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		saveFileContent: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
	getFileContentsByIds: vi.fn(),
}))

function projectContent(version: string, canvas: unknown, name = "Canvas") {
	const canvasValue =
		version === "2.0.0" || version === "3.0.0" ? compressCanvasData(canvas) : canvas
	return `window.magicProjectConfig = ${JSON.stringify({ version, type: "design", name, canvas: canvasValue })};`
}

function attachments() {
	return [
		{
			file_id: "root",
			file_name: "Canvas",
			name: "Canvas",
			is_directory: true,
			relative_file_path: "Canvas",
		},
		{
			file_id: "main",
			file_name: "magic.project.js",
			parent_id: "root",
			relative_file_path: "Canvas/magic.project.js",
		},
		{
			file_id: "images",
			file_name: "images",
			parent_id: "root",
			is_directory: true,
			relative_file_path: "Canvas/images",
		},
		{
			file_id: "image",
			file_name: "a.png",
			parent_id: "images",
			relative_file_path: "Canvas/images/a.png",
		},
	] as any
}

function attachmentsWithParentIdOnly() {
	return [
		{
			file_id: "root",
			file_name: "Canvas",
			is_directory: true,
		},
		{
			file_id: "main",
			file_name: "magic.project.js",
			parent_id: "root",
		},
		{
			file_id: "images",
			file_name: "images",
			parent_id: "root",
			is_directory: true,
		},
		{
			file_id: "image",
			file_name: "a.png",
			parent_id: "images",
		},
	] as any
}

function mediaAttachments() {
	return [
		...attachments(),
		{
			file_id: "videos",
			file_name: "videos",
			parent_id: "root",
			is_directory: true,
			relative_file_path: "Canvas/videos",
		},
		{
			file_id: "video",
			file_name: "v.mp4",
			parent_id: "videos",
			relative_file_path: "Canvas/videos/v.mp4",
		},
		{
			file_id: "audios",
			file_name: "audios",
			parent_id: "root",
			is_directory: true,
			relative_file_path: "Canvas/audios",
		},
		{
			file_id: "audio",
			file_name: "a.mp3",
			parent_id: "audios",
			relative_file_path: "Canvas/audios/a.mp3",
		},
	] as any
}

function saveSuccessResponse(fileIds: string | string[]) {
	const ids = Array.isArray(fileIds) ? fileIds : [fileIds]
	return {
		batch_id: "batch-1",
		total: ids.length,
		success: ids.length,
		error: 0,
		success_files: ids.map((fileId, index) => ({
			index,
			file_id: fileId,
			status: "success",
			data: { file_id: fileId, size: 1, updated_at: "now" },
			duration_ms: 1,
		})),
		error_files: [],
	}
}

describe("repairCanvasProjectsBeforeFileOperation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(getFileContentsByIds).mockImplementation(async (fileIds) => {
			const successes = new Map<string, string | ArrayBuffer | Blob>()
			const failures = new Map<string, Error>()
			await Promise.all(
				fileIds.map(async (fileId) => {
					try {
						const content = await vi.mocked(getFileContentById)(fileId, {
							responseType: "text",
						})
						successes.set(fileId, content)
					} catch (error) {
						failures.set(
							fileId,
							error instanceof Error ? error : new Error(String(error)),
						)
					}
				}),
			)
			return { successes, failures }
		})
		vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(
			async (payload) => saveSuccessResponse(payload.map((file) => file.file_id)) as never,
		)
	})

	it("repairs v1 paths and synchronizes a renamed canvas root name", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "rename",
			rename: { oldName: "Canvas", newName: "Renamed" },
		})

		expect(result.failures).toEqual([])
		expect(getFileContentsByIds).toHaveBeenCalledTimes(1)
		expect(getFileContentsByIds).toHaveBeenCalledWith(["main"], { responseType: "text" })
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0]
		expect(saved.file_id).toBe("main")
		expect(saved.content).toContain('"name": "Renamed"')
		expect(saved.content).toContain('"src": "./images/a.png"')
	})

	it("repairs dirty absolute paths in a v3 compressed canvas without upgrading it", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("3.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "rename",
			rename: { oldName: "Canvas", newName: "Renamed" },
		})

		expect(result.failures).toEqual([])
		expect(result.requiresConfirmation).toBe(false)
		expect(result.repairedFileIds).toEqual(["main"])
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0].content as string
		const savedConfig = parseMagicProjectConfigContent(saved) as {
			version: string
			name: string
			canvas: string
		}
		expect(savedConfig.version).toBe("3.0.0")
		expect(savedConfig.name).toBe("Renamed")
		expect(savedConfig.canvas).toMatch(/^MAGICPROJECTDESIGNDATA:\/\//)
		expect(decompressCanvasData(savedConfig.canvas)).toEqual({
			elements: [{ type: "image", contents: [{ src: "./images/a.png" }] }],
		})
	})

	it("repairs a v3 plain canvas envelope without changing its physical shape", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			`window.magicProjectConfig = ${JSON.stringify({
				version: "3.0.0",
				type: "design",
				name: "Canvas",
				canvas: {
					elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
				},
			})};` as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "move",
		})

		expect(result.failures).toEqual([])
		expect(result.repairedFileIds).toEqual(["main"])
		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0].content as string
		const savedConfig = parseMagicProjectConfigContent(saved) as {
			version: string
			canvas: { elements: Array<{ contents: Array<{ src: string }> }> }
		}
		expect(savedConfig.version).toBe("3.0.0")
		expect(typeof savedConfig.canvas).toBe("object")
		expect(savedConfig.canvas.elements[0].contents[0].src).toBe("./images/a.png")
	})

	it("repairs v2 compressed canvas while preserving version", async () => {
		const files = [
			...attachments(),
			{
				file_id: "agent-details",
				file_name: "element-details.json",
				parent_id: "root",
				relative_file_path: "Canvas/element-details.json",
			},
			{
				file_id: "user-details",
				file_name: "element-details-user.json",
				parent_id: "root",
				relative_file_path: "Canvas/element-details-user.json",
			},
		] as any
		vi.mocked(getFileContentById).mockImplementation(async (fileId: string) => {
			if (fileId === "main") {
				return projectContent("2.0.0", {
					elements: [{ type: "image", contents: [{ src: "Canvas/images/a.png" }] }],
				}) as never
			}
			return JSON.stringify({
				version: "2.0.0",
				elements: {
					image: {
						generateImageRequest: {
							file_dir: "/Canvas/images",
							reference_images: ["/Canvas/images/a.png"],
						},
					},
				},
			}) as never
		})

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: files,
			items: [files[0]],
			operation: "move",
		})

		expect(result.failures).toEqual([])
		expect(getFileContentsByIds).toHaveBeenCalledTimes(2)
		expect(getFileContentsByIds.mock.calls[0]).toEqual([["main"], { responseType: "text" }])
		expect(getFileContentsByIds.mock.calls[1]).toEqual([
			["agent-details", "user-details"],
			{ responseType: "text" },
		])
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
		const saves = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0]
		const mainSave = saves.find((save: any) => save.file_id === "main")!
		const config = parseMagicProjectConfigContent(mainSave.content) as {
			version: string
			canvas: string
		}
		expect(config.version).toBe("2.0.0")
		const canvas = decompressCanvasData(config.canvas) as any
		expect(canvas.elements[0].contents[0].src).toBe("./images/a.png")
		for (const fileId of ["agent-details", "user-details"]) {
			const sidecar = JSON.parse(
				String(saves.find((save: any) => save.file_id === fileId)?.content),
			)
			expect(sidecar.elements.image.generateImageRequest.file_dir).toBe("./images")
			expect(sidecar.elements.image.generateImageRequest.reference_images).toEqual([
				"./images/a.png",
			])
		}
	})

	it("does not read or save when no canvas is under the selected directory", async () => {
		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [{ file_id: "other", file_name: "Other", is_directory: true } as any],
			operation: "move",
		})

		expect(result.affectedProjects).toEqual([])
		expect(getFileContentById).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("does not repair when only a canvas resource file is moved", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)

		const tree = attachments()
		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			fileIds: ["image"],
			operation: "move",
		})

		expect(result.affectedProjects).toEqual([])
		expect(getFileContentById).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("resolves parent_id-only trees and absolute workspace paths", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [
					{ type: "image", contents: [{ src: "/workspace/Canvas/images/a.png" }] },
				],
			}) as never,
		)

		const tree = attachmentsWithParentIdOnly()
		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
			projectId: undefined,
		})

		expect(result.failures).toEqual([])
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
		expect(vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0].content).toContain(
			'"src": "./images/a.png"',
		)
	})

	it("does not rewrite an ambiguous bare resource path", async () => {
		const tree = [
			...attachments(),
			{
				file_id: "other-image",
				file_name: "a.png",
				relative_file_path: "images/a.png",
			},
		] as any
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "images/a.png" }] }],
			}) as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.hasFailures).toBe(true)
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("does not use a resource whose path disagrees with its parent_id chain", async () => {
		const tree = attachments()
		const inconsistentImage = tree.find((item: any) => item.file_id === "image")!
		inconsistentImage.relative_file_path = "Other/images/a.png"
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.hasFailures).toBe(true)
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("does not change name when moving a canvas root", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", { elements: [] }) as never,
		)

		const tree = attachments()
		await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
			rename: { oldName: "Canvas", newName: "Moved" },
		})

		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("repairs image, video and audio fields in a v1 canvas", async () => {
		const tree = mediaAttachments()
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [
					{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] },
					{
						type: "video",
						contents: [
							{
								src: "/Canvas/videos/v.mp4",
								generateVideoRequest: {
									file_dir: "/Canvas/videos",
									inputs: {
										frames: [{ uri: "/Canvas/images/a.png" }],
										audio: { uri: "/Canvas/audios/a.mp3" },
									},
								},
							},
						],
					},
					{ type: "audio", contents: [{ src: "/Canvas/audios/a.mp3" }] },
				],
			}) as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.failures).toEqual([])
		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0]
		expect(saved.content).toContain('"src": "./videos/v.mp4"')
		expect(saved.content).toContain('"file_dir": "./videos"')
		expect(saved.content).toContain('"uri": "./images/a.png"')
		expect(saved.content).toContain('"uri": "./audios/a.mp3"')
	})

	it("does not update the canvas name when an ancestor directory is renamed", async () => {
		const tree = [
			{
				file_id: "parent",
				file_name: "Parent",
				name: "Parent",
				is_directory: true,
				relative_file_path: "Parent",
			},
			{
				file_id: "root",
				file_name: "Canvas",
				name: "Canvas",
				parent_id: "parent",
				is_directory: true,
				relative_file_path: "Parent/Canvas",
			},
			{
				file_id: "main",
				file_name: "magic.project.js",
				parent_id: "root",
				relative_file_path: "Parent/Canvas/magic.project.js",
			},
			{
				file_id: "images",
				file_name: "images",
				parent_id: "root",
				is_directory: true,
				relative_file_path: "Parent/Canvas/images",
			},
			{
				file_id: "image",
				file_name: "a.png",
				parent_id: "images",
				relative_file_path: "Parent/Canvas/images/a.png",
			},
		] as any
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Parent/Canvas/images/a.png" }] }],
			}) as never,
		)

		await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "rename",
			rename: { oldName: "Parent", newName: "Renamed Parent" },
		})

		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0]
		expect(saved.content).not.toContain('"name": "Renamed Parent"')
		expect(saved.content).toContain('"src": "./images/a.png"')
	})

	it("reports a sidecar read failure without blocking other saves", async () => {
		const tree = [
			...attachments(),
			{
				file_id: "user-details",
				file_name: "element-details-user.json",
				parent_id: "root",
				relative_file_path: "Canvas/element-details-user.json",
			},
		] as any
		vi.mocked(getFileContentById).mockImplementation(async (fileId: string) => {
			if (fileId === "main")
				return projectContent("2.0.0", {
					elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
				}) as never
			throw new Error("sidecar read failed")
		})

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.hasFailures).toBe(true)
		expect(result.failures[0].message).toBe("sidecar read failed")
		expect(result.repairedFileIds).toEqual(["main"])
	})

	it("reports a corrupted v2 main file without saving anything", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			"window.magicProjectConfig = { version: '2.0.0', canvas: 'broken' }" as never,
		)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "move",
		})

		expect(result.hasFailures).toBe(true)
		expect(result.requiresConfirmation).toBe(true)
		expect(result.failures[0]).toMatchObject({
			fileName: "magic.project.js",
			message: "invalid-canvas-data",
		})
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})

	it("reports a corrupted v2 sidecar while preserving successful main saves", async () => {
		const tree = [
			...attachments(),
			{
				file_id: "agent-details",
				file_name: "element-details.json",
				parent_id: "root",
				relative_file_path: "Canvas/element-details.json",
			},
		] as any
		vi.mocked(getFileContentById).mockImplementation(async (fileId: string) => {
			if (fileId === "main")
				return projectContent("2.0.0", {
					elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
				}) as never
			throw new Error("invalid json")
		})

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.failures).toEqual([
			expect.objectContaining({ fileName: "element-details.json", message: "invalid json" }),
		])
		expect(result.repairedFileIds).toEqual(["main"])
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
	})

	it("reports save failures without claiming the file was repaired", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)
		vi.mocked(SuperMagicApi.saveFileContent).mockRejectedValue(new Error("save failed"))

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "move",
		})

		expect(result.repairedFileIds).toEqual([])
		expect(result.failures).toEqual([
			expect.objectContaining({ fileName: "magic.project.js", message: "save failed" }),
		])
		expect(result.requiresConfirmation).toBe(true)
	})

	it("reports business save failures returned in a fulfilled response", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({
			batch_id: "batch-1",
			total: 1,
			success: 0,
			error: 1,
			success_files: [],
			error_files: [
				{
					index: 0,
					file_id: "main",
					status: "error",
					error: "permission denied",
					error_code: 403,
					duration_ms: 1,
				},
			],
		} as never)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "move",
		})

		expect(result.repairedFileIds).toEqual([])
		expect(result.failures).toEqual([
			expect.objectContaining({ fileName: "magic.project.js", message: "permission denied" }),
		])
		expect(result.requiresConfirmation).toBe(true)
	})

	it("reports a missing file entry in an otherwise fulfilled save response", async () => {
		vi.mocked(getFileContentById).mockResolvedValue(
			projectContent("1.0.0", {
				elements: [{ type: "image", contents: [{ src: "/Canvas/images/a.png" }] }],
			}) as never,
		)
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({
			batch_id: "batch-1",
			total: 1,
			success: 1,
			error: 0,
			success_files: [],
			error_files: [],
		} as never)

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: attachments(),
			items: [attachments()[0]],
			operation: "move",
		})

		expect(result.repairedFileIds).toEqual([])
		expect(result.failures).toEqual([
			expect.objectContaining({
				fileName: "magic.project.js",
				message: "save-result-missing",
			}),
		])
	})

	it("checks all affected projects before saving and keeps successful results on partial failure", async () => {
		const tree = [
			{
				file_id: "parent",
				file_name: "Parent",
				is_directory: true,
				relative_file_path: "Parent",
			},
			{
				file_id: "root-a",
				file_name: "Canvas A",
				parent_id: "parent",
				is_directory: true,
				relative_file_path: "Parent/Canvas A",
			},
			{
				file_id: "main-a",
				file_name: "magic.project.js",
				parent_id: "root-a",
				relative_file_path: "Parent/Canvas A/magic.project.js",
			},
			{
				file_id: "images-a",
				file_name: "images",
				parent_id: "root-a",
				is_directory: true,
				relative_file_path: "Parent/Canvas A/images",
			},
			{
				file_id: "image-a",
				file_name: "a.png",
				parent_id: "images-a",
				is_directory: false,
				relative_file_path: "Parent/Canvas A/images/a.png",
			},
			{
				file_id: "root-b",
				file_name: "Canvas B",
				parent_id: "parent",
				is_directory: true,
				relative_file_path: "Parent/Canvas B",
			},
			{
				file_id: "main-b",
				file_name: "magic.project.js",
				parent_id: "root-b",
				relative_file_path: "Parent/Canvas B/magic.project.js",
			},
		] as any
		const events: string[] = []
		vi.mocked(getFileContentById).mockImplementation(async (fileId: string) => {
			events.push(`read:${fileId}`)
			if (fileId === "main-a")
				return projectContent("1.0.0", {
					elements: [
						{ type: "image", contents: [{ src: "/Parent/Canvas A/images/a.png" }] },
					],
				}) as never
			return "not a project config" as never
		})
		vi.mocked(SuperMagicApi.saveFileContent).mockImplementation(async (payload) => {
			events.push(`save:${payload.map((file) => file.file_id).join(",")}`)
			return saveSuccessResponse(payload.map((file) => file.file_id)) as never
		})

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "move",
		})

		expect(result.affectedProjects).toHaveLength(2)
		expect(result.repairedFileIds).toEqual(["main-a"])
		expect(result.failures).toEqual([
			expect.objectContaining({ projectName: "Canvas B", fileName: "magic.project.js" }),
		])
		expect(events.findIndex((event) => event.startsWith("save:"))).toBeGreaterThan(
			events.indexOf("read:main-b"),
		)
	})

	it("updates a renamed canvas root name even when a sidecar needs confirmation", async () => {
		const tree = [
			...attachments(),
			{
				file_id: "agent-details",
				file_name: "element-details.json",
				parent_id: "root",
				relative_file_path: "Canvas/element-details.json",
			},
		] as any
		vi.mocked(getFileContentById).mockImplementation(async (fileId: string) => {
			if (fileId === "main") return projectContent("2.0.0", { elements: [] }) as never
			throw new Error("sidecar read failed")
		})

		const result = await repairCanvasProjectsBeforeFileOperation({
			attachments: tree,
			items: [tree[0]],
			operation: "rename",
			rename: { oldName: "Canvas", newName: "Renamed Canvas" },
		})

		expect(result.hasFailures).toBe(true)
		const saved = vi.mocked(SuperMagicApi.saveFileContent).mock.calls[0][0][0]
		expect(saved.content).toContain('"name": "Renamed Canvas"')
	})
})
