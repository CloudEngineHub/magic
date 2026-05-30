import { SuperMagicApi } from "@/apis"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignData } from "../types"
import { isV2Version } from "./magicProjectCompression"
import {
	ELEMENT_DETAILS_FILENAME,
	ELEMENT_DETAILS_USER_FILENAME,
	type ElementDetailsDoc,
	buildUserElementDetailsDoc,
	emptyElementDetailsDoc,
	normalizeElementDetailsDoc,
	rehydrateHeavyFields,
} from "./elementDetailsStore"

interface SiblingFileLookup {
	fileItem: FileItem | null
	parentId: string | null
}

function flattenFileItems(files: FileItem[] | undefined): FileItem[] {
	if (!files?.length) return []
	return files.flatMap((file) => [file, ...flattenFileItems(file.children)])
}

function isDesignDataV2(designData: DesignData | null | undefined): boolean {
	return isV2Version(designData?.version)
}

/**
 * 在主文件同级目录下定位 sidecar 文件，并返回其所在目录 id（用于创建新文件）。
 */
function findSiblingFile(
	attachments: FileItem[] | undefined,
	flatAttachments: FileItem[] | undefined,
	mainFileId: string | null,
	targetFileName: string,
): SiblingFileLookup {
	const all = [...(flatAttachments ?? []), ...flattenFileItems(attachments)]
	if (!mainFileId || all.length === 0) {
		return { fileItem: null, parentId: null }
	}

	const mainFile = all.find((item) => item.file_id === mainFileId)
	const parentId = (mainFile as (FileItem & { parent_id?: string }) | undefined)?.parent_id ?? null

	if (parentId) {
		const sibling = all.find(
			(item) =>
				item.file_name === targetFileName &&
				String((item as FileItem & { parent_id?: string }).parent_id ?? "") ===
					String(parentId),
		)
		if (sibling) return { fileItem: sibling, parentId }
	}

	return { fileItem: null, parentId }
}

async function readElementDetailsByFile(fileItem: FileItem | null): Promise<ElementDetailsDoc> {
	if (!fileItem?.file_id) return emptyElementDetailsDoc()
	try {
		const content = (await getFileContentById(fileItem.file_id, {
			responseType: "text",
		})) as string | null
		if (!content || !content.trim()) return emptyElementDetailsDoc()
		return normalizeElementDetailsDoc(JSON.parse(content))
	} catch {
		return emptyElementDetailsDoc()
	}
}

export interface ElementDetailsContext {
	attachments?: FileItem[]
	flatAttachments?: FileItem[]
	mainFileId: string | null
	projectId?: string
}

/**
 * v2 项目：把两个 sidecar 的重字段回填到 designData 元素上（原地）。
 * v1 或缺少定位信息时静默跳过。
 */
export async function hydrateDesignDataDetails(
	designData: DesignData | null,
	ctx: ElementDetailsContext,
): Promise<void> {
	if (!designData || !isDesignDataV2(designData)) return
	const elements = designData.canvas?.elements
	if (!elements?.length) return

	const agentLookup = findSiblingFile(
		ctx.attachments,
		ctx.flatAttachments,
		ctx.mainFileId,
		ELEMENT_DETAILS_FILENAME,
	)
	const userLookup = findSiblingFile(
		ctx.attachments,
		ctx.flatAttachments,
		ctx.mainFileId,
		ELEMENT_DETAILS_USER_FILENAME,
	)

	const [agentDoc, userDoc] = await Promise.all([
		readElementDetailsByFile(agentLookup.fileItem),
		readElementDetailsByFile(userLookup.fileItem),
	])

	rehydrateHeavyFields(elements, userDoc, agentDoc)
}

/**
 * v2 项目：根据内存元素树写出 element-details-user.json。
 * 仅写用户文件，永不触碰后端的 element-details.json。
 */
export async function writeUserElementDetails(
	designData: DesignData,
	ctx: ElementDetailsContext,
): Promise<void> {
	if (!isDesignDataV2(designData) || !ctx.mainFileId) return

	const agentLookup = findSiblingFile(
		ctx.attachments,
		ctx.flatAttachments,
		ctx.mainFileId,
		ELEMENT_DETAILS_FILENAME,
	)
	const agentBaseline = await readElementDetailsByFile(agentLookup.fileItem)

	const userDoc = buildUserElementDetailsDoc(designData.canvas?.elements, agentBaseline)
	const hasEntries = Object.keys(userDoc.elements).length > 0

	const userLookup = findSiblingFile(
		ctx.attachments,
		ctx.flatAttachments,
		ctx.mainFileId,
		ELEMENT_DETAILS_USER_FILENAME,
	)

	let userFileId = userLookup.fileItem?.file_id ?? null

	// 用户文件不存在且当前没有任何用户重字段，无需创建空文件
	if (!userFileId && !hasEntries) return

	if (!userFileId) {
		const parentId = userLookup.parentId ?? agentLookup.parentId
		if (!ctx.projectId || !parentId) return
		try {
			const created = await SuperMagicApi.createFile({
				project_id: ctx.projectId,
				parent_id: parentId,
				file_name: ELEMENT_DETAILS_USER_FILENAME,
				is_directory: false,
				ignore_duplicate: true,
			})
			userFileId = (created as { file_id?: string })?.file_id ?? null
		} catch {
			return
		}
	}

	if (!userFileId) return

	const content = JSON.stringify(userDoc, null, 2)
	try {
		await SuperMagicApi.saveFileContent([
			{ file_id: userFileId, content, enable_shadow: true },
		])
	} catch {
		// 用户 sidecar 写失败不影响主文件保存
	}
}
