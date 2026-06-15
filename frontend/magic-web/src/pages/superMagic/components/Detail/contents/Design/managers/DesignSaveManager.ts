import type { DesignData } from "../types"
import {
	generateMagicProjectJsContent,
	resolveDesignDirectoryNameFromAttachments,
	resolveDesignProjectBasePathFromAttachments,
} from "../utils/utils"
import { hashDesignDataComparable } from "../utils/designContentHash"
import { writeUserElementDetails } from "../utils/elementDetailsIo"
import { isV2Version } from "../utils/magicProjectCompression"
import { SuperMagicApi } from "@/apis"
import type { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"
import { type DesignProjectStateBag, type DesignProjectManagerOptions } from "./types"

const AUTO_SAVE_DEBOUNCE_MS = 3000

export interface RemoteUpdateCheckResult {
	hasUpdate: boolean
	currentVersion: number | null
	isCheckReliable: boolean
}

export interface DesignSaveLifecycleHandlers {
	onSaveStart?: () => number | null
	onSaveEnd?: (
		saveToken: number | null | undefined,
		didSave: boolean,
		savedUpdatedAt?: string | null,
	) => Promise<void> | void
}

export class DesignSaveManager {
	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions
	private fetchAndSetVersions: () => Promise<FileHistoryVersion[]>
	private saveLifecycleHandlers: DesignSaveLifecycleHandlers

	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private hasRemoteConflictPending = false
	private lastSaveFullyPersisted = false

	constructor(
		stateBag: DesignProjectStateBag,
		options: DesignProjectManagerOptions,
		fetchAndSetVersions: () => Promise<FileHistoryVersion[]>,
		saveLifecycleHandlers: DesignSaveLifecycleHandlers = {},
	) {
		this.stateBag = stateBag
		this.options = options
		this.fetchAndSetVersions = fetchAndSetVersions
		this.saveLifecycleHandlers = saveLifecycleHandlers
	}

	updateOptions(options: DesignProjectManagerOptions) {
		this.options = options
	}

	updateFetchAndSetVersions(fn: () => Promise<FileHistoryVersion[]>) {
		this.fetchAndSetVersions = fn
	}

	private getProjectBasePathForDsl(): string | undefined {
		return resolveDesignProjectBasePathFromAttachments(this.options)
	}

	private getDesignDataForSave(
		designData: DesignData = this.stateBag.getDesignData(),
	): DesignData {
		const directoryName = resolveDesignDirectoryNameFromAttachments(this.options)
		if (!directoryName || directoryName === designData.name) {
			return designData
		}
		return {
			...designData,
			name: directoryName,
		}
	}

	scheduleAutoSave(): void {
		this.runDebouncedSave()
	}

	cancelAutoSave(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		this.stateBag.setters.setIsSaving(false)
	}

	async manualSave(): Promise<boolean> {
		this.cancelAutoSave()
		this.stateBag.setters.setIsSaving(true)
		return this.commitSave({ allowRemoteConflict: true })
	}

	syncDesignData(newDesignData: DesignData): void {
		this.stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(newDesignData))
		this.clearRemoteConflict()
	}

	hasPendingAutoSave(): boolean {
		return this.debounceTimer !== null
	}

	isLocalDirty(): boolean {
		const prevFingerprint = this.stateBag.getPrevDesignDataFingerprint()
		if (!prevFingerprint) return false
		const currentData = this.getDesignDataForSave()
		return hashDesignDataComparable(currentData) !== prevFingerprint
	}

	hasRemoteConflict(): boolean {
		return this.hasRemoteConflictPending
	}

	markRemoteConflict(): void {
		this.hasRemoteConflictPending = true
	}

	clearRemoteConflict(): void {
		this.hasRemoteConflictPending = false
	}

	wasLastSaveFullyPersisted(): boolean {
		return this.lastSaveFullyPersisted
	}

	private runDebouncedSave(): void {
		const fileId = this.stateBag.getMagicProjectJsFileId()
		if (!fileId) return

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null
			const currentData = this.stateBag.getDesignData()
			const fp = hashDesignDataComparable(currentData)

			if (!this.stateBag.getPrevDesignDataFingerprint()) {
				this.stateBag.setPrevDesignDataFingerprint(fp)
				return
			}
			if (this.stateBag.getPrevDesignDataFingerprint() === fp) {
				this.stateBag.setters.setIsSaving(false)
				return
			}

			this.stateBag.setters.setIsSaving(true)
			void this.commitSave()
		}, AUTO_SAVE_DEBOUNCE_MS)
	}

	async commitSave(options?: { allowRemoteConflict?: boolean }): Promise<boolean> {
		this.lastSaveFullyPersisted = false
		if (this.stateBag.getIsReadOnly()) {
			this.stateBag.setters.setIsSaving(false)
			return false
		}
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) {
			this.stateBag.setters.setIsSaving(false)
			return false
		}
		if (this.hasRemoteConflict() && !options?.allowRemoteConflict) {
			this.stateBag.setters.setIsSaving(false)
			return false
		}

		let saveToken: number | null | undefined
		let didSave = false
		let savedUpdatedAt: string | null = null
		try {
			saveToken = this.saveLifecycleHandlers.onSaveStart?.()
			const { hasUpdate } = await this.checkRemoteUpdate()
			if (hasUpdate) {
				this.markRemoteConflict()
				this.stateBag.setters.setIsSaving(false)
				return false
			}

			const currentDesignData = this.stateBag.getDesignData()
			const designDataToSave = this.getDesignDataForSave(currentDesignData)
			const fp = hashDesignDataComparable(designDataToSave)
			const content = generateMagicProjectJsContent(designDataToSave, {
				projectBasePath: this.getProjectBasePathForDsl(),
			})
			if (!content?.trim()) {
				this.stateBag.setters.setIsSaving(false)
				return false
			}

			const saveResponse = await SuperMagicApi.saveFileContent([
				{ file_id: magicProjectJsFileId, content, enable_shadow: true },
			])
			didSave = true
			savedUpdatedAt = saveResponse?.success_files?.[0]?.data?.updated_at ?? null

			// v2：主文件保存成功后写用户 sidecar（仅写 element-details-user.json）
			let didPersistDetails = true
			if (isV2Version(designDataToSave.version)) {
				didPersistDetails = await writeUserElementDetails(designDataToSave, {
					attachments: this.options.attachments,
					flatAttachments: this.options.flatAttachments,
					mainFileId: magicProjectJsFileId,
					projectId: this.options.projectId,
				})
			}
			this.lastSaveFullyPersisted = didPersistDetails
			if (designDataToSave !== currentDesignData) {
				this.stateBag.setters.setDesignData(designDataToSave)
			}
			if (didPersistDetails) {
				this.stateBag.setPrevDesignDataFingerprint(fp)
			}
			this.clearRemoteConflict()

			if (!this.options.isShareRoute) {
				try {
					const fileInfo = await SuperMagicApi.getFileInfo({
						file_id: magicProjectJsFileId,
					})
					if (fileInfo?.version !== undefined) {
						this.stateBag.setMagicProjectJsVersion(fileInfo.version)
					}
				} catch {
					// ignore
				}
				await this.fetchAndSetVersions()
			}
			return true
		} finally {
			await this.saveLifecycleHandlers.onSaveEnd?.(saveToken, didSave, savedUpdatedAt)
			this.stateBag.setters.setIsSaving(false)
		}
	}

	async checkRemoteUpdate(): Promise<RemoteUpdateCheckResult> {
		if (this.options.isShareRoute) {
			return { hasUpdate: false, currentVersion: null, isCheckReliable: true }
		}
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) {
			return { hasUpdate: false, currentVersion: null, isCheckReliable: true }
		}

		try {
			const fileInfo = await SuperMagicApi.getFileInfo({ file_id: magicProjectJsFileId })
			if (fileInfo?.version === undefined) {
				return { hasUpdate: false, currentVersion: null, isCheckReliable: false }
			}

			const currentVersion = fileInfo.version
			const prevVersion = this.stateBag.getMagicProjectJsVersion()

			if (prevVersion === null) {
				this.stateBag.setMagicProjectJsVersion(currentVersion)
				return { hasUpdate: false, currentVersion, isCheckReliable: false }
			}

			return {
				hasUpdate: currentVersion > prevVersion,
				currentVersion,
				isCheckReliable: true,
			}
		} catch {
			return { hasUpdate: false, currentVersion: null, isCheckReliable: false }
		}
	}

	updateLocalVersion(version: number): void {
		this.stateBag.setMagicProjectJsVersion(version)
	}

	generateContent(data?: DesignData): string {
		return generateMagicProjectJsContent(this.getDesignDataForSave(data), {
			projectBasePath: this.getProjectBasePathForDsl(),
		})
	}
}
