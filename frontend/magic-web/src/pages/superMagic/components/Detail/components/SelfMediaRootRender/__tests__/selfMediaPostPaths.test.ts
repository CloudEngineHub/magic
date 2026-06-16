import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"
import {
	buildArticlePostTargets,
	ensureArticlePostAssetDirectories,
	resolveSelfMediaRootPath,
} from "../services"

const { mockCreateFile } = vi.hoisted(() => ({
	mockCreateFile: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: mockCreateFile,
	},
}))

function makeArticle(overrides: Partial<ArticleDetail>): ArticleDetail {
	return {
		title: "Post A",
		folderName: "post-a",
		style: "professional",
		visualPreset: "none",
		outline: [],
		cardCount: 6,
		materials: [],
		notes: "",
		platform: "rednote",
		description: "",
		visualReferenceFiles: [],
		...overrides,
	}
}

describe("selfMediaPostPaths", () => {
	beforeEach(() => {
		mockCreateFile.mockReset()
	})

	it("builds one consistent post path contract per article", () => {
		const targets = buildArticlePostTargets({
			articles: [makeArticle({ title: "Post A", folderName: "post-a" })],
			rootPath: "self-media",
		})

		expect(targets).toEqual([
			{
				articleIndex: 0,
				folderName: "post-a",
				postPath: "self-media/posts/post-a",
				assetsPath: "self-media/posts/post-a/assets",
				postEntry: "posts/post-a/post.json",
			},
		])
	})

	it("prefers the self-media root relative path over the display file name", () => {
		expect(
			resolveSelfMediaRootPath({
				file_name: "Self Media",
				relative_file_path: "workspace/self-media",
			}),
		).toBe("workspace/self-media")
	})

	it("creates posts, post folder and assets directory under the self-media root", async () => {
		mockCreateFile
			.mockResolvedValueOnce({ file_id: "posts-dir" })
			.mockResolvedValueOnce({ file_id: "post-dir" })
			.mockResolvedValueOnce({ file_id: "assets-dir" })

		const targets = await ensureArticlePostAssetDirectories({
			projectId: "project-1",
			rootDirectoryId: "self-media-root",
			rootPath: "self-media",
			articles: [makeArticle({ folderName: "post-a" })],
		})

		expect(mockCreateFile).toHaveBeenNthCalledWith(1, {
			project_id: "project-1",
			parent_id: "self-media-root",
			file_name: "posts",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(mockCreateFile).toHaveBeenNthCalledWith(2, {
			project_id: "project-1",
			parent_id: "posts-dir",
			file_name: "post-a",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(mockCreateFile).toHaveBeenNthCalledWith(3, {
			project_id: "project-1",
			parent_id: "post-dir",
			file_name: "assets",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(targets[0]).toMatchObject({
			assetsPath: "self-media/posts/post-a/assets",
			assetsDirId: "assets-dir",
		})
	})

	it("resolves existing directory ids when duplicate creation returns no file id", async () => {
		mockCreateFile.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({})

		const targets = await ensureArticlePostAssetDirectories({
			projectId: "project-1",
			rootDirectoryId: "self-media-root",
			rootPath: "self-media",
			articles: [makeArticle({ folderName: "post-a" })],
			existingNodes: [
				{
					file_id: "posts-dir",
					file_name: "posts",
					is_directory: true,
					parent_id: "self-media-root",
				},
				{
					file_id: "post-dir",
					file_name: "post-a",
					is_directory: true,
					parent_id: "posts-dir",
				},
				{
					file_id: "assets-dir",
					file_name: "assets",
					is_directory: true,
					parent_id: "post-dir",
				},
			],
		})

		expect(targets[0].assetsDirId).toBe("assets-dir")
	})
})
