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

	const emptyShellDraftData: SelfMediaInitData = {
		global: {
			author: "Magic Lab",
			brandPosition: "AI productivity",
			targetAudience: "Creators",
			brandImages: [],
		},
		articles: [
			{
				title: "",
				folderName: "",
				style: "professional",
				cardCount: 6,
				outline: Array.from({ length: 6 }).map((_, index) => ({
					id: `empty-node-${index + 1}`,
					text: "",
					children: [],
				})),
				materials: [],
				notes: "",
				platform: "rednote",
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

	it("rejects when project-level brand config cannot be written", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)
		mockSaveFileContent.mockRejectedValueOnce(new Error("write failed"))

		await expect(service.saveBrandConfig(data.global)).rejects.toThrow(
			"Failed to save brand config",
		)
	})

	it("rejects when a pending project-level brand image cannot be uploaded", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)
		const uploadSpy = vi
			.spyOn(service, "uploadBrandImageToBrandConfig")
			.mockResolvedValueOnce(null)

		await expect(
			service.saveBrandConfig({
				...data.global,
				brandImages: [
					{
						id: "pending-brand",
						file: new File(["image"], "pending.png", { type: "image/png" }),
						previewUrl: "",
						description: "",
						isImage: true,
					},
				],
			}),
		).rejects.toThrow("Failed to upload brand image")
		expect(uploadSpy).toHaveBeenCalled()
	})

	it("saves and loads post ops metrics as a file-backed operations record", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.savePostOpsMetrics("posts/post-1/post.json", {
			version: 1,
			updatedAt: "2026-06-11T08:00:00.000Z",
			source: "user",
			metrics: {
				likes: "1.2w",
				comments: "128",
				reads: "3.4w",
			},
			notes: "First real platform snapshot",
		})

		const metricsFile = attachments.find(
			(item) => item.relative_file_path === "self-media/posts/post-1/ops/metrics.json",
		)
		expect(metricsFile?.file_id).toBeTruthy()
		if (!metricsFile?.file_id) throw new Error("metrics.json was not created")

		expect(JSON.parse(contentByFileId.get(metricsFile.file_id) || "{}")).toEqual(
			expect.objectContaining({
				version: 1,
				source: "user",
				metrics: {
					likes: "1.2w",
					comments: "128",
					reads: "3.4w",
				},
				notes: "First real platform snapshot",
			}),
		)

		await expect(service.loadPostOpsMetrics("posts/post-1/post.json")).resolves.toEqual(
			expect.objectContaining({
				source: "user",
				metrics: {
					likes: "1.2w",
					comments: "128",
					reads: "3.4w",
				},
			}),
		)
	})

	it("updates the current post title in post.json while preserving manifest content", async () => {
		seedNode({
			file_id: "posts-dir",
			file_name: "posts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/posts",
		})
		seedNode({
			file_id: "post-1-dir",
			file_name: "post-1",
			is_directory: true,
			parent_id: "posts-dir",
			relative_file_path: "self-media/posts/post-1",
		})
		seedNode({
			file_id: "post-1-json",
			file_name: "post.json",
			is_directory: false,
			parent_id: "post-1-dir",
			relative_file_path: "self-media/posts/post-1/post.json",
		})
		contentByFileId.set(
			"post-1-json",
			JSON.stringify({
				id: "post-1",
				meta: {
					title: "Old title",
					subtitle: "Keep me",
				},
				cards: ["cards/01.html"],
			}),
		)
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.updatePostTitle("posts/post-1/post.json", "New title")

		expect(JSON.parse(contentByFileId.get("post-1-json") || "{}")).toEqual({
			id: "post-1",
			meta: {
				title: "New title",
				subtitle: "Keep me",
			},
			cards: ["cards/01.html"],
		})
	})

	it("renames a home post in both post.json and magic.project.js", async () => {
		seedNode({
			file_id: "magic-project-js",
			file_name: "magic.project.js",
			is_directory: false,
			parent_id: "self-media-root",
			relative_file_path: "self-media/magic.project.js",
		})
		seedNode({
			file_id: "posts-dir",
			file_name: "posts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/posts",
		})
		seedNode({
			file_id: "post-1-dir",
			file_name: "post-1",
			is_directory: true,
			parent_id: "posts-dir",
			relative_file_path: "self-media/posts/post-1",
		})
		seedNode({
			file_id: "post-1-json",
			file_name: "post.json",
			is_directory: false,
			parent_id: "post-1-dir",
			relative_file_path: "self-media/posts/post-1/post.json",
		})
		contentByFileId.set(
			"magic-project-js",
			`window.magicProjectConfig = {
  "self-media": {
    "rednote": {
      "posts": [
        { "id": "post-1", "name": "Old Name", "entry": "posts/post-1/post.json" }
      ]
    }
  }
};
window.magicProjectConfigure(window.magicProjectConfig);`,
		)
		contentByFileId.set(
			"post-1-json",
			JSON.stringify({
				id: "post-1",
				meta: {
					title: "Old title",
					subtitle: "Keep me",
				},
				cards: ["cards/01.html"],
			}),
		)
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.renamePost({
			platform: "rednote",
			id: "post-1",
			entry: "posts/post-1/post.json",
			name: "New Name",
		})

		expect(JSON.parse(contentByFileId.get("post-1-json") || "{}").meta.title).toBe("New Name")
		expect(contentByFileId.get("magic-project-js")).toContain('"name": "New Name"')
	})

	it("renames a home post when the index entry already stores a project-relative path", async () => {
		seedNode({
			file_id: "magic-project-js",
			file_name: "magic.project.js",
			is_directory: false,
			parent_id: "self-media-root",
			relative_file_path: "self-media/magic.project.js",
		})
		seedNode({
			file_id: "posts-dir",
			file_name: "posts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/posts",
		})
		seedNode({
			file_id: "post-1-dir",
			file_name: "post-1",
			is_directory: true,
			parent_id: "posts-dir",
			relative_file_path: "self-media/posts/post-1",
		})
		seedNode({
			file_id: "post-1-json",
			file_name: "post.json",
			is_directory: false,
			parent_id: "post-1-dir",
			relative_file_path: "self-media/posts/post-1/post.json",
		})
		contentByFileId.set(
			"magic-project-js",
			`window.magicProjectConfig = {
  "self-media": {
    "rednote": {
      "posts": [
        { "id": "post-1", "name": "Old Name", "entry": "self-media/posts/post-1/post.json" }
      ]
    }
  }
};
window.magicProjectConfigure(window.magicProjectConfig);`,
		)
		contentByFileId.set(
			"post-1-json",
			JSON.stringify({
				id: "post-1",
				meta: {
					title: "Old title",
				},
			}),
		)
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.renamePost({
			platform: "rednote",
			id: "post-1",
			entry: "self-media/posts/post-1/post.json",
			name: "New Name",
		})

		expect(JSON.parse(contentByFileId.get("post-1-json") || "{}").meta.title).toBe("New Name")
		expect(contentByFileId.get("magic-project-js")).toContain('"name": "New Name"')
	})

	it("deletes a post directory and removes the post from magic.project.js", async () => {
		seedNode({
			file_id: "magic-project-js",
			file_name: "magic.project.js",
			is_directory: false,
			parent_id: "self-media-root",
			relative_file_path: "self-media/magic.project.js",
		})
		seedNode({
			file_id: "posts-dir",
			file_name: "posts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/posts",
		})
		seedNode({
			file_id: "delete-me-dir",
			file_name: "delete-me",
			is_directory: true,
			parent_id: "posts-dir",
			relative_file_path: "self-media/posts/delete-me",
		})
		seedNode({
			file_id: "delete-me-json",
			file_name: "post.json",
			is_directory: false,
			parent_id: "delete-me-dir",
			relative_file_path: "self-media/posts/delete-me/post.json",
		})
		contentByFileId.set(
			"magic-project-js",
			`window.magicProjectConfig = {
  "self-media": {
    "rednote": {
      "posts": [
        { "id": "keep", "name": "Keep", "entry": "posts/keep/post.json" },
        { "id": "delete-me", "name": "Delete Me", "entry": "posts/delete-me/post.json" }
      ]
    }
  }
};
window.magicProjectConfigure(window.magicProjectConfig);`,
		)
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.deletePost({
			platform: "rednote",
			id: "delete-me",
			entry: "posts/delete-me/post.json",
		})

		expect(mockDeleteFile).toHaveBeenCalledWith("delete-me-dir")
		expect(contentByFileId.get("magic-project-js")).toContain('"id": "keep"')
		expect(contentByFileId.get("magic-project-js")).not.toContain('"id": "delete-me"')
		expect(mockSaveFileContent).toHaveBeenCalledWith([
			expect.objectContaining({
				file_id: "magic-project-js",
				enable_shadow: true,
			}),
		])
	})

	it("saves and loads a bound published article source link", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.savePostOpsSource("posts/post-1/post.json", {
			version: 1,
			updatedAt: "2026-06-11T08:05:00.000Z",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			fetchStatus: "failed",
			lastFetchedAt: "2026-06-11T08:10:00.000Z",
			failureReason: "Login required",
		})

		const sourceFile = attachments.find(
			(item) => item.relative_file_path === "self-media/posts/post-1/ops/source.json",
		)
		expect(sourceFile?.file_id).toBeTruthy()
		if (!sourceFile?.file_id) throw new Error("source.json was not created")

		expect(JSON.parse(contentByFileId.get(sourceFile.file_id) || "{}")).toEqual(
			expect.objectContaining({
				platform: "rednote",
				publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
				fetchStatus: "failed",
				lastFetchedAt: "2026-06-11T08:10:00.000Z",
				failureReason: "Login required",
			}),
		)

		await expect(service.loadPostOpsSource("posts/post-1/post.json")).resolves.toEqual(
			expect.objectContaining({
				publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
				fetchStatus: "failed",
				lastFetchedAt: "2026-06-11T08:10:00.000Z",
				failureReason: "Login required",
			}),
		)
	})

	it("saves and loads post ops comments and review notes as file-backed records", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.savePostOpsComments("posts/post-1/post.json", {
			version: 1,
			updatedAt: "2026-06-11T08:10:00.000Z",
			source: "user",
			summary: "读者主要追问是否支持团队协作。",
			comments: [
				{
					id: "comment-1",
					author: "Alice",
					text: "这个流程能不能多人一起维护？",
					sentiment: "positive",
					intent: "购买咨询",
				},
			],
			insights: ["团队协作是下篇内容的重点角度"],
		})
		await service.savePostOpsReview("posts/post-1/post.json", {
			content: [
				"# Post One 复盘",
				"",
				"- 结论：内容方向有效，但需要补充团队协作案例。",
				"- 下一步：写一篇协作场景拆解。",
			].join("\n"),
		})

		const commentsFile = attachments.find(
			(item) => item.relative_file_path === "self-media/posts/post-1/ops/comments.json",
		)
		const reviewFile = attachments.find(
			(item) => item.relative_file_path === "self-media/posts/post-1/ops/review.md",
		)
		expect(commentsFile?.file_id).toBeTruthy()
		expect(reviewFile?.file_id).toBeTruthy()
		if (!commentsFile?.file_id || !reviewFile?.file_id) {
			throw new Error("ops comments/review files were not created")
		}

		expect(JSON.parse(contentByFileId.get(commentsFile.file_id) || "{}")).toEqual(
			expect.objectContaining({
				source: "user",
				summary: "读者主要追问是否支持团队协作。",
				comments: [
					expect.objectContaining({
						author: "Alice",
						intent: "购买咨询",
					}),
				],
				insights: ["团队协作是下篇内容的重点角度"],
			}),
		)
		expect(contentByFileId.get(reviewFile.file_id)).toContain("内容方向有效")

		await expect(service.loadPostOpsComments("posts/post-1/post.json")).resolves.toEqual(
			expect.objectContaining({
				source: "user",
				comments: [
					expect.objectContaining({
						text: "这个流程能不能多人一起维护？",
					}),
				],
			}),
		)
		await expect(service.loadPostOpsReview("posts/post-1/post.json")).resolves.toEqual(
			expect.objectContaining({
				content: expect.stringContaining("下一步：写一篇协作场景拆解"),
			}),
		)
	})

	it("saves and loads post ops history and html review files", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.savePostOpsMetrics("posts/post-1/post.json", {
			version: 1,
			updatedAt: "2026-06-11T08:20:00.000Z",
			source: "real-platform",
			metrics: {
				reads: "838",
				shares: "33",
			},
			history: [
				{
					fetchedAt: "2026-06-10T08:20:00.000Z",
					metrics: {
						reads: "812",
						shares: "30",
					},
				},
				{
					fetchedAt: "2026-06-11T08:20:00.000Z",
					metrics: {
						reads: "838",
						shares: "33",
					},
				},
			],
		})
		await service.savePostOpsReviewHtml("posts/post-1/post.json", {
			content: "<!doctype html><html><body><h1>运营复盘</h1></body></html>",
		})

		const reviewFile = attachments.find(
			(item) => item.relative_file_path === "self-media/posts/post-1/ops/review.html",
		)
		expect(reviewFile?.file_id).toBeTruthy()
		if (!reviewFile?.file_id) throw new Error("review.html was not created")

		await expect(service.loadPostOpsMetrics("posts/post-1/post.json")).resolves.toEqual(
			expect.objectContaining({
				history: [
					expect.objectContaining({
						fetchedAt: "2026-06-10T08:20:00.000Z",
					}),
					expect.objectContaining({
						metrics: expect.objectContaining({ reads: "838" }),
					}),
				],
			}),
		)
		await expect(service.loadPostOpsReviewHtml("posts/post-1/post.json")).resolves.toEqual({
			content: "<!doctype html><html><body><h1>运营复盘</h1></body></html>",
		})
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

	it("ignores legacy draft files that only contain empty article shells", async () => {
		seedNode({
			file_id: "drafts-dir",
			file_name: "__drafts",
			is_directory: true,
			parent_id: "self-media-root",
			relative_file_path: "self-media/__drafts",
		})
		seedNode({
			file_id: "empty-draft-json",
			file_name: "draft.json",
			is_directory: false,
			parent_id: "drafts-dir",
			relative_file_path: "self-media/__drafts/draft.json",
		})
		contentByFileId.set(
			"empty-draft-json",
			JSON.stringify({
				version: 1,
				currentStep: 0,
				createdAt: "2026-05-21T05:10:33.604Z",
				updatedAt: "2026-05-22T07:00:23.642Z",
				global: {
					author: "Magic Lab",
					brandPosition: "AI productivity",
					targetAudience: "Creators",
					brandImages: [],
				},
				articles: emptyShellDraftData.articles,
			}),
		)

		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await expect(service.loadDraft()).resolves.toBeNull()
	})

	it("does not save drafts that only contain empty article shells", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)

		await service.saveDraft(emptyShellDraftData, 0)

		expect(
			attachments.some(
				(item) => item.relative_file_path === "self-media/__drafts/draft.json",
			),
		).toBe(false)
		expect(mockSaveFileContent).not.toHaveBeenCalled()
	})

	it("keeps drafts that only contain a selected reference file name", async () => {
		const service = new SelfMediaFileStorageService(
			"project-1",
			"self-media-root",
			"self-media",
		)
		const data: SelfMediaInitData = {
			...emptyShellDraftData,
			articles: [
				{
					...emptyShellDraftData.articles[0],
					visualReferenceFiles: [
						{
							name: "style-reference.png",
							content: "",
						},
					],
				},
			],
		}

		await service.saveDraft(data, 0)

		expect(
			attachments.some(
				(item) => item.relative_file_path === "self-media/__drafts/draft.json",
			),
		).toBe(true)
		expect(mockSaveFileContent).toHaveBeenCalled()
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
				if (writeCount === 3) {
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

	it("throws when directory lookup is stale and cannot resolve __drafts", async () => {
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

		await expect(service.saveDraft(data, 1)).rejects.toThrow(
			"Failed to resolve directory: __drafts",
		)
		expect(
			attachments.some((item) => item.relative_file_path === "self-media/draft.json"),
		).toBe(false)
		expect(
			attachments.some(
				(item) => item.relative_file_path === "self-media/__drafts/draft.json",
			),
		).toBe(false)
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
