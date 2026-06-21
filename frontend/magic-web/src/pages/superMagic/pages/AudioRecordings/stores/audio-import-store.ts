import { makeAutoObservable, runInAction } from "mobx"
import i18next from "i18next"
import { ossUploadService } from "@/stores/folderUpload/uploadService"
import { audioRecordingsStore } from "./audio-recordings-store"
import { audioRecordingsService } from "@/services/audioRecordings/AudioRecordingsService"
import { SuperMagicApi, FileApi } from "@/apis"
import { superMagicUploadTokenService } from "@/pages/superMagic/components/MessageEditor/services/UploadTokenService"
import magicToast from "@/components/base/MagicToaster/utils"
import { buildOptimisticRecordingItem } from "../utils/build-optimistic-recording-item"
import { getCachedRecordingSettings } from "../hooks/useRecordingSettings"
import { getRecordingTopicModel } from "../apis/recording-settings-api"
import { resolveAutoSummaryEnabled } from "../utils/recording-settings-mapper"

// Common audio extensions for validation
const COMMON_AUDIO_EXTENSIONS = [".raw", ".wav", ".mp3", ".ogg", ".webm", ".m4a"]
// Some video formats that commonly contain audio and are acceptable
const AUDIO_COMPATIBLE_VIDEO_EXTENSIONS = [".mp4", ".mov", ".3gp", ".mkv", ".avi"]

/**
 * Interface representing a single audio import task.
 */
export interface AudioImportTask {
	projectId: string
	projectName: string
	topicId: string
	workspaceId: string
	modelId: string
	taskKey: string
	progress: number // 0 to 1
	status: "transferring" | "done" | "failed"
	file: File
}

/**
 * Global MobX store managing the lifecycle of local audio file imports.
 * This store is a singleton that lives outside the React render tree,
 * ensuring uploads are not cancelled when switching pages in the SPA.
 */
export class AudioImportStore {
	// Active import tasks indexed by project ID
	importingTasks = new Map<string, AudioImportTask>()

	readonly MAX_UPLOAD_COUNT = 1
	readonly MAX_UPLOAD_SIZE = 500 * 1024 * 1024 // 500MB

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	/**
	 * Computes whether there is currently any uploading task.
	 */
	get hasUploadingTasks(): boolean {
		return Array.from(this.importingTasks.values()).some((t) => t.status === "transferring")
	}

	/**
	 * Retrieves the task associated with a specific project ID.
	 */
	getTask(projectId: string): AudioImportTask | undefined {
		return this.importingTasks.get(projectId)
	}

	/**
	 * Checks if a file is a likely audio file by its MIME type or extension.
	 */
	private isAudioOrVideoFile(file: File): boolean {
		if (file.type) {
			if (file.type.startsWith("audio/") || file.type === "video/webm") {
				return true
			}
		}

		const fileName = file.name.toLowerCase()
		const fileExtension = `.${fileName.split(".").pop()}`

		return (
			COMMON_AUDIO_EXTENSIONS.includes(fileExtension) ||
			AUDIO_COMPATIBLE_VIDEO_EXTENSIONS.includes(fileExtension)
		)
	}

	/**
	 * Validates files based on size, count and file type constraints.
	 * Returns true if validation passes, otherwise raises toast warnings and returns false.
	 */
	private validateFiles(files: File[]): boolean {
		// 1. Validate file count
		if (files.length === 0) {
			return false
		}
		if (files.length > this.MAX_UPLOAD_COUNT) {
			const errorMsg = i18next.t("fileUpload.maxFilesReached", {
				ns: "super",
				maxCount: this.MAX_UPLOAD_COUNT,
				defaultValue: `Cannot upload more than ${this.MAX_UPLOAD_COUNT} files`,
			})
			magicToast.error(errorMsg)
			return false
		}

		// 2. Validate file size and format for each file
		for (const file of files) {
			if (file.size > this.MAX_UPLOAD_SIZE) {
				const maxSizeMB = Math.round(this.MAX_UPLOAD_SIZE / (1024 * 1024))
				const errorMsg = i18next.t("recordingSummary.audioUpload.error.fileTooLarge", {
					ns: "super",
					maxSize: maxSizeMB,
					defaultValue: `File size exceeds ${maxSizeMB}MB limit`,
				})
				magicToast.error(errorMsg)
				return false
			}

			if (!this.isAudioOrVideoFile(file)) {
				const errorMsg = i18next.t("recordingSummary.audioUpload.error.notAudioFile", {
					ns: "super",
					defaultValue:
						"Selected file doesn't appear to be a valid audio file. Please select a valid audio file.",
				})
				magicToast.error(errorMsg)
				return false
			}
		}

		return true
	}

	/**
	 * Reads auto-summary preference from cache or persisted default_audio settings.
	 */
	private async resolveAutoSummaryEnabled(): Promise<boolean> {
		const cachedSettings = getCachedRecordingSettings()
		if (cachedSettings) return cachedSettings.auto_summary_enabled

		const settingsResponse = await getRecordingTopicModel().catch(() => null)
		return resolveAutoSummaryEnabled(null, settingsResponse)
	}

	/**
	 * Initiates the audio file import and upload process.
	 * Registers the task in MobX, delegates the upload to ossUploadService,
	 * and fires backend integration APIs upon completion.
	 */
	async startAudioImport(
		files: File[],
		context: {
			projectId: string
			projectName: string
			topicId: string
			workspaceId: string
			modelId: string
			taskKey: string
		},
	): Promise<void> {
		const { projectId, projectName, topicId, workspaceId, modelId, taskKey } = context

		// Perform client-side constraints validation
		if (!this.validateFiles(files)) {
			return
		}

		const targetFile = files[0]

		// Add new task to the local map
		runInAction(() => {
			this.importingTasks.set(projectId, {
				projectId,
				projectName,
				topicId,
				workspaceId,
				modelId,
				taskKey,
				progress: 0,
				status: "transferring",
				file: targetFile,
			})
		})

		try {
			// Trigger file upload using global upload service
			await ossUploadService.uploadFiles(
				[{ file: targetFile, relativePath: targetFile.name, folderPath: "", targetPath: "" }],
				projectId,
				"", // Folder path not needed for private summary files
				projectId, // Use project ID as taskId for task-level management
				undefined,
				// onProgress handler
				(fileId, uploadedBytes) => {
					const progress = Math.min(uploadedBytes / targetFile.size, 0.99)
					runInAction(() => {
						const task = this.importingTasks.get(projectId)
						if (task) {
							task.progress = progress
						}
					})
					// Sync progress to the global list store optimistic item
					audioRecordingsStore.updateOptimisticItemTransfer(projectId, "transferring", progress)
				},
				// onFileCompleted handler
				async (fileId, uploadResult) => {
					try {
						// 1. Report upload to obtain file key mapping
						await FileApi.reportFileUploads([
							{
								file_extension: uploadResult.file_extension || uploadResult.file_name.split(".").pop() || "",
								file_key: uploadResult.file_key,
								file_size: uploadResult.file_size,
								file_name: uploadResult.file_name,
							},
						])

						// 2. Save file record to project
						const saveRes = await superMagicUploadTokenService.saveFileToProject({
							project_id: projectId,
							topic_id: topicId,
							parent_id: "",
							file_key: uploadResult.file_key,
							file_name: uploadResult.file_name,
							file_size: uploadResult.file_size,
							file_type: "user_upload",
							storage_type: "workspace",
							source: "RecordSummary",
						})

						// 2. Build finalized optimistic project object
						const autoSummaryEnabled = await this.resolveAutoSummaryEnabled()
						const completedProject = buildOptimisticRecordingItem({
							projectId,
							projectName,
							workspaceId,
							modelId,
							audioFileId: saveRes?.file_id,
							taskKey,
							audioSource: "imported",
							topicId,
							autoSummaryEnabled,
						})
						completedProject.transferStatus = "done"

						// Push item to store; summarizing vs manual-summary card depends on settings.
						audioRecordingsStore.addOptimisticItem(completedProject)

						if (autoSummaryEnabled) {
							await audioRecordingsService.submitSummary(completedProject, modelId)
						}

						runInAction(() => {
							this.importingTasks.delete(projectId)
						})
					} catch (error) {
						console.error("Failed to finalize audio project save or summary:", error)
						this.handleImportFailed(projectId)
					}
				},
			)
		} catch (error) {
			console.error("OSS Upload failed for audio project:", error)
			this.handleImportFailed(projectId)
		}
	}

	/**
	 * Retries a previously failed import task.
	 */
	async retryImport(projectId: string): Promise<void> {
		const task = this.importingTasks.get(projectId)
		if (!task) return

		// Reset progress and status on retry
		runInAction(() => {
			task.progress = 0
			task.status = "transferring"
		})
		audioRecordingsStore.updateOptimisticItemTransfer(projectId, "transferring", 0)

		await this.startAudioImport([task.file], {
			projectId: task.projectId,
			projectName: task.projectName,
			topicId: task.topicId,
			workspaceId: task.workspaceId,
			modelId: task.modelId,
			taskKey: task.taskKey,
		})
	}

	/**
	 * Cancels an ongoing upload task.
	 */
	cancelImport(projectId: string): void {
		const task = this.importingTasks.get(projectId)
		if (!task) return

		// Cancel task execution via the OSS upload service
		ossUploadService.cancelTaskUploads(projectId)

		runInAction(() => {
			this.importingTasks.delete(projectId)
		})
		audioRecordingsStore.clearOptimisticItem(projectId)
	}

	/**
	 * Clears the record of a task from the map.
	 */
	clearTask(projectId: string): void {
		runInAction(() => {
			this.importingTasks.delete(projectId)
		})
	}

	/**
	 * Handles failure states gracefully and updates stores.
	 */
	private handleImportFailed(projectId: string): void {
		runInAction(() => {
			const task = this.importingTasks.get(projectId)
			if (task) {
				task.status = "failed"
			}
		})
		audioRecordingsStore.updateOptimisticItemTransfer(projectId, "failed")
		const errorMsg = i18next.t("audioRecordings:summary.submitFailed", {
			defaultValue: "Failed to upload and submit summary",
		})
		magicToast.error(errorMsg)
	}
}

// Export singleton instance of the store
export const audioImportStore = new AudioImportStore()
