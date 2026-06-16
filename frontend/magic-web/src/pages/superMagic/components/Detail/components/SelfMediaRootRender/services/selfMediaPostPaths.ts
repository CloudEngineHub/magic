import { SuperMagicApi } from "@/apis"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"
import { resolveArticleFolderName } from "./selfMediaArticleFolderName"

export interface ArticlePostTarget {
	articleIndex: number
	folderName: string
	postPath: string
	assetsPath: string
	postEntry: string
	assetsDirId?: string
}

export interface BuildArticlePostTargetsParams {
	articles: ArticleDetail[]
	rootPath?: string
}

export interface EnsureArticlePostAssetDirectoriesParams extends BuildArticlePostTargetsParams {
	projectId: string
	rootDirectoryId?: string
	existingNodes?: SelfMediaDirectoryNode[]
}

export interface SelfMediaRootPathSource {
	file_name?: string
	relative_file_path?: unknown
}

export interface SelfMediaDirectoryNode {
	file_id?: unknown
	file_name?: string
	is_directory?: boolean
	parent_id?: unknown
}

const POSTS_DIR = "posts"
const ASSETS_DIR = "assets"

export function resolveSelfMediaRootPath(data?: SelfMediaRootPathSource): string {
	if (typeof data?.relative_file_path === "string") return normalizePath(data.relative_file_path)
	return normalizePath(data?.file_name || "")
}

export function buildArticlePostTargets({
	articles,
	rootPath,
}: BuildArticlePostTargetsParams): ArticlePostTarget[] {
	const normalizedRootPath = normalizePath(rootPath || "")

	return articles.map((article, articleIndex) => {
		const folderName = resolveArticleFolderName(article, articleIndex)
		const postPath = joinPath(normalizedRootPath, POSTS_DIR, folderName)
		return {
			articleIndex,
			folderName,
			postPath,
			assetsPath: joinPath(postPath, ASSETS_DIR),
			postEntry: `${POSTS_DIR}/${folderName}/post.json`,
		}
	})
}

export async function ensureArticlePostAssetDirectories({
	projectId,
	rootDirectoryId,
	rootPath,
	articles,
	existingNodes,
}: EnsureArticlePostAssetDirectoriesParams): Promise<ArticlePostTarget[]> {
	const targets = buildArticlePostTargets({ articles, rootPath })
	const postsDirId = await createDirectory(projectId, rootDirectoryId, POSTS_DIR, existingNodes)

	for (const target of targets) {
		const postDirId = await createDirectory(
			projectId,
			postsDirId,
			target.folderName,
			existingNodes,
		)
		target.assetsDirId = await createDirectory(projectId, postDirId, ASSETS_DIR, existingNodes)
	}

	return targets
}

async function createDirectory(
	projectId: string,
	parentId: string | undefined,
	fileName: string,
	existingNodes?: SelfMediaDirectoryNode[],
): Promise<string> {
	const response = await SuperMagicApi.createFile({
		project_id: projectId,
		parent_id: parentId,
		file_name: fileName,
		is_directory: true,
		ignore_duplicate: true,
	})
	const fileId = (response as { file_id?: string | number } | undefined)?.file_id
	if (fileId) return fileId.toString()

	const existing = findExistingDirectory(existingNodes, parentId, fileName)
	if (existing?.file_id) return String(existing.file_id)

	throw new Error(`Failed to create self-media directory: ${fileName}`)
}

function findExistingDirectory(
	nodes: SelfMediaDirectoryNode[] | undefined,
	parentId: string | undefined,
	fileName: string,
): SelfMediaDirectoryNode | undefined {
	return nodes?.find(
		(node) =>
			node.is_directory &&
			node.file_name === fileName &&
			(parentId ? node.parent_id?.toString() === parentId : !node.parent_id),
	)
}

function normalizePath(path: string): string {
	return path.replace(/^\/+/, "").replace(/\/+$/, "")
}

function joinPath(...parts: Array<string | undefined>): string {
	return parts
		.map((part) => normalizePath(part || ""))
		.filter(Boolean)
		.join("/")
}
