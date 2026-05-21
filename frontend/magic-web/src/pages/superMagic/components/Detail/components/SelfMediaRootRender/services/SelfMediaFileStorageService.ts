import { SuperMagicApi } from "@/apis"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import { superMagicUploadTokenService } from "@/pages/superMagic/components/MessageEditor/services/UploadTokenService"
import { Upload } from "@dtyq/upload-sdk"
import type {
	SelfMediaInitData,
	ArticleDetail,
	OutlineNode,
	BrandImageItem,
	SelfMediaInitGlobalSettings,
	MaterialItem,
} from "../components/SelfMediaInitPanel/types"

// ─── Constants ─────────────────────────────────────────────────────────────────

const DRAFTS_DIR = "__drafts"
const DRAFT_JSON = "draft.json"
const DRAFT_MD = "draft.md"
const REFERENCE_INDEX_JSON = "reference-index.json"
const DRAFT_MATERIALS_DIR = "draft-materials"
const BRAND_IMAGES_DIR = "brand-images"
const ARCHIVE_DIR = "archive"
const ARCHIVE_MANIFEST_JSON = "manifest.json"
const TEMPLATES_DIR = "templates"
const TEMPLATES_MATERIALS_DIR = "templates-materials"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DraftPayload {
	version: number
	currentStep: number
	createdAt: string
	updatedAt: string
	global: SerializedGlobalSettings
	articles: SerializedArticle[]
}

export interface TemplatePayload {
	version: number
	id: string
	name: string
	createdAt: string
	updatedAt: string
	global: SerializedGlobalSettings
	articles: SerializedArticle[]
}

export interface DraftArchiveManifest {
	version: number
	archiveId: string
	createdAt: string
	currentStep: number
	articleCount: number
	titles: string[]
}

export interface TemplateMeta {
	id: string
	name: string
	createdAt: string
	author: string
	articleCount: number
	titles: string[]
}

interface SerializedReferenceFile {
	name: string
	content: string
	kind?: "text" | "data-url"
	file_id?: string
	file_path?: string
}

interface SerializedArticle {
	title: string
	folderName: string
	style: string
	visualPreset?: string
	cardCount: number
	outline: SerializedOutlineNode[]
	materials: SerializedMaterial[]
	notes: string
	platform?: string
	description?: string
	visualReferenceFiles?: SerializedReferenceFile[]
}

interface SerializedOutlineNode {
	id: string
	text: string
	children?: SerializedOutlineNode[]
	materials?: SerializedMaterial[]
}

interface SerializedMaterial {
	id: string
	name: string
	description: string
	relativePath: string
}

interface SerializedBrandImage {
	id: string
	name: string
	description: string
	relativePath: string
	isImage: boolean
}

interface SerializedGlobalSettings {
	author: string
	brandPosition: string
	targetAudience: string
	brandImages: SerializedBrandImage[]
}

interface ReferenceIndexPayload {
	version: number
	createdAt: string
	updatedAt: string
	items: ReferenceIndexItem[]
}

type ReferenceIndexRole = "brand" | "article-material" | "outline-material" | "visual-reference"

interface ReferenceIndexItem {
	id: string
	role: ReferenceIndexRole
	name: string
	description?: string
	articleIndex?: number
	outlineNodeId?: string
	relativePath?: string
	kind?: "file" | "text" | "data-url"
	file_id?: string
	file_path?: string
	content?: string
}

interface FileNode {
	file_id?: string
	file_name?: string
	relative_file_path?: string
	is_directory?: boolean
	parent_id?: string | null
	children?: FileNode[]
	[key: string]: unknown
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * 自媒体文件存储服务。
 * 将草稿和模板以文件形式存储在项目的 __drafts/ 目录中。
 */
export class SelfMediaFileStorageService {
	private projectId: string
	private parentFileId: string | undefined
	private folderRelativePath: string | undefined
	private dirCache = new Map<string, string>() // path -> file_id

	constructor(projectId: string, parentFileId?: string, folderRelativePath?: string) {
		this.projectId = projectId
		this.parentFileId = parentFileId
		this.folderRelativePath = folderRelativePath
			? folderRelativePath.replace(/^\/+/, "").replace(/\/+$/, "")
			: undefined
	}

	// ─── Draft Operations ────────────────────────────────────────────────────

	/** Persist draft to project files */
	async saveDraft(data: SelfMediaInitData, currentStep: number): Promise<void> {
		await this.persistDraft(data, currentStep)
	}

	/** Archive the current draft snapshot before clearing the active slot. */
	async archiveDraft(data: SelfMediaInitData, currentStep: number): Promise<string | null> {
		try {
			const now = new Date().toISOString()
			const archiveId = `arc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

			await this.ensureBrandImagesUploaded(data.global.brandImages)
			await this.ensureDraftMaterialsUploaded(data.articles)

			const archiveSnapshot = this.buildArchiveSnapshotData(data, archiveId)
			const payload = await this.buildDraftPayload(archiveSnapshot, currentStep, now)
			const referenceIndex = this.buildReferenceIndexPayload(archiveSnapshot, now)
			const archiveDir = await this.ensureDirectory(
				`${this.getBasePath()}/${ARCHIVE_DIR}/${archiveId}`,
			)
			if (!archiveDir) return null

			const manifestFileId = await this.createAndWriteFile(
				archiveDir,
				ARCHIVE_MANIFEST_JSON,
				JSON.stringify(
					{
						version: 1,
						archiveId,
						createdAt: now,
						currentStep,
						articleCount: data.articles.length,
						titles: data.articles.map((item) => item.title).filter(Boolean),
					} satisfies DraftArchiveManifest,
					null,
					2,
				),
			)
			const archiveDraftFileId = await this.createAndWriteFile(
				archiveDir,
				DRAFT_JSON,
				JSON.stringify(payload, null, 2),
			)
			const archiveMarkdownFileId = await this.createAndWriteFile(
				archiveDir,
				DRAFT_MD,
				this.buildMarkdown(archiveSnapshot, {
					currentStep,
					createdAt: payload.createdAt,
					updatedAt: now,
				}),
			)
			const archiveReferenceIndexFileId = await this.createAndWriteFile(
				archiveDir,
				REFERENCE_INDEX_JSON,
				JSON.stringify(referenceIndex, null, 2),
			)
			if (
				!manifestFileId ||
				!archiveDraftFileId ||
				!archiveMarkdownFileId ||
				!archiveReferenceIndexFileId
			) {
				return null
			}

			const materialsArchived = await this.archiveDraftMaterials(archiveDir)
			if (!materialsArchived) return null
			await this.clearDraft({ removeMaterials: false })
			return archiveId
		} catch {
			return null
		}
	}

	/**
	 * Load draft from project files
	 */
	async loadDraft(): Promise<{ data: SelfMediaInitData; currentStep: number } | null> {
		try {
			const files = await this.getProjectFileList()
			const draftJsonPath = this.getDraftJsonRelativePath()
			const draftFile = this.findDraftFile(files)
			if (!draftFile?.file_id) {
				return null
			}

			const content = (await getFileContentById(draftFile.file_id, {
				responseType: "text",
			})) as string

			const payload: DraftPayload = JSON.parse(content)
			return {
				data: this.deserializePayload(payload),
				currentStep: payload.currentStep,
			}
		} catch {
			return null
		}
	}

	/**
	 * Clear draft files
	 */
	async clearDraft(options?: { removeMaterials?: boolean }): Promise<void> {
		try {
			const files = await this.getProjectFileList()
			const draftJsonPath = this.getDraftJsonRelativePath()
			const draftMdPath = this.getDraftMdRelativePath()
			const referenceIndexPath = this.getReferenceIndexRelativePath()
			const draftFiles = files.filter((f) => {
				if (f.is_directory || !f.relative_file_path) return false
				const normalized = this.normalizeRelativePath(f.relative_file_path)
				return (
					normalized === draftJsonPath ||
					normalized === draftMdPath ||
					normalized === referenceIndexPath
				)
			})
			for (const f of draftFiles) {
				if (f.file_id) {
					await SuperMagicApi.deleteFile(f.file_id).catch(() => { })
				}
			}

			if (options?.removeMaterials === false) return

			const materialsDirPath = this.folderRelativePath
				? this.normalizeRelativePath(
					`${this.folderRelativePath}/${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`,
				)
				: this.normalizeRelativePath(`${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`)
			const materialsDir = files.find(
				(f) =>
					f.is_directory &&
					f.relative_file_path &&
					this.normalizeRelativePath(f.relative_file_path) === materialsDirPath,
			)
			if (materialsDir?.file_id) {
				await SuperMagicApi.deleteFile(materialsDir.file_id).catch(() => { })
			}
		} catch {
			// silent
		}
	}

	// ─── Template Operations ─────────────────────────────────────────────────

	/**
	 * Save current data as a named template
	 */
	async saveTemplate(data: SelfMediaInitData, name: string): Promise<string> {
		const id = `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
		const now = new Date().toISOString()

		await this.ensureBrandImagesUploaded(data.global.brandImages)

		const payload: TemplatePayload = {
			version: 1,
			id,
			name,
			createdAt: now,
			updatedAt: now,
			global: this.serializeGlobal(data.global),
			articles: this.serializeArticles(data.articles),
		}

		const templatesDir = await this.ensureDirectory(`${this.getBasePath()}/${TEMPLATES_DIR}`)

		// Write JSON
		const jsonFileId = await this.createAndWriteFile(
			templatesDir,
			`${id}.json`,
			JSON.stringify(payload, null, 2),
		)

		// Write MD (human-readable)
		if (jsonFileId) {
			await this.createAndWriteFile(
				templatesDir,
				`${id}.md`,
				this.buildMarkdown(data, { name, createdAt: now, updatedAt: now }),
			)
		}

		// Upload materials for template
		await this.uploadTemplateMaterials(data.articles, id)

		return id
	}

	/**
	 * List available templates
	 */
	async listTemplates(): Promise<TemplateMeta[]> {
		try {
			const files = await this.getProjectFileList()
			const templatesPath = `${this.getBasePath()}/${TEMPLATES_DIR}`

			const jsonFiles = files.filter(
				(f) =>
					!f.is_directory &&
					f.relative_file_path?.startsWith(templatesPath) &&
					f.relative_file_path?.endsWith(".json"),
			)

			const results: TemplateMeta[] = []
			for (const file of jsonFiles) {
				try {
					const content = (await getFileContentById(file.file_id!, {
						responseType: "text",
					})) as string
					const payload: TemplatePayload = JSON.parse(content)
					results.push({
						id: payload.id,
						name: payload.name,
						createdAt: payload.createdAt,
						author: payload.global.author,
						articleCount: payload.articles.length,
						titles: payload.articles.map((a) => a.title).filter(Boolean),
					})
				} catch {
					// skip corrupted template
				}
			}

			return results.sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
		} catch {
			return []
		}
	}

	/**
	 * Load a specific template by ID
	 */
	async loadTemplate(templateId: string): Promise<SelfMediaInitData | null> {
		try {
			const files = await this.getProjectFileList()
			const jsonPath = `${this.getBasePath()}/${TEMPLATES_DIR}/${templateId}.json`
			const file = files.find((f) => !f.is_directory && f.relative_file_path === jsonPath)
			if (!file?.file_id) return null

			const content = (await getFileContentById(file.file_id, {
				responseType: "text",
			})) as string
			const payload: TemplatePayload = JSON.parse(content)
			return this.deserializePayload(payload)
		} catch {
			return null
		}
	}

	/**
	 * Delete a template by ID
	 */
	async deleteTemplate(templateId: string): Promise<void> {
		try {
			const files = await this.getProjectFileList()
			const basePath = `${this.getBasePath()}/${TEMPLATES_DIR}`

			// Delete .json and .md files
			const toDelete = files.filter(
				(f) =>
					!f.is_directory &&
					f.relative_file_path?.startsWith(basePath) &&
					(f.relative_file_path === `${basePath}/${templateId}.json` ||
						f.relative_file_path === `${basePath}/${templateId}.md`),
			)
			for (const f of toDelete) {
				if (f.file_id) {
					await SuperMagicApi.deleteFile(f.file_id).catch(() => { })
				}
			}

			// Delete template materials directory
			const matDir = files.find(
				(f) =>
					f.is_directory &&
					f.relative_file_path ===
					`${this.getBasePath()}/${TEMPLATES_MATERIALS_DIR}/${templateId}`,
			)
			if (matDir?.file_id) {
				await SuperMagicApi.deleteFile(matDir.file_id).catch(() => { })
			}
		} catch {
			// silent
		}
	}

	// ─── Material Upload ─────────────────────────────────────────────────────

	/**
	 * Upload a brand image to __drafts/brand-images/
	 * Returns the project-relative path for draft.json.
	 */
	async uploadBrandImageToDraft(
		file: File,
		onProgress?: (percent: number) => void,
	): Promise<string | null> {
		try {
			const brandDir = `${this.getBasePath()}/${BRAND_IMAGES_DIR}`
			const parentDirId = await this.ensureDirectory(brandDir)
			if (!parentDirId) return null

			const credentials = await superMagicUploadTokenService.getUploadToken(this.projectId)
			if (!credentials) return null

			const uploader = new Upload()
			onProgress?.(0)

			const fileKey = await new Promise<string>((resolve, reject) => {
				const { success, fail, progress } = uploader.upload({
					file,
					fileName: file.name,
					customCredentials: superMagicUploadTokenService.changeDir(
						credentials,
						brandDir,
					),
					body: JSON.stringify({
						storage: "private",
						sts: true,
						content_type: file.type || "application/octet-stream",
					}),
				})

				progress?.((percent?: number) => {
					if (typeof percent === "number") onProgress?.(percent)
				})
				success?.((res: any) => resolve(res?.data?.path || res?.key || res?.file_key || ""))
				fail?.((err: any) => reject(err))
			})

			if (fileKey) {
				const relativePath = this.toProjectRelativePath(`${brandDir}/${file.name}`)
				await superMagicUploadTokenService.saveFileToProject({
					project_id: this.projectId,
					parent_id: parentDirId,
					file_key: fileKey,
					file_name: file.name,
					file_size: file.size,
					file_type: "user_upload",
					storage_type: "workspace",
					source: "home" as any,
					relative_file_path: relativePath,
				})
				return relativePath
			}
			return null
		} catch {
			return null
		}
	}

	/**
	 * Upload a material file to draft-materials/{articleIndex}/
	 * Returns the relative path for reference.
	 */
	async uploadMaterialToDraft(articleIndex: number, file: File): Promise<string | null> {
		try {
			const materialDir = `${this.getBasePath()}/${DRAFT_MATERIALS_DIR}/${articleIndex}`
			const parentDirId = await this.ensureDirectory(materialDir)
			if (!parentDirId) return null

			const credentials = await superMagicUploadTokenService.getUploadToken(this.projectId)
			if (!credentials) return null

			const uploader = new Upload()

			const fileKey = await new Promise<string>((resolve, reject) => {
				const { success, fail } = uploader.upload({
					file,
					fileName: file.name,
					customCredentials: superMagicUploadTokenService.changeDir(
						credentials,
						materialDir,
					),
					body: JSON.stringify({
						storage: "private",
						sts: true,
						content_type: file.type || "application/octet-stream",
					}),
				})

				success?.((res: any) => resolve(res?.data?.path || res?.key || res?.file_key || ""))
				fail?.((err: any) => reject(err))
			})

			if (fileKey) {
				const relativePath = this.toProjectRelativePath(`${materialDir}/${file.name}`)
				await superMagicUploadTokenService.saveFileToProject({
					project_id: this.projectId,
					parent_id: parentDirId,
					file_key: fileKey,
					file_name: file.name,
					file_size: file.size,
					file_type: "user_upload",
					storage_type: "workspace",
					source: "home" as any,
					relative_file_path: relativePath,
				})
				return relativePath
			}
			return null
		} catch {
			return null
		}
	}

	// ─── Cleanup ─────────────────────────────────────────────────────────────

	dispose(): void { }

	// ─── Private Helpers ─────────────────────────────────────────────────────

	private normalizeRelativePath(path: string): string {
		return path.replace(/^\/+/, "").replace(/\/+$/, "")
	}

	/** Path relative to self-media folder → full path in project file tree. */
	private toProjectRelativePath(pathFromSelfMediaFolder: string): string {
		const normalized = this.normalizeRelativePath(pathFromSelfMediaFolder)
		if (this.folderRelativePath) {
			return this.normalizeRelativePath(`${this.folderRelativePath}/${normalized}`)
		}
		return normalized
	}

	private findDirectoryInProjectFiles(
		files: FileNode[],
		pathFromSelfMediaFolder: string,
	): FileNode | undefined {
		const target = this.toProjectRelativePath(pathFromSelfMediaFolder)
		return files.find(
			(f) =>
				f.is_directory &&
				f.relative_file_path &&
				this.normalizeRelativePath(f.relative_file_path) === target,
		)
	}

	/** Path segment under parentFileId for ensureDirectory (not project-root relative). */
	private getBasePath(): string {
		return DRAFTS_DIR
	}

	/** Full project-relative path for draft.json lookup in attachment/file list. */
	private getDraftJsonRelativePath(): string {
		if (this.folderRelativePath) {
			return this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${DRAFT_JSON}`,
			)
		}
		return this.normalizeRelativePath(`${DRAFTS_DIR}/${DRAFT_JSON}`)
	}

	private getDraftMdRelativePath(): string {
		if (this.folderRelativePath) {
			return this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${DRAFT_MD}`,
			)
		}
		return this.normalizeRelativePath(`${DRAFTS_DIR}/${DRAFT_MD}`)
	}

	private getReferenceIndexRelativePath(): string {
		if (this.folderRelativePath) {
			return this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${REFERENCE_INDEX_JSON}`,
			)
		}
		return this.normalizeRelativePath(`${DRAFTS_DIR}/${REFERENCE_INDEX_JSON}`)
	}

	private findDraftFile(files: FileNode[]): FileNode | undefined {
		const target = this.getDraftJsonRelativePath()
		const exact = files.find(
			(f) =>
				!f.is_directory &&
				f.relative_file_path &&
				this.normalizeRelativePath(f.relative_file_path) === target,
		)
		if (exact) return exact

		const suffix = `/${DRAFTS_DIR}/${DRAFT_JSON}`
		const candidates = files.filter(
			(f) => !f.is_directory && f.relative_file_path?.endsWith(suffix),
		)
		if (candidates.length === 0) return undefined
		if (!this.folderRelativePath) return candidates[0]

		const folderPrefix = this.folderRelativePath
		return (
			candidates.find((f) =>
				this.normalizeRelativePath(f.relative_file_path!).startsWith(`${folderPrefix}/`),
			) ?? candidates[0]
		)
	}

	private async persistDraft(data: SelfMediaInitData, currentStep: number): Promise<void> {
		try {
			const now = new Date().toISOString()

			await this.ensureBrandImagesUploaded(data.global.brandImages)
			await this.ensureDraftMaterialsUploaded(data.articles)

			const payload = await this.buildDraftPayload(data, currentStep, now)
			const referenceIndex = this.buildReferenceIndexPayload(data, now)

			const draftsDir = await this.ensureDirectory(this.getBasePath())

			// Write draft.json
			await this.createAndWriteFile(draftsDir, DRAFT_JSON, JSON.stringify(payload, null, 2))

			// Write draft.md (human-readable)
			await this.createAndWriteFile(
				draftsDir,
				DRAFT_MD,
				this.buildMarkdown(data, {
					currentStep,
					createdAt: payload.createdAt,
					updatedAt: now,
				}),
			)
			await this.createAndWriteFile(
				draftsDir,
				REFERENCE_INDEX_JSON,
				JSON.stringify(referenceIndex, null, 2),
			)
		} catch {
			// Silent failure - don't block the user
		}
	}

	private async ensureDirectory(path: string): Promise<string> {
		// Check cache first
		const cached = this.dirCache.get(path)
		if (cached) return cached

		// Split path and create each level
		const parts = path.split("/").filter(Boolean)
		let currentParentId = this.parentFileId
		let currentPath = ""

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part
			const cachedPart = this.dirCache.get(currentPath)
			if (cachedPart) {
				currentParentId = cachedPart
				continue
			}

			const response = await SuperMagicApi.createFile({
				project_id: this.projectId,
				parent_id: currentParentId,
				file_name: part,
				is_directory: true,
				ignore_duplicate: true,
			})

			const fileId = (response as any)?.file_id
			if (fileId) {
				this.dirCache.set(currentPath, fileId)
				currentParentId = fileId
			} else {
				// Directory might already exist — try to find it in file list
				const files = await this.getProjectFileList()
				const existing = this.findDirectoryInProjectFiles(files, currentPath)
				if (existing?.file_id) {
					this.dirCache.set(currentPath, existing.file_id)
					currentParentId = existing.file_id
				}
			}
		}

		return currentParentId || ""
	}

	private async createAndWriteFile(
		parentDirId: string,
		fileName: string,
		content: string,
	): Promise<string | null> {
		try {
			// Try to find existing file first
			const files = await this.getProjectFileList()
			const basePath = this.getBasePath()

			// Determine the full path based on parentDirId
			let fullPath = ""
			if (parentDirId) {
				const parentDir = files.find((f) => f.is_directory && f.file_id === parentDirId)
				fullPath = parentDir?.relative_file_path
					? `${parentDir.relative_file_path}/${fileName}`
					: `${basePath}/${fileName}`
			}

			// Check if file already exists
			let fileId: string | undefined
			if (fullPath) {
				const existing = files.find(
					(f) => !f.is_directory && f.relative_file_path === fullPath,
				)
				fileId = existing?.file_id
			}

			// Create file if not exists
			if (!fileId) {
				const response = await SuperMagicApi.createFile({
					project_id: this.projectId,
					parent_id: parentDirId,
					file_name: fileName,
					is_directory: false,
					ignore_duplicate: true,
				})
				fileId = (response as any)?.file_id
			}

			if (!fileId) return null

			// Write content
			await SuperMagicApi.saveFileContent([{ file_id: fileId, content }])
			return fileId
		} catch {
			return null
		}
	}

	private async getProjectFileList(): Promise<FileNode[]> {
		try {
			const response = await SuperMagicApi.getAttachmentsByProjectId({
				projectId: this.projectId,
				temporaryToken: "",
			})
			return ((response as any)?.list || []) as FileNode[]
		} catch {
			return []
		}
	}

	private async uploadTemplateMaterials(
		articles: ArticleDetail[],
		templateId: string,
	): Promise<void> {
		for (let i = 0; i < articles.length; i++) {
			const article = articles[i]
			if (!article.materials || article.materials.length === 0) continue

			const materialDir = `${this.getBasePath()}/${TEMPLATES_MATERIALS_DIR}/${templateId}/${i}`
			await this.ensureDirectory(materialDir)

			const credentials = await superMagicUploadTokenService.getUploadToken(this.projectId)
			if (!credentials) continue

			for (const item of article.materials) {
				try {
					const uploader = new Upload()

					const fileKey = await new Promise<string>((resolve, reject) => {
						const { success, fail } = uploader.upload({
							file: item.file,
							fileName: item.file.name,
							customCredentials: superMagicUploadTokenService.changeDir(
								credentials,
								materialDir,
							),
							body: JSON.stringify({
								storage: "private",
								sts: true,
								content_type: item.file.type || "application/octet-stream",
							}),
						})

						success?.((res: any) =>
							resolve(res?.data?.path || res?.key || res?.file_key || ""),
						)
						fail?.((err: any) => reject(err))
					})

					if (fileKey) {
						await superMagicUploadTokenService.saveFileToProject({
							project_id: this.projectId,
							file_key: fileKey,
							file_name: item.file.name,
							file_size: item.file.size,
							file_type: "user_upload",
							storage_type: "workspace",
							source: "home" as any,
							relative_file_path: `${materialDir}/${item.file.name}`,
						})
					}
				} catch {
					// skip individual material failures
				}
			}
		}
	}

	private async ensureDraftMaterialsUploaded(articles: ArticleDetail[]): Promise<void> {
		for (let articleIndex = 0; articleIndex < articles.length; articleIndex += 1) {
			const article = articles[articleIndex]
			for (const material of this.collectAllArticleMaterials(article)) {
				if (material.uploadedPath || !material.file?.size) continue
				const path = await this.uploadMaterialToDraft(articleIndex, material.file)
				if (path) material.uploadedPath = path
			}
		}
	}

	private collectAllArticleMaterials(article: ArticleDetail): MaterialItem[] {
		const items = [...(article.materials || [])]
		const visit = (nodes: OutlineNode[]) => {
			for (const node of nodes) {
				if (node.materials?.length) items.push(...node.materials)
				if (node.children?.length) visit(node.children)
			}
		}
		visit(article.outline || [])
		return items
	}

	private async archiveDraftMaterials(archiveDirId: string): Promise<boolean> {
		const files = await this.getProjectFileList()
		const materialsDirPath = this.folderRelativePath
			? this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`,
			)
			: this.normalizeRelativePath(`${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`)
		const materialsDir = files.find(
			(item) =>
				item.is_directory &&
				item.relative_file_path &&
				this.normalizeRelativePath(item.relative_file_path) === materialsDirPath,
		)
		if (!materialsDir?.file_id) return true
		try {
			await SuperMagicApi.moveFile({
				file_id: materialsDir.file_id,
				target_parent_id: archiveDirId,
			})
			return true
		} catch {
			return false
		}
	}

	// ─── Serialization ───────────────────────────────────────────────────────

	private async buildDraftPayload(
		data: SelfMediaInitData,
		currentStep: number,
		now: string,
	): Promise<DraftPayload> {
		let createdAt = now
		try {
			const existing = await this.loadDraft()
			if (existing) {
				const files = await this.getProjectFileList()
				const draftFile = this.findDraftFile(files)
				if (draftFile?.file_id) {
					const content = (await getFileContentById(draftFile.file_id, {
						responseType: "text",
					})) as string
					const prev: DraftPayload = JSON.parse(content)
					createdAt = prev.createdAt || now
				}
			}
		} catch {
			// use now
		}

		return {
			version: 1,
			currentStep,
			createdAt,
			updatedAt: now,
			global: await this.buildDraftGlobalSettings(data.global),
			articles: this.serializeArticles(data.articles),
		}
	}

	private buildReferenceIndexPayload(
		data: SelfMediaInitData,
		now: string,
	): ReferenceIndexPayload {
		const items: ReferenceIndexItem[] = []

		data.global.brandImages.forEach((item) => {
			items.push({
				id: item.id,
				role: "brand",
				name: item.file?.name || "unknown",
				description: item.description,
				relativePath: item.uploadedPath,
				kind: "file",
			})
		})

		data.articles.forEach((article, articleIndex) => {
			article.materials.forEach((material) => {
				items.push({
					id: material.id,
					role: "article-material",
					name: material.file?.name || "unknown",
					description: material.description,
					articleIndex,
					relativePath: material.uploadedPath,
					kind: "file",
				})
			})

			const visitOutline = (nodes: OutlineNode[]) => {
				nodes.forEach((node) => {
					node.materials?.forEach((material) => {
						items.push({
							id: material.id,
							role: "outline-material",
							name: material.file?.name || "unknown",
							description: material.description,
							articleIndex,
							outlineNodeId: node.id,
							relativePath: material.uploadedPath,
							kind: "file",
						})
					})
					if (node.children?.length) visitOutline(node.children)
				})
			}
			visitOutline(article.outline)

			article.visualReferenceFiles?.forEach((file, visualIndex) => {
				items.push({
					id: `visual-${articleIndex}-${visualIndex}`,
					role: "visual-reference",
					name: file.name,
					articleIndex,
					relativePath: file.file_path,
					kind: file.kind ? file.kind : file.file_path ? "file" : "text",
					file_id: file.file_id,
					file_path: file.file_path,
					content: file.content,
				})
			})
		})

		return {
			version: 1,
			createdAt: now,
			updatedAt: now,
			items,
		}
	}

	private buildArchiveSnapshotData(
		data: SelfMediaInitData,
		archiveId: string,
	): SelfMediaInitData {
		return {
			global: {
				...data.global,
				brandImages: data.global.brandImages.map((item) => ({ ...item })),
			},
			articles: data.articles.map((article) => ({
				...article,
				outline: this.rewriteOutlineForArchive(article.outline || [], archiveId),
				materials: (article.materials || []).map((item) => ({
					...item,
					uploadedPath: this.rewriteDraftMaterialPathForArchive(
						item.uploadedPath,
						archiveId,
					),
				})),
				visualReferenceFiles: (article.visualReferenceFiles || []).map((item) => ({
					...item,
				})),
			})),
		}
	}

	private rewriteOutlineForArchive(nodes: OutlineNode[], archiveId: string): OutlineNode[] {
		return nodes.map((node) => ({
			...node,
			children: this.rewriteOutlineForArchive(node.children || [], archiveId),
			materials: (node.materials || []).map((item) => ({
				...item,
				uploadedPath: this.rewriteDraftMaterialPathForArchive(item.uploadedPath, archiveId),
			})),
		}))
	}

	private rewriteDraftMaterialPathForArchive(
		path: string | undefined,
		archiveId: string,
	): string | undefined {
		if (!path) return path
		const normalized = this.normalizeRelativePath(path)
		const draftMaterialsPrefix = `${this.folderRelativePath
			? this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`,
			)
			: this.normalizeRelativePath(`${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}`)
			}/`
		if (!normalized.startsWith(draftMaterialsPrefix)) return path
		const suffix = normalized.slice(draftMaterialsPrefix.length)
		const archivePrefix = `${this.folderRelativePath
			? this.normalizeRelativePath(
				`${this.folderRelativePath}/${DRAFTS_DIR}/${ARCHIVE_DIR}/${archiveId}/${DRAFT_MATERIALS_DIR}`,
			)
			: this.normalizeRelativePath(
				`${DRAFTS_DIR}/${ARCHIVE_DIR}/${archiveId}/${DRAFT_MATERIALS_DIR}`,
			)
			}/`
		return `${archivePrefix}${suffix}`
	}

	private serializeArticles(articles: ArticleDetail[]): SerializedArticle[] {
		return articles.map((article, idx) => ({
			title: article.title,
			folderName: article.folderName,
			style: article.style,
			visualPreset: article.visualPreset,
			cardCount: article.cardCount,
			outline: this.serializeOutline(article.outline, idx),
			materials: (article.materials || []).map((m) => ({
				id: m.id,
				name: m.file?.name || "unknown",
				description: m.description,
				relativePath:
					m.uploadedPath ||
					this.toProjectRelativePath(
						`${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}/${idx}/${m.file?.name || "unknown"}`,
					),
			})),
			notes: article.notes,
			platform: article.platform,
			description: article.description,
			visualReferenceFiles: (article.visualReferenceFiles || []).map((f) => ({
				name: f.name,
				content: f.content,
				kind: f.kind,
				file_id: f.file_id,
				file_path: f.file_path,
			})),
		}))
	}

	private serializeOutline(nodes: OutlineNode[], articleIndex: number): SerializedOutlineNode[] {
		return nodes.map((node) => ({
			id: node.id,
			text: node.text,
			children: this.serializeOutline(node.children || [], articleIndex),
			materials: (node.materials || []).map((material) => ({
				id: material.id,
				name: material.file?.name || "unknown",
				description: material.description,
				relativePath:
					material.uploadedPath ||
					this.toProjectRelativePath(
						`${DRAFTS_DIR}/${DRAFT_MATERIALS_DIR}/${articleIndex}/${material.file?.name || "unknown"}`,
					),
			})),
		}))
	}

	private serializeGlobal(global: SelfMediaInitGlobalSettings): SerializedGlobalSettings {
		return {
			author: global.author,
			brandPosition: global.brandPosition,
			targetAudience: global.targetAudience,
			brandImages: (global.brandImages || []).map((img) => ({
				id: img.id,
				name: img.file?.name || "unknown",
				description: img.description,
				relativePath:
					img.uploadedPath ||
					this.toProjectRelativePath(
						`${DRAFTS_DIR}/${BRAND_IMAGES_DIR}/${img.file?.name || "unknown"}`,
					),
				isImage: img.isImage,
			})),
		}
	}

	private async buildDraftGlobalSettings(
		global: SelfMediaInitGlobalSettings,
	): Promise<SerializedGlobalSettings> {
		const serializedGlobal = this.serializeGlobal(global)
		if (serializedGlobal.brandImages.length > 0) return serializedGlobal

		return {
			...serializedGlobal,
			brandImages: await this.listDraftBrandImagesFromDirectory(),
		}
	}

	private async listDraftBrandImagesFromDirectory(): Promise<SerializedBrandImage[]> {
		const files = await this.getProjectFileList()
		const brandImagesDir = this.toProjectRelativePath(
			`${this.getBasePath()}/${BRAND_IMAGES_DIR}`,
		)

		return files
			.filter(
				(item) =>
					!item.is_directory &&
					item.relative_file_path &&
					this.normalizeRelativePath(item.relative_file_path).startsWith(
						`${brandImagesDir}/`,
					),
			)
			.sort((a, b) =>
				this.normalizeRelativePath(a.relative_file_path || "").localeCompare(
					this.normalizeRelativePath(b.relative_file_path || ""),
				),
			)
			.map((item) => {
				const relativePath = this.normalizeRelativePath(item.relative_file_path || "")
				const name = item.file_name || relativePath.split("/").pop() || "unknown"

				return {
					id: `brand-image:${relativePath}`,
					name,
					description: "",
					relativePath,
					isImage: this.isImageFileName(name),
				}
			})
	}

	private isImageFileName(fileName: string): boolean {
		return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(fileName)
	}

	private async ensureBrandImagesUploaded(brandImages: BrandImageItem[]): Promise<void> {
		for (const item of brandImages) {
			if (item.uploadedPath || !item.file?.size) continue
			const path = await this.uploadBrandImageToDraft(item.file)
			if (path) item.uploadedPath = path
		}
	}

	private deserializeBrandImages(serialized: unknown): BrandImageItem[] {
		if (!Array.isArray(serialized)) return []
		return serialized.map((item: SerializedBrandImage & { uploadedPath?: string }) => ({
			id: item.id,
			file: new File([], item.name || "file"),
			previewUrl: "",
			description: item.description || "",
			isImage: Boolean(item.isImage),
			uploadedPath: item.relativePath || item.uploadedPath,
		}))
	}

	private deserializePayload(payload: DraftPayload | TemplatePayload): SelfMediaInitData {
		return {
			global: {
				author: payload.global.author,
				brandPosition: payload.global.brandPosition,
				targetAudience: payload.global.targetAudience,
				brandImages: this.deserializeBrandImages(payload.global.brandImages),
			},
			articles: payload.articles.map((a) => ({
				title: a.title,
				folderName: a.folderName,
				style: a.style,
				visualPreset: a.visualPreset,
				cardCount: a.cardCount,
				outline: this.normalizeOutline(a.outline),
				materials: Array.isArray(a.materials)
					? a.materials.map((m) => ({
						id: m.id || `material_${Date.now()}`,
						file: new File([], m.name || "file"),
						previewUrl: "",
						description: m.description || "",
						uploadedPath: m.relativePath,
					}))
					: [],
				notes: a.notes,
				platform: a.platform as any,
				description: a.description,
				visualReferenceFiles: Array.isArray(a.visualReferenceFiles)
					? a.visualReferenceFiles.map((f) => ({
						name: f.name || "file",
						content: f.content || "",
						kind: f.kind,
						file_id: f.file_id,
						file_path: f.file_path,
					}))
					: [],
			})),
		}
	}

	private normalizeOutline(nodes: unknown): OutlineNode[] {
		if (!Array.isArray(nodes)) return []

		type OutlineSourceNode = {
			id?: string
			text?: string
			children?: unknown[]
			materials?: Array<{
				id?: string
				name?: string
				description?: string
				relativePath?: string
				uploadedPath?: string
			}>
		}

		let counter = 0
		const normalize = (items: unknown[]): OutlineNode[] =>
			items.map((item) => {
				const node = item as OutlineSourceNode
				return {
					id:
						typeof node.id === "string"
							? node.id
							: `outline_${Date.now()}_${++counter}`,
					text: typeof node.text === "string" ? node.text : "",
					children: Array.isArray(node.children) ? normalize(node.children) : [],
					materials: Array.isArray(node.materials)
						? node.materials.map((m, idx) => ({
							id: m.id || `outline_mat_${idx}`,
							file: new File([], m.name || "file"),
							previewUrl: "",
							description: m.description || "",
							uploadedPath: m.relativePath || m.uploadedPath,
						}))
						: [],
				}
			})

		return normalize(nodes)
	}

	// ─── Markdown Builder ────────────────────────────────────────────────────

	private buildMarkdown(
		data: SelfMediaInitData,
		meta: { name?: string; currentStep?: number; createdAt: string; updatedAt: string },
	): string {
		const lines: string[] = []

		// Frontmatter
		lines.push("---")
		lines.push("version: 1")
		if (meta.name) lines.push(`name: "${meta.name}"`)
		lines.push(`created_at: ${meta.createdAt}`)
		lines.push(`updated_at: ${meta.updatedAt}`)
		if (meta.currentStep !== undefined) lines.push(`current_step: ${meta.currentStep}`)
		lines.push(`author: "${data.global.author}"`)
		lines.push(`brand_position: "${data.global.brandPosition}"`)
		if (data.global.targetAudience) {
			lines.push(`target_audience: "${data.global.targetAudience}"`)
		}
		lines.push("---")
		lines.push("")
		lines.push("# 自媒体内容方案")
		lines.push("")

		// Articles
		data.articles.forEach((article, idx) => {
			lines.push(`## 文章 ${idx + 1}: ${article.title}`)
			lines.push("")
			if (article.style) lines.push(`- **风格**: ${article.style}`)
			if (article.visualPreset) lines.push(`- **视觉预设**: ${article.visualPreset}`)
			if (article.cardCount > 0) lines.push(`- **卡片数**: ${article.cardCount}`)
			if (article.folderName) lines.push(`- **文件夹**: ${article.folderName}`)
			if (article.platform) lines.push(`- **平台**: ${article.platform}`)
			if (article.description) {
				lines.push("")
				lines.push(`> ${article.description}`)
			}
			lines.push("")

			// Outline
			if (article.outline.length > 0) {
				lines.push("### 大纲")
				lines.push("")
				this.renderOutline(lines, article.outline, 0)
				lines.push("")
			}

			// Materials
			if (article.materials.length > 0) {
				lines.push("### 素材")
				lines.push("")
				article.materials.forEach((m) => {
					const path =
						m.uploadedPath || `draft-materials/${idx}/${m.file?.name || "file"}`
					lines.push(`- \`${path}\` — ${m.description || m.file?.name || ""}`)
				})
				lines.push("")
			}

			// Notes
			if (article.notes) {
				lines.push("### 补充说明")
				lines.push("")
				lines.push(article.notes)
				lines.push("")
			}

			lines.push("---")
			lines.push("")
		})

		return lines.join("\n")
	}

	private renderOutline(lines: string[], nodes: OutlineNode[], depth: number): void {
		const indent = "  ".repeat(depth)
		for (const node of nodes) {
			lines.push(
				`${indent}${depth === 0 ? (lines.length > 0 ? "" : "") + "1." : "-"} ${node.text}`,
			)
			if (node.children && node.children.length > 0) {
				this.renderOutline(lines, node.children, depth + 1)
			}
		}
	}
}
