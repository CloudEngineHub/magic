import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SelfMediaInitData } from "../components/SelfMediaInitPanel/types"

const {
	mockCreateFile,
	mockSaveFileContent,
	mockGetAttachmentsByProjectId,
	mockDeleteFile,
	mockMoveFile,
	mockGetFileContentById,
} = vi.hoisted(() => ({
	mockCreateFile: vi.fn(),
	mockSaveFileContent: vi.fn(),
	mockGetAttachmentsByProjectId: vi.fn(),
	mockDeleteFile: vi.fn(),
	mockMoveFile: vi.fn(),
	mockGetFileContentById: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: mockCreateFile,
		saveFileContent: mockSaveFileContent,
		getAttachmentsByProjectId: mockGetAttachmentsByProjectId,
		deleteFile: mockDeleteFile,
		moveFile: mockMoveFile,
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: mockGetFileContentById,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadToken: vi.fn(),
		changeDir: vi.fn(),
		saveFileToProject: vi.fn(),
	},
}))

vi.mock("@dtyq/upload-sdk", () => ({
	Upload: vi.fn(),
}))

import { SelfMediaFileStorageService } from "../services/SelfMediaFileStorageService"

type AttachmentNode = {
	file_id: string
	file_name: string
	is_directory: boolean
	parent_id?: string | null
	relative_file_path: string
}

describe("SelfMediaFileStorageService", () => {
	const attachments: AttachmentNode[] = []
	const contentByFileId = new Map<string, string>()
	let nextId = 1

	function seedNode(node: AttachmentNode) {
		attachments.push(node)
	}

	function resolveParentPath(parentId?: string | null): string {
		if (!parentId) return ""
		return attachments.find((item) => item.file_id === parentId)?.relative_file_path || ""
	}

	function createFileNode(params: {
		parent_id?: string
		file_name: string
		is_directory: boolean
	}) {
		const file_id = `file-${nextId++}`
		const parentPath = resolveParentPath(params.parent_id)
		const relative_file_path = [parentPath, params.file_name].filter(Boolean).join("/")
		const node: AttachmentNode = {
			file_id,
			file_name: params.file_name,
			is_directory: params.is_directory,
			parent_id: params.parent_id,
			relative_file_path: params.is_directory ? relative_file_path : relative_file_path,
		}
		seedNode(node)
		return { file_id }
	}

	const data: SelfMediaInitData = {
		global: {
			author: "Magic Lab",
			brandPosition: "AI productivity",
			targetAudience: "Creators",
			brandImages: [
				{
					id: "brand-1",
					file: new File([], "brand.png", { type: "image/png" }),
					previewUrl: "",
					description: "brand mascot",
					isImage: true,
					uploadedPath: "self-media/__drafts/brand-images/brand.png",
				},
			],
		},
		articles: [
			{
				title: "Post A",
				folderName: "post-a",
				style: "professional",
				visualPreset: "custom",
				cardCount: 6,
				outline: [
					{
						id: "node-1",
						text: "Intro",
						materials: [
							{
								id: "outline-1",
								file: new File([], "outline.pdf", { type: "application/pdf" }),
								previewUrl: "",
								description: "outline proof",
								uploadedPath: "self-media/__drafts/draft-materials/0/outline.pdf",
							},
						],
						children: [],
					},
				],
				materials: [
					{
						id: "material-1",
						file: new File([], "article.png", { type: "image/png" }),
						previewUrl: "",
						description: "article figure",
						uploadedPath: "self-media/__drafts/draft-materials/0/article.png",
					},
				],
				notes: "Use real cases",
				platform: "rednote",
				description: "A comparison post",
				visualReferenceFiles: [
					{
						name: "visual-guide.pdf",
						content: "guide content",
						kind: "text",
						file_path: "shared/visual-guide.pdf",
						file_id: "visual-file-1",
					},
					{
						name: "moodboard.txt",
						content: "warm minimal style",
						kind: "text",
					},
				],
			},
		],
	}

	beforeEach(() => {
		attachments.length = 0
		contentByFileId.clear()
		nextId = 1
		mockCreateFile.mockReset()
		mockSaveFileContent.mockReset()
		mockGetAttachmentsByProjectId.mockReset()
		mockDeleteFile.mockReset()
		mockMoveFile.mockReset()
		mockGetFileContentById.mockReset()

		seedNode({
			file_id: "self-media-root",
			file_name: "self-media",
			is_directory: true,
			parent_id: null,
			relative_file_path: "self-media",
		})

		mockCreateFile.mockImplementation(async (params: any) => createFileNode(params))
		mockSaveFileContent.mockImplementation(
			async (entries: Array<{ file_id: string; content: string }>) => {
				entries.forEach((entry) => contentByFileId.set(entry.file_id, entry.content))
				return {}
			},
		)
		mockGetAttachmentsByProjectId.mockImplementation(async () => ({ list: attachments }))
		mockDeleteFile.mockResolvedValue({})
		mockMoveFile.mockResolvedValue({ status: "success" })
		mockGetFileContentById.mockImplementation(
			async (fileId: string) => contentByFileId.get(fileId) || "",
		)
	})

	it("writes a unified reference index when saving draft", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(data, 3)

		const referenceIndexFile = attachments.find(
			(item) => item.relative_file_path === "self-media/__drafts/reference-index.json",
		)
		expect(referenceIndexFile?.file_id).toBeTruthy()

		const referenceIndexContent = JSON.parse(
			contentByFileId.get(referenceIndexFile!.file_id) || "{}",
		)
		expect(referenceIndexContent.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					role: "article-material",
					relativePath: "self-media/__drafts/draft-materials/0/article.png",
				}),
				expect.objectContaining({
					role: "outline-material",
					outlineNodeId: "node-1",
					relativePath: "self-media/__drafts/draft-materials/0/outline.pdf",
				}),
				expect.objectContaining({
					role: "visual-reference",
					file_path: "shared/visual-guide.pdf",
				}),
				expect.objectContaining({
					role: "visual-reference",
					content: "warm minimal style",
				}),
			]),
		)
	})

	it("saves and loads project-level brand config outside draft data", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveBrandConfig(data.global)

		const brandConfigFile = attachments.find(
			(item) => item.relative_file_path === "self-media/__brand/brand-config.json",
		)
		expect(brandConfigFile?.file_id).toBeTruthy()

		const savedContent = JSON.parse(contentByFileId.get(brandConfigFile!.file_id) || "{}")
		expect(savedContent).toEqual(
			expect.objectContaining({
				version: 1,
				author: "Magic Lab",
				brandPosition: "AI productivity",
				targetAudience: "Creators",
				brandImages: [
					expect.objectContaining({
						id: "brand-1",
						name: "brand.png",
						description: "brand mascot",
						relativePath: "self-media/__drafts/brand-images/brand.png",
						isImage: true,
					}),
				],
			}),
		)

		await expect(service.loadBrandConfig()).resolves.toEqual(
			expect.objectContaining({
				author: "Magic Lab",
				brandPosition: "AI productivity",
				targetAudience: "Creators",
				brandImages: [
					expect.objectContaining({
						id: "brand-1",
						description: "brand mascot",
						uploadedPath: "self-media/__drafts/brand-images/brand.png",
					}),
				],
			}),
		)
	})

	it("does not persist brand config in new draft payloads", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(data, 3)

		const draftFile = attachments.find(
			(item) => item.relative_file_path === "self-media/__drafts/draft.json",
		)
		const draftContent = JSON.parse(contentByFileId.get(draftFile!.file_id) || "{}")

		expect(draftContent.global).toBeUndefined()
		expect(draftContent.articles).toHaveLength(1)
	})

	it("archives the active draft and clears only the active slot", async () => {
		seedNode({
			file_id: "draft-json",
			file_name: "draft.json",
			is_directory: false,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/draft.json",
		})
		seedNode({
			file_id: "draft-md",
			file_name: "draft.md",
			is_directory: false,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/draft.md",
		})
		seedNode({
			file_id: "reference-index",
			file_name: "reference-index.json",
			is_directory: false,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/reference-index.json",
		})
		seedNode({
			file_id: "draft-materials-dir",
			file_name: "draft-materials",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/draft-materials",
		})

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.archiveDraft(data, 3)

		const archiveManifest = attachments.find(
			(item) =>
				item.relative_file_path.startsWith("self-media/__drafts/archive/") &&
				item.relative_file_path.endsWith("/manifest.json"),
		)
		const archiveDraft = attachments.find(
			(item) =>
				item.relative_file_path.startsWith("self-media/__drafts/archive/") &&
				item.relative_file_path.endsWith("/draft.json"),
		)

		expect(archiveManifest?.file_id).toBeTruthy()
		expect(archiveDraft?.file_id).toBeTruthy()
		expect(mockDeleteFile).toHaveBeenCalledWith("draft-json")
		expect(mockDeleteFile).toHaveBeenCalledWith("draft-md")
		expect(mockDeleteFile).toHaveBeenCalledWith("reference-index")
		expect(mockMoveFile).toHaveBeenCalledWith(
			expect.objectContaining({
				file_id: "draft-materials-dir",
			}),
		)

		const manifestContent = JSON.parse(contentByFileId.get(archiveManifest!.file_id) || "{}")
		const archivedDraftContent = JSON.parse(contentByFileId.get(archiveDraft!.file_id) || "{}")
		const archivedReferenceIndexFile = attachments.find(
			(item) =>
				item.relative_file_path.startsWith("self-media/__drafts/archive/") &&
				item.relative_file_path.endsWith("/reference-index.json"),
		)
		const archivedReferenceIndex = JSON.parse(
			contentByFileId.get(archivedReferenceIndexFile!.file_id) || "{}",
		)

		expect(manifestContent).toEqual(
			expect.objectContaining({
				currentStep: 3,
				articleCount: 1,
			}),
		)
		expect(archivedDraftContent.articles[0].materials[0].relativePath).toContain("/archive/")
		expect(archivedDraftContent.articles[0].outline[0].materials[0].relativePath).toContain(
			"/archive/",
		)
		expect(archivedReferenceIndex.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					role: "article-material",
					relativePath: expect.stringContaining("/archive/"),
				}),
				expect.objectContaining({
					role: "outline-material",
					relativePath: expect.stringContaining("/archive/"),
				}),
			]),
		)
	})

	it("fails archiving when a critical archive file cannot be written", async () => {
		seedNode({
			file_id: "draft-materials-dir",
			file_name: "draft-materials",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/draft-materials",
		})

		let writeCount = 0
		mockSaveFileContent.mockImplementation(
			async (entries: Array<{ file_id: string; content: string }>) => {
				writeCount += 1
				if (writeCount === 4) {
					throw new Error("reference index write failed")
				}
				entries.forEach((entry) => contentByFileId.set(entry.file_id, entry.content))
				return {}
			},
		)

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await expect(service.archiveDraft(data, 3)).resolves.toBeNull()
		expect(mockDeleteFile).not.toHaveBeenCalled()
	})

	it("fails archiving when moving draft materials fails", async () => {
		seedNode({
			file_id: "draft-materials-dir",
			file_name: "draft-materials",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/draft-materials",
		})
		mockMoveFile.mockRejectedValue(new Error("move failed"))

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await expect(service.archiveDraft(data, 3)).resolves.toBeNull()
		expect(mockDeleteFile).not.toHaveBeenCalled()
	})

	it("keeps draft files under __drafts when directory lookup is stale", async () => {
		seedNode({
			file_id: "drafts-dir",
			file_name: "__drafts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/__drafts",
		})

		let attachmentReadCount = 0
		mockGetAttachmentsByProjectId.mockImplementation(async () => {
			attachmentReadCount += 1
			if (attachmentReadCount === 1) {
				return {
					list: attachments.filter((item) => item.file_id !== "drafts-dir"),
				}
			}
			return { list: attachments }
		})

		mockCreateFile.mockImplementation(async (params: any) => {
			if (params.is_directory && params.file_name === "__drafts") {
				return {}
			}
			return createFileNode(params)
		})

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(data, 1)

		expect(
			attachments.some((item) => item.relative_file_path === "self-media/draft.json"),
		).toBe(false)
		expect(
			attachments.some(
				(item) => item.relative_file_path === "self-media/__drafts/draft.json",
			),
		).toBe(true)
	})

	it("does not backfill brand images into draft json when memory data is empty", async () => {
		seedNode({
			file_id: "brand-images-dir",
			file_name: "brand-images",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/brand-images",
		})
		seedNode({
			file_id: "brand-image-1",
			file_name: "logo.png",
			is_directory: false,
			parent_id: "brand-images-dir",
			relative_file_path: "self-media/__drafts/brand-images/logo.png",
		})
		seedNode({
			file_id: "brand-image-2",
			file_name: "manual.pdf",
			is_directory: false,
			parent_id: "brand-images-dir",
			relative_file_path: "self-media/__drafts/brand-images/manual.pdf",
		})

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(
			{
				...data,
				global: {
					...data.global,
					brandImages: [],
				},
			},
			2,
		)

		const draftFile = attachments.find(
			(item) => item.relative_file_path === "self-media/__drafts/draft.json",
		)
		const draftContent = JSON.parse(contentByFileId.get(draftFile!.file_id) || "{}")

		expect(draftContent.global).toBeUndefined()
	})

	it("keeps brand images out of draft json when memory data has brand images", async () => {
		seedNode({
			file_id: "brand-images-dir",
			file_name: "brand-images",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/brand-images",
		})
		seedNode({
			file_id: "brand-image-1",
			file_name: "logo.png",
			is_directory: false,
			parent_id: "brand-images-dir",
			relative_file_path: "self-media/__drafts/brand-images/logo.png",
		})

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(data, 2)

		const draftFile = attachments.find(
			(item) => item.relative_file_path === "self-media/__drafts/draft.json",
		)
		const draftContent = JSON.parse(contentByFileId.get(draftFile!.file_id) || "{}")

		expect(draftContent.global).toBeUndefined()
	})

	it("does not backfill brand images when saving template", async () => {
		seedNode({
			file_id: "brand-images-dir",
			file_name: "brand-images",
			is_directory: true,
			parent_id: "file-1",
			relative_file_path: "self-media/__drafts/brand-images",
		})
		seedNode({
			file_id: "brand-image-1",
			file_name: "logo.png",
			is_directory: false,
			parent_id: "brand-images-dir",
			relative_file_path: "self-media/__drafts/brand-images/logo.png",
		})

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		const templateId = await service.saveTemplate(
			{
				...data,
				global: {
					...data.global,
					brandImages: [],
				},
			},
			"Template A",
		)

		const templateFile = attachments.find(
			(item) =>
				item.relative_file_path === `self-media/__drafts/templates/${templateId}.json`,
		)
		const templateContent = JSON.parse(contentByFileId.get(templateFile!.file_id) || "{}")

		expect(templateContent.global.brandImages).toEqual([])
	})
})
