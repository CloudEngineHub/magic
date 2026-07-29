import { SuperMagicApi } from "@/apis"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignData } from "../types"
import { MAGIC_PROJECT_VERSION_V1, MAGIC_PROJECT_VERSION_V2 } from "./magicProjectCompression"
import {
	generateMagicProjectJsContent,
	loadMagicProjectJsContent,
	parseMagicProjectJsContentWithDiagnostics,
} from "./utils"
import { writeUserElementDetails } from "./elementDetailsIo"

/**
 * 检查画布是否需要升级（v1 → v2）
 */
export function needsUpgrade(designData: DesignData): boolean {
	return designData.version === MAGIC_PROJECT_VERSION_V1
}

export interface UpgradeContext {
	magicProjectJsFileId: string
	projectId: string
	attachments?: FileItem[]
	flatAttachments?: FileItem[]
	designProjectBasePath?: string
}

export interface UpgradeProgress {
	step: "backup" | "convert" | "save-main" | "save-details" | "done"
	percent: number
}

const DESIGN_UPGRADE_LOG_PREFIX = "[DesignVersionUpgrade]"

function isSafeCanvasStatusForUpgrade(canvasStatus: string): boolean {
	return canvasStatus === "valid-empty" || canvasStatus === "valid-non-empty"
}

/**
 * 执行 v1 → v2 画布升级
 *
 * 流程：
 * 1. 将原 magic.project.js 复制一份为 magic.project.v1.js（备份）
 * 2. 将 designData 的 version 升级为 v2
 * 3. 生成 v2 格式的 magic.project.js 内容（canvas 压缩 + 重字段剥离）
 * 4. 保存新的 magic.project.js
 * 5. 将重字段写入 element-details-user.json
 */
export async function upgradeCanvasToV2(
	designData: DesignData,
	ctx: UpgradeContext,
	onProgress?: (progress: UpgradeProgress) => void,
): Promise<DesignData> {
	const { magicProjectJsFileId, projectId, attachments, flatAttachments, designProjectBasePath } =
		ctx

	// Step 1: 备份 — 将原始内容保存为 magic.project.v1.js
	onProgress?.({ step: "backup", percent: 10 })

	const originalContent = await loadMagicProjectJsContent(magicProjectJsFileId)
	const originalParse = parseMagicProjectJsContentWithDiagnostics(originalContent)
	if (!isSafeCanvasStatusForUpgrade(originalParse.canvasStatus)) {
		console.warn(
			DESIGN_UPGRADE_LOG_PREFIX,
			JSON.stringify({
				event: "blocked-unsafe-v1-upgrade",
				canvasStatus: originalParse.canvasStatus,
				error: originalParse.error,
				magicProjectJsFileId,
				designElementCount: designData.canvas?.elements?.length ?? 0,
			}),
		)
		throw new Error(`Unsafe canvas status for v1 upgrade: ${originalParse.canvasStatus}`)
	}
	const originalDesignData = originalParse.data
	if (!originalDesignData?.canvas) {
		throw new Error(`Unsafe canvas status for v1 upgrade: ${originalParse.canvasStatus}`)
	}

	// 获取原文件的 parent_id
	const allFiles = [...(flatAttachments ?? []), ...(attachments ?? [])]
	const mainFile = allFiles.find((f) => f.file_id === magicProjectJsFileId) as
		| (FileItem & { parent_id?: string })
		| undefined
	const parentId = mainFile?.parent_id

	if (parentId) {
		try {
			// 创建备份文件
			const backupFile = await SuperMagicApi.createFile({
				project_id: projectId,
				parent_id: parentId,
				file_name: "magic.project.v1.js",
				is_directory: false,
				ignore_duplicate: true,
			})
			const backupFileId = (backupFile as { file_id?: string })?.file_id
			if (backupFileId) {
				await SuperMagicApi.saveFileContent([
					{ file_id: backupFileId, content: originalContent },
				])
			}
		} catch {
			// 备份失败不阻塞升级
		}
	}

	// Step 2: 转换 — 将 version 改为 v2
	onProgress?.({ step: "convert", percent: 30 })

	const upgradedDesignData: DesignData = {
		...designData,
		version: MAGIC_PROJECT_VERSION_V2,
		canvas: { ...originalDesignData.canvas },
	}

	// Step 3: 保存主文件（v2 格式：canvas 压缩 + 重字段剥离）
	onProgress?.({ step: "save-main", percent: 50 })

	const v2Content = generateMagicProjectJsContent(upgradedDesignData, {
		projectBasePath: designProjectBasePath,
		flatAttachments,
	})
	await SuperMagicApi.saveFileContent([
		{ file_id: magicProjectJsFileId, content: v2Content, enable_shadow: true },
	])

	// Step 4: 将重字段写入 element-details-user.json
	onProgress?.({ step: "save-details", percent: 80 })

	await writeUserElementDetails(upgradedDesignData, {
		attachments,
		flatAttachments,
		mainFileId: magicProjectJsFileId,
		projectId,
	})

	onProgress?.({ step: "done", percent: 100 })

	return upgradedDesignData
}
