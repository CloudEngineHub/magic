import type { BatchSaveInfo } from "@/stores/folderUpload/types"
import { uploadLogger } from "./uploadLogger"

export const UPLOAD_DEFER_REFRESH_PROJECT_FILE_THRESHOLD = 1000

export interface ProjectAttachmentsTreeItem {
	children?: ProjectAttachmentsTreeItem[]
}

interface UploadRefreshControllerOptions {
	uploadType: "file" | "folder"
	currentProjectFileCount: number
	uploadFileCount: number
	onUpdateAttachments?: () => void
}

interface UploadRefreshCoordinatorOptions {
	uploadType: "file" | "folder"
	projectFiles?: ProjectAttachmentsTreeItem[]
	currentProjectFileCount?: number
	uploadFileCount: number
	expectedTaskCount?: number
	onUpdateAttachments?: () => void
}

interface UploadTaskStats {
	createdTaskCount: number
	taskCreateFailedCount: number
	settledTaskCount: number
	taskErrorCount: number
	expectedTaskCount: number
}

export type UploadRefreshReason =
	| "batchSaveComplete"
	| "taskComplete"
	| "taskError"
	| "allFileUploadTasksSettled"

export function countProjectAttachmentsTreeItems(items: ProjectAttachmentsTreeItem[] = []): number {
	let count = 0
	const stack = [...items]

	while (stack.length > 0) {
		const item = stack.pop()
		if (!item) continue

		count += 1
		const children = Array.isArray(item.children) ? item.children : []
		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push(children[index])
		}
	}

	return count
}

export function createUploadRefreshController({
	uploadType,
	currentProjectFileCount,
	uploadFileCount,
	onUpdateAttachments,
}: UploadRefreshControllerOptions) {
	const expectedProjectFileCount = currentProjectFileCount + uploadFileCount
	const shouldDeferRefresh =
		expectedProjectFileCount > UPLOAD_DEFER_REFRESH_PROJECT_FILE_THRESHOLD
	let hasPendingRefresh = false

	function refreshAttachments(reason: UploadRefreshReason, data: Record<string, unknown> = {}) {
		uploadLogger.log("refreshAttachments", {
			uploadType,
			reason,
			currentProjectFileCount,
			uploadFileCount,
			expectedProjectFileCount,
			deferred: shouldDeferRefresh,
			...data,
		})
		onUpdateAttachments?.()
	}

	return {
		shouldDeferRefresh,
		requestBatchRefresh(reason: UploadRefreshReason, data: Record<string, unknown> = {}) {
			if (shouldDeferRefresh) {
				hasPendingRefresh = true
				uploadLogger.log("deferAttachmentsRefresh", {
					uploadType,
					reason,
					currentProjectFileCount,
					uploadFileCount,
					expectedProjectFileCount,
					threshold: UPLOAD_DEFER_REFRESH_PROJECT_FILE_THRESHOLD,
					...data,
				})
				return
			}

			refreshAttachments(reason, data)
		},
		flushDeferredRefresh(reason: UploadRefreshReason, data: Record<string, unknown> = {}) {
			if (!shouldDeferRefresh || !hasPendingRefresh) return

			hasPendingRefresh = false
			refreshAttachments(reason, {
				...data,
				deferredBatchRefresh: true,
			})
		},
	}
}

export function createUploadRefreshCoordinator({
	uploadType,
	projectFiles = [],
	currentProjectFileCount = countProjectAttachmentsTreeItems(projectFiles),
	uploadFileCount,
	expectedTaskCount = uploadType === "file" ? uploadFileCount : 1,
	onUpdateAttachments,
}: UploadRefreshCoordinatorOptions) {
	const refreshController = createUploadRefreshController({
		uploadType,
		currentProjectFileCount,
		uploadFileCount,
		onUpdateAttachments,
	})
	let createdTaskCount = 0
	let taskCreateFailedCount = 0
	let settledTaskCount = 0
	let taskErrorCount = 0

	function getStats(): UploadTaskStats {
		return {
			createdTaskCount,
			taskCreateFailedCount,
			settledTaskCount,
			taskErrorCount,
			expectedTaskCount,
		}
	}

	function flushWhenAllTasksSettled(data: Record<string, unknown> = {}) {
		if (settledTaskCount + taskCreateFailedCount < expectedTaskCount) return

		refreshController.flushDeferredRefresh("allFileUploadTasksSettled", {
			...getStats(),
			...data,
		})
	}

	return {
		shouldDeferRefresh: refreshController.shouldDeferRefresh,
		currentProjectFileCount,
		getStats,
		markTaskCreated(data: Record<string, unknown> = {}) {
			createdTaskCount += 1
			uploadLogger.log("uploadTaskCreated", {
				uploadType,
				currentProjectFileCount,
				uploadFileCount,
				...getStats(),
				...data,
			})
		},
		markTaskCreateFailed(data: Record<string, unknown> = {}) {
			taskCreateFailedCount += 1
			uploadLogger.log("uploadTaskCreateFailed", {
				uploadType,
				currentProjectFileCount,
				uploadFileCount,
				...getStats(),
				...data,
			})
			flushWhenAllTasksSettled(data)
		},
		handleFileTaskComplete(taskId: string, data: Record<string, unknown> = {}) {
			settledTaskCount += 1
			uploadLogger.log("uploadTaskSettled", {
				uploadType,
				taskId,
				status: "completed",
				currentProjectFileCount,
				uploadFileCount,
				deferredRefresh: refreshController.shouldDeferRefresh,
				...getStats(),
				...data,
			})
			flushWhenAllTasksSettled(data)
		},
		handleFileTaskError(taskId: string, data: Record<string, unknown> = {}) {
			settledTaskCount += 1
			taskErrorCount += 1
			uploadLogger.log("uploadTaskSettled", {
				uploadType,
				taskId,
				status: "failed",
				currentProjectFileCount,
				uploadFileCount,
				deferredRefresh: refreshController.shouldDeferRefresh,
				...getStats(),
				...data,
			})
			flushWhenAllTasksSettled(data)
		},
		handleBatchSaveComplete(batchSaveInfo: BatchSaveInfo, data: Record<string, unknown> = {}) {
			if (batchSaveInfo.savedFilesCount <= 0) return

			refreshController.requestBatchRefresh("batchSaveComplete", {
				taskId: batchSaveInfo.taskId,
				savedFilesCount: batchSaveInfo.savedFilesCount,
				totalProcessedFiles: batchSaveInfo.totalProcessedFiles,
				fileIds: batchSaveInfo.savedFiles
					.map((file) => file.file_id)
					.filter((fileId): fileId is string => Boolean(fileId)),
				...data,
			})
		},
		flushDeferredRefresh(reason: UploadRefreshReason, data: Record<string, unknown> = {}) {
			refreshController.flushDeferredRefresh(reason, {
				...getStats(),
				...data,
			})
		},
	}
}
