import { beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
	createFile: vi.fn(),
	batchSaveFiles: vi.fn(),
	getProjectAttachmentsV2Page: vi.fn(),
}))

const uploadTokenServiceMocks = vi.hoisted(() => ({
	getUploadToken: vi.fn(),
	changeDir: vi.fn(),
}))

vi.mock("@/opensource/utils/log", () => ({
	logger: {
		createLogger: () => ({
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
		}),
	},
}))

vi.mock("@/opensource/stores/projectFiles", () => ({
	default: {
		getFileNamesInFolder: vi.fn(() => []),
	},
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
		getFileNamesInFolder: vi.fn(() => []),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: apiMocks.createFile,
		batchSaveFiles: apiMocks.batchSaveFiles,
		getProjectAttachmentsV2Page: apiMocks.getProjectAttachmentsV2Page,
	},
	FileApi: {
		reportFileUploads: vi.fn(),
	},
}))

vi.mock("../../../services/UploadService", () => ({
	UploadService: class {
		upload() {
			return Promise.resolve({ rejected: [] })
		}
	},
}))

vi.mock("../../../services/UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadToken: uploadTokenServiceMocks.getUploadToken,
		changeDir: uploadTokenServiceMocks.changeDir,
		getUploadTokenUrl: "/mock-upload-token",
	},
}))

import { FileUploadStore } from "../index"
import type { FileData } from "../../../types"
import { MentionItemType } from "@/components/business/MentionPanel/types"

function createMockFileData(id: string): FileData {
	return {
		id,
		name: `${id}.txt`,
		file: new File(["test"], `${id}.txt`, { type: "text/plain" }),
		status: "done",
		cancel: vi.fn(),
	}
}

describe("FileUploadStore", () => {
	let store: FileUploadStore
	let onFileRemoved: ReturnType<typeof vi.fn>
	let onFileUpload: ReturnType<typeof vi.fn>
	let onChange: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
		apiMocks.getProjectAttachmentsV2Page.mockResolvedValue({
			list: [],
			next_parent_ids: null,
			has_more: false,
		})
		uploadTokenServiceMocks.getUploadToken.mockResolvedValue(undefined)
		uploadTokenServiceMocks.changeDir.mockImplementation((credentials, suffixDir) => ({
			...credentials,
			temporary_credential: {
				...credentials.temporary_credential,
				dir: `${credentials.temporary_credential.dir}/${suffixDir}/`,
			},
		}))
		onFileRemoved = vi.fn()
		onFileUpload = vi.fn()
		onChange = vi.fn()
		store = new FileUploadStore({
			onFileRemoved,
			onFileUpload,
			onChange,
		})
	})

	describe("clearFiles", () => {
		it("should remove files and trigger removal callbacks", () => {
			store.files = [createMockFileData("file-1"), createMockFileData("file-2")]

			store.clearFiles()

			expect(store.files).toEqual([])
			expect(onFileRemoved).toHaveBeenCalledTimes(2)
			expect(onFileRemoved).toHaveBeenNthCalledWith(1, "file-1")
			expect(onFileRemoved).toHaveBeenNthCalledWith(2, "file-2")
			expect(onFileUpload).toHaveBeenLastCalledWith([])
			expect(onChange).toHaveBeenLastCalledWith([])
		})
	})

	describe("clearFilesLocalOnly", () => {
		it("should clear local files without triggering removal callbacks", () => {
			const firstFile = createMockFileData("file-1")
			const secondFile = createMockFileData("file-2")
			store.files = [firstFile, secondFile]

			store.clearFilesLocalOnly()

			expect(store.files).toEqual([])
			expect(firstFile.cancel).toHaveBeenCalledTimes(1)
			expect(secondFile.cancel).toHaveBeenCalledTimes(1)
			expect(onFileRemoved).not.toHaveBeenCalled()
			expect(onFileUpload).toHaveBeenLastCalledWith([])
			expect(onChange).toHaveBeenLastCalledWith([])
		})
	})

	describe("removeUploadedFile", () => {
		it("should remove file by saved project file id", () => {
			store.files = [
				{
					...createMockFileData("local-file-1"),
					saveResult: {
						file_id: "project-file-1",
					} as FileData["saveResult"],
				},
				createMockFileData("local-file-2"),
			]

			store.removeUploadedFile("project-file-1")

			expect(store.files).toHaveLength(1)
			expect(store.files[0].id).toBe("local-file-2")
		})

		it("should clear current session project file tracking", () => {
			store.files = [
				{
					...createMockFileData("local-file-1"),
					saveResult: {
						file_id: "project-file-1",
					} as FileData["saveResult"],
				},
			]
			const internalStore = store as unknown as Record<string, Set<string>>
			internalStore.sessionSavedProjectFileIds.add("project-file-1")
			internalStore.sessionUploadFileIds.add("local-file-1")

			store.removeUploadedFile("project-file-1")

			expect(store.isCurrentSessionProjectFile("project-file-1")).toBe(false)
			expect(store.isCurrentSessionUploadFile("local-file-1")).toBe(false)
		})
	})

	describe("current session tracking", () => {
		it("should track files added in current session", async () => {
			const file = new File(["hello"], "hello.txt", { type: "text/plain" })

			const addedFiles = await store.addFiles([file])

			expect(addedFiles).toHaveLength(1)
			expect(store.isCurrentSessionUploadFile(addedFiles?.[0].id || "")).toBe(true)
		})

		it("should retain hidden temp metadata before a project exists", async () => {
			const file = new File(["image"], "photo.png", { type: "image/png" })
			const addedFiles = await store.addFiles([file], undefined, { useTempDirectory: true })

			expect(addedFiles?.[0]).toMatchObject({
				defaultRelativePath: ".tmp/photo.png",
				isHidden: true,
			})
		})

		it("should create and use hidden temp directory for pasted text files", async () => {
			apiMocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
			uploadTokenServiceMocks.getUploadToken.mockResolvedValue({
				temporary_credential: { dir: "project/workspace" },
			})
			const projectFilesStore = {
				workspaceFilesList: [],
				getFileNamesInFolder: vi.fn(() => []),
			}
			store = new FileUploadStore({
				projectId: "project-1",
				projectFilesStore: projectFilesStore as any,
			})

			const file = new File(["long text"], "pasted.txt", { type: "text/plain" })
			const addedFiles = await store.addFiles([file], undefined, {
				usePastedTextTempDirectory: true,
			})

			expect(apiMocks.createFile).toHaveBeenCalledWith({
				project_id: "project-1",
				file_name: ".tmp",
				is_directory: true,
				ignore_duplicate: true,
			})
			expect(uploadTokenServiceMocks.getUploadToken).toHaveBeenCalledWith(
				"project-1",
				"tmp-dir-id",
			)
			expect(uploadTokenServiceMocks.changeDir).toHaveBeenCalledWith(
				expect.objectContaining({ temporary_credential: { dir: "project/workspace" } }),
				".tmp",
			)
			expect(apiMocks.getProjectAttachmentsV2Page).toHaveBeenCalledWith({
				projectId: "project-1",
				parentId: "tmp-dir-id",
				nextParentIds: undefined,
				pageSize: 1000,
				fileType: ["user_upload", "process", "system_auto_upload", "directory"],
			})
			expect(addedFiles?.[0]).toMatchObject({
				name: "pasted.txt",
				parentId: "tmp-dir-id",
				defaultRelativePath: ".tmp/pasted.txt",
				isHidden: true,
			})
		})

		it("should keep repeated temp uploads and increment duplicate image names", async () => {
			apiMocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
			uploadTokenServiceMocks.getUploadToken.mockResolvedValue({
				temporary_credential: { dir: "project/workspace" },
			})
			const projectFilesStore = {
				workspaceFilesList: [],
				getFileNamesInFolder: vi.fn(() => []),
			}
			store = new FileUploadStore({
				projectId: "project-1",
				projectFilesStore: projectFilesStore as any,
			})

			const first = new File(["image"], "photo.png", { type: "image/png", lastModified: 1 })
			const second = new File(["image"], "photo.png", { type: "image/png", lastModified: 1 })
			const firstUpload = await store.addFiles([first], undefined, {
				useTempDirectory: true,
			})
			const secondUpload = await store.addFiles([second], undefined, {
				useTempDirectory: true,
			})

			expect(firstUpload?.[0].name).toBe("photo.png")
			expect(secondUpload?.[0].name).toBe("photo (1).png")
			expect(store.files.every((file) => file.parentId === "tmp-dir-id")).toBe(true)
		})

		it("should increment names from direct temp files and ignore nested files", async () => {
			apiMocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
			uploadTokenServiceMocks.getUploadToken.mockResolvedValue({
				temporary_credential: { dir: "project/workspace" },
			})
			apiMocks.getProjectAttachmentsV2Page
				.mockResolvedValueOnce({ list: [], next_parent_ids: null, has_more: false })
				.mockResolvedValueOnce({
					list: [
						{
							type: "file",
							file_id: "topic-a-image",
							file_name: "image.png",
							parent_id: "tmp-dir-id",
							is_hidden: true,
						},
					],
					next_parent_ids: null,
					has_more: false,
				})
				.mockResolvedValueOnce({
					list: [
						{
							type: "file",
							file_id: "topic-a-image",
							file_name: "image.png",
							parent_id: "tmp-dir-id",
							is_hidden: true,
						},
						{
							type: "file",
							file_id: "topic-b-image",
							file_name: "image (1).png",
							parent_id: "tmp-dir-id",
							is_hidden: true,
						},
						{
							type: "file",
							file_id: "nested-image",
							file_name: "image (2).png",
							parent_id: "nested-directory-id",
							is_hidden: true,
						},
					],
					next_parent_ids: null,
					has_more: false,
				})
			const projectFilesStore = {
				workspaceFilesList: [],
				getFileNamesInFolder: vi.fn(() => []),
			}
			store = new FileUploadStore({
				projectId: "project-1",
				projectFilesStore: projectFilesStore as any,
			})

			await store.addFiles(
				[new File(["topic-a"], "image.png", { type: "image/png" })],
				undefined,
				{ useTempDirectory: true },
			)
			store.clearFilesLocalOnly()
			const topicBFiles = await store.addFiles(
				[new File(["topic-b"], "image.png", { type: "image/png" })],
				undefined,
				{ useTempDirectory: true },
			)

			expect(topicBFiles?.[0]).toMatchObject({
				name: "image (1).png",
				defaultRelativePath: ".tmp/image (1).png",
			})

			store.clearFilesLocalOnly()
			const topicCFiles = await store.addFiles(
				[new File(["topic-c"], "image.png", { type: "image/png" })],
				undefined,
				{ useTempDirectory: true },
			)

			expect(topicCFiles?.[0]).toMatchObject({
				name: "image (2).png",
				defaultRelativePath: ".tmp/image (2).png",
			})
		})

		it("should stop reading the temp directory after the page limit", async () => {
			apiMocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
			uploadTokenServiceMocks.getUploadToken.mockResolvedValue({
				temporary_credential: { dir: "project/workspace" },
			})
			let pageIndex = 0
			apiMocks.getProjectAttachmentsV2Page.mockImplementation(async () => {
				pageIndex += 1
				return {
					list: [],
					has_more: true,
					next_parent_ids: [
						{
							parent_id: "tmp-dir-id",
							after_sort: pageIndex,
							after_file_id: `file-${pageIndex}`,
						},
					],
				}
			})
			store = new FileUploadStore({
				projectId: "project-1",
				projectFilesStore: {
					workspaceFilesList: [],
					getFileNamesInFolder: vi.fn(() => []),
				} as any,
			})

			await expect(
				store.addFiles(
					[new File(["image"], "image.png", { type: "image/png" })],
					undefined,
					{ useTempDirectory: true },
				),
			).rejects.toThrow("temp directory attachment pages exceeded limit")
			expect(apiMocks.getProjectAttachmentsV2Page).toHaveBeenCalledTimes(100)
		})

		it("should mark pasted pending project file as virtual reference", () => {
			store.addPendingProjectFileReferences([
				{
					type: MentionItemType.PROJECT_FILE,
					data: {
						file_id: "source-file-1",
						file_name: "source.md",
						file_path: "/source.md",
						file_extension: "md",
						file_size: 10,
						source_project_id: "source-project",
						source_file_id: "source-file-1",
						pending_project_copy: true,
					},
				},
			])

			expect(store.files).toHaveLength(1)
			expect(store.files[0]).toMatchObject({
				id: "source-file-1",
				name: "source.md",
				status: "done",
				isVirtualReference: true,
			})
		})

		it("should mark pasted pending project directory as virtual reference", () => {
			store.addPendingProjectFileReferences([
				{
					type: MentionItemType.FOLDER,
					data: {
						directory_id: "source-directory-1",
						directory_name: "docs",
						directory_path: "/docs",
						source_project_id: "source-project",
						source_directory_id: "source-directory-1",
						pending_project_copy: true,
					},
				},
			])

			expect(store.files).toHaveLength(1)
			expect(store.files[0]).toMatchObject({
				id: "source-directory-1",
				name: "docs",
				status: "done",
				isVirtualReference: true,
				saveResult: {
					file_id: "source-directory-1",
					file_key: "/docs",
					file_name: "docs",
					file_type: "directory",
				},
			})
		})
	})

	describe("getUploadMentionItems", () => {
		it("should return uploaded files with valid file paths", () => {
			store.files = [
				{
					...createMockFileData("local-file-1"),
					progress: 100,
					reportResult: {
						file_id: "uploaded-file-1",
						file_name: "uploaded.txt",
						file_key: "uploads/uploaded.txt",
						file_size: 4,
					} as FileData["reportResult"],
				},
				createMockFileData("local-file-2"),
			]

			expect(store.getUploadMentionItems()).toEqual([
				expect.objectContaining({
					id: "uploaded-file-1",
					type: "upload_file",
					name: "uploaded.txt",
					extension: "txt",
					data: expect.objectContaining({
						file_id: "uploaded-file-1",
						file_name: "uploaded.txt",
						file_path: "uploads/uploaded.txt",
						file_extension: "txt",
					}),
				}),
			])
		})
	})
})
