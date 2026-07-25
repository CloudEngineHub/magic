import type { DownloadImageOptions } from "@/components/CanvasDesign/public/magic-types"

export interface CanvasMediaDownloadPlan {
	transport: "project-batch" | "client-zip"
	duplicatedFileIds: Set<string>
}

/**
 * 项目批量接口只接收 file_id，无法表达逐元素裁剪或同源多实例。
 * 其余普通多选继续走项目文件的批量下载，避免在画布重复实现传输逻辑。
 */
export function resolveCanvasMediaDownloadPlan(params: {
	fileIds: string[]
	hasImageProcess: boolean
	noWatermark: boolean
	downloadMode?: DownloadImageOptions["downloadMode"]
}): CanvasMediaDownloadPlan {
	const { fileIds, hasImageProcess, noWatermark, downloadMode } = params
	const duplicatedFileIds = new Set(
		fileIds.filter((fileId, index) => fileIds.indexOf(fileId) !== index),
	)
	const canUseProjectBatch =
		!noWatermark &&
		downloadMode !== "normal" &&
		!hasImageProcess &&
		duplicatedFileIds.size === 0

	return {
		transport: canUseProjectBatch ? "project-batch" : "client-zip",
		duplicatedFileIds,
	}
}
