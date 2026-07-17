import { cloneDeep } from "lodash-es"
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

function getTopLevelElementCount(data: DesignData | null | undefined): number {
	return data?.canvas?.elements?.length ?? 0
}

function normalizeElementIds(ids?: string[]): string[] {
	return ids?.length ? Array.from(new Set(ids)) : []
}

export interface RemoteUpdateCheckResult {
	hasUpdate: boolean
	currentVersion: number | null
	isCheckReliable: boolean
}

export type DesignSaveFailureReason =
	| "readonly"
	| "no-file"
	| "remote-conflict"
	| "remote-updated"
	| "remote-check-unreliable"
	| "empty-content"
	| "unsafe-empty-canvas"
	| "error"

export type DesignSaveSource =
	| "canvas-patch"
	| "canvas-full-export"
	| "draft-restore"
	| "manual-refresh-draft"
	| "version-upgrade"
	| "version-switch"
	| "remote-apply"
	| "remote-merge"
	| "conflict-resolution"
	| "manual-save"
	| "unknown-auto"

export interface DesignSaveMetadata {
	source?: DesignSaveSource
	deletedElementIds?: string[]
	beforeElementCount?: number
	nextElementCount?: number
	isRemoteApplying?: boolean
	fromDraft?: boolean
	fromUpgrade?: boolean
}

export interface DesignSaveContext {
	designData: DesignData
	source: DesignSaveSource
	beforeElementCount: number
	nextElementCount: number
	deletedElementIds: string[]
	magicProjectJsVersion: number | null
	isRemoteApplying: boolean
	fromDraft: boolean
	fromUpgrade: boolean
}

export type DesignSaveResult =
	| {
			ok: true
			savedVersion: number | null
			savedUpdatedAt: string | null
			fullyPersisted: boolean
			savedDesignData: DesignData
			savedFingerprint: string
	  }
	| {
			ok: false
			reason: DesignSaveFailureReason
			remoteVersion?: number | null
			isCheckReliable?: boolean
			error?: string
	  }

export interface DesignSaveLifecycleHandlers {
	onSaveStart?: () => number | null
	onSaveEnd?: (
		saveToken: number | null | undefined,
		didSave: boolean,
		savedUpdatedAt?: string | null,
	) => Promise<void> | void
	onAutoSaveResult?: (result: DesignSaveResult) => Promise<void> | void
	shouldBlockEmptyCanvasSave?: (context: DesignSaveContext) => boolean
}

export class DesignSaveManager {
	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions
	private fetchAndSetVersions: () => Promise<FileHistoryVersion[]>
	private saveLifecycleHandlers: DesignSaveLifecycleHandlers

	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private pendingAutoSaveDesignData: DesignData | null = null
	private pendingAutoSaveMetadata: DesignSaveMetadata | null = null
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

	private normalizeSaveMetadata(metadata?: DesignSaveMetadata): DesignSaveMetadata | null {
		if (!metadata) return null
		return {
			...metadata,
			deletedElementIds: normalizeElementIds(metadata.deletedElementIds),
		}
	}

	scheduleAutoSave(designData?: DesignData, metadata?: DesignSaveMetadata): void {
		this.pendingAutoSaveDesignData = designData ? (cloneDeep(designData) as DesignData) : null
		this.pendingAutoSaveMetadata = this.normalizeSaveMetadata(metadata)
		this.runDebouncedSave()
	}

	cancelAutoSave(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		this.pendingAutoSaveDesignData = null
		this.pendingAutoSaveMetadata = null
		this.stateBag.setters.setIsSaving(false)
	}

	async manualSave(): Promise<DesignSaveResult> {
		this.cancelAutoSave()
		this.stateBag.setters.setIsSaving(true)
		return this.commitSave({ allowRemoteConflict: true, source: "manual-save" })
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
		if (!fileId) {
			return
		}

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null
			const explicitSaveData = this.pendingAutoSaveDesignData
			const metadata = this.pendingAutoSaveMetadata
			this.pendingAutoSaveDesignData = null
			this.pendingAutoSaveMetadata = null
			const currentData = explicitSaveData ?? this.stateBag.getDesignData()
			const designDataToSave = this.getDesignDataForSave(currentData)
			const fp = hashDesignDataComparable(designDataToSave)
			const prevFp = this.stateBag.getPrevDesignDataFingerprint()

			if (!prevFp) {
				this.stateBag.setPrevDesignDataFingerprint(fp)
				return
			}
			if (prevFp === fp) {
				this.stateBag.setters.setIsSaving(false)
				return
			}

			this.stateBag.setters.setIsSaving(true)
			void this.commitSave({
				designData: explicitSaveData ?? undefined,
				updateCurrentDesignData: !explicitSaveData,
				source: metadata?.source,
				deletedElementIds: metadata?.deletedElementIds,
				beforeElementCount: metadata?.beforeElementCount,
				nextElementCount: metadata?.nextElementCount,
				isRemoteApplying: metadata?.isRemoteApplying,
				fromDraft: metadata?.fromDraft,
				fromUpgrade: metadata?.fromUpgrade,
			}).then((result) => this.saveLifecycleHandlers.onAutoSaveResult?.(result))
		}, AUTO_SAVE_DEBOUNCE_MS)
	}

	private buildSaveContext(
		designDataToSave: DesignData,
		source: DesignSaveSource,
		options?: DesignSaveMetadata,
	): DesignSaveContext {
		const deletedElementIds = normalizeElementIds(options?.deletedElementIds)
		const beforeElementCount =
			options?.beforeElementCount ?? getTopLevelElementCount(this.stateBag.getDesignData())
		const nextElementCount =
			options?.nextElementCount ?? getTopLevelElementCount(designDataToSave)

		return {
			designData: designDataToSave,
			source,
			beforeElementCount,
			nextElementCount,
			deletedElementIds,
			magicProjectJsVersion: this.stateBag.getMagicProjectJsVersion(),
			isRemoteApplying: options?.isRemoteApplying ?? false,
			fromDraft: options?.fromDraft ?? source === "draft-restore",
			fromUpgrade: options?.fromUpgrade ?? source === "version-upgrade",
		}
	}

	async commitSave(options?: {
		allowRemoteConflict?: boolean
		designData?: DesignData
		updateCurrentDesignData?: boolean
		skipRemoteUpdateCheck?: boolean
		source?: DesignSaveSource
		deletedElementIds?: string[]
		beforeElementCount?: number
		nextElementCount?: number
		isRemoteApplying?: boolean
		fromDraft?: boolean
		fromUpgrade?: boolean
	}): Promise<DesignSaveResult> {
		this.lastSaveFullyPersisted = false
		if (this.stateBag.getIsReadOnly()) {
			this.stateBag.setters.setIsSaving(false)
			return { ok: false, reason: "readonly" }
		}
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) {
			this.stateBag.setters.setIsSaving(false)
			return { ok: false, reason: "no-file" }
		}
		if (this.hasRemoteConflict() && !options?.allowRemoteConflict) {
			this.stateBag.setters.setIsSaving(false)
			return { ok: false, reason: "remote-conflict" }
		}

		let saveToken: number | null | undefined
		let didSave = false
		let savedUpdatedAt: string | null = null
		let savedVersion: number | null = null
		try {
			saveToken = this.saveLifecycleHandlers.onSaveStart?.()
			if (!options?.skipRemoteUpdateCheck) {
				const remoteUpdateCheck = await this.checkRemoteUpdate()
				const { hasUpdate, isCheckReliable, currentVersion } = remoteUpdateCheck
				if (hasUpdate) {
					this.markRemoteConflict()
					this.stateBag.setters.setIsSaving(false)
					return {
						ok: false,
						reason: "remote-updated",
						remoteVersion: currentVersion,
						isCheckReliable,
					}
				}
				if (!isCheckReliable) {
					this.stateBag.setters.setIsSaving(false)
					return {
						ok: false,
						reason: "remote-check-unreliable",
						remoteVersion: currentVersion,
						isCheckReliable,
					}
				}
			}

			const currentDesignData = options?.designData ?? this.stateBag.getDesignData()
			const designDataToSave = this.getDesignDataForSave(currentDesignData)
			const saveSource = options?.source ?? "unknown-auto"
			const saveContext = this.buildSaveContext(designDataToSave, saveSource, options)
			if (this.saveLifecycleHandlers.shouldBlockEmptyCanvasSave?.(saveContext)) {
				this.stateBag.setters.setIsSaving(false)
				return { ok: false, reason: "unsafe-empty-canvas" }
			}
			const fp = hashDesignDataComparable(designDataToSave)
			const content = generateMagicProjectJsContent(designDataToSave, {
				projectBasePath: this.getProjectBasePathForDsl(),
				flatAttachments: this.options.flatAttachments,
				attachmentIndex: this.options.attachmentIndex,
			})
			if (!content?.trim()) {
				this.stateBag.setters.setIsSaving(false)
				return { ok: false, reason: "empty-content" }
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
			const shouldUpdateCurrentDesignData = options?.updateCurrentDesignData ?? true
			if (shouldUpdateCurrentDesignData && designDataToSave !== currentDesignData) {
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
						savedVersion = fileInfo.version
						this.stateBag.setMagicProjectJsVersion(fileInfo.version)
					}
				} catch {
					// ignore
				}
				await this.fetchAndSetVersions()
			}
			return {
				ok: true,
				savedVersion,
				savedUpdatedAt,
				fullyPersisted: didPersistDetails,
				savedDesignData: designDataToSave,
				savedFingerprint: fp,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			return { ok: false, reason: "error", error: errorMessage }
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
			flatAttachments: this.options.flatAttachments,
			attachmentIndex: this.options.attachmentIndex,
		})
	}
}
