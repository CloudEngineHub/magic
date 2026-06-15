import { cloneDeep } from "lodash-es"
import type { DesignData } from "../types"
import { MAGIC_PROJECT_VERSION_V2 } from "../utils/magicProjectCompression"
import type { DesignProjectStateBag, DesignProjectManagerOptions } from "./types"
import { DesignRemoteListener } from "./DesignRemoteListener"
import type {
	ApplyRemoteDesignDataFn,
	CheckRemoteUpdateFn,
	DesignRemoteListenerOptions,
	FetchRemoteDesignDataFn,
	LoadAndApplyRemoteFn,
} from "./DesignRemoteListener"
import { DesignLoadManager } from "./DesignLoadManager"
import { DesignSaveManager, type DesignSaveLifecycleHandlers } from "./DesignSaveManager"
import { DesignVersionManager } from "./DesignVersionManager"
import { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"
import { hashDesignDataComparable } from "../utils/designContentHash"
import {
	normalizeDesignDataPathsAfterLoad,
	resolveDesignProjectBasePathFromAttachments,
} from "../utils/utils"
import {
	deleteDesignDraft,
	getDesignDraftWriteDebounceMs,
	readDesignDraft,
	writeDesignDraft,
	type DesignDraftIdentity,
	type DesignDraftReason,
	type DesignDraftWriteResult,
} from "../utils/designDraftStorage"
import magicToast from "@/components/base/MagicToaster/utils"

export interface DesignProjectManagerFactoryParams {
	stateBag: DesignProjectStateBag
	options: DesignProjectManagerOptions
	getFileVersionsList: () => FileHistoryVersion[]
	getFileVersion: () => number | undefined
}

export interface DesignProjectManagerAPI {
	magicProjectJsFileId: string | null
	designData: DesignData
	updateDesignData: (updater: (draft: DesignData) => void) => void
	updateDesignDataAndScheduleSave: (updater: (draft: DesignData) => void) => void

	isInitialLoading: boolean
	isSaving: boolean

	scheduleAutoSave: () => void
	cancelAutoSave: () => void
	persistLocalDraft: (
		designData: DesignData,
		options?: { immediate?: boolean; reason?: DesignDraftReason },
	) => void
	manualSave: () => Promise<void>
	syncDesignData: (newDesignData: DesignData) => void

	loadFromRemote: () => Promise<void>
	resetAndReload: () => Promise<void>

	saveToRemote: () => Promise<void>
	generateContent: (data?: DesignData) => string

	loadWithVersion: (version: number) => Promise<DesignData | null>
	loadLatest: () => Promise<{ data: DesignData | null; version: number | null }>

	checkRemoteUpdate: () => Promise<{
		hasUpdate: boolean
		currentVersion: number | null
		isCheckReliable: boolean
	}>
	updateLocalVersion: (version: number) => void

	isReadOnly: boolean
	setIsReadOnly: (value: boolean) => void

	isProcessingRevoke: boolean
	revokeType: "revoke" | "restore" | null

	fileVersionsList: FileHistoryVersion[]
	fileVersion: number | undefined
	isNewestVersion: boolean
	handleChangeFileVersion: (version: number, isNewestVersion: boolean) => Promise<void>
	handleReturnLatest: () => void
	handleVersionRollback: (version?: number) => Promise<void>
	fetchFileVersions: () => Promise<FileHistoryVersion[]>

	getRemoteListener: () => DesignRemoteListener | null
}

export class DesignProjectManager implements DesignProjectManagerAPI {
	magicProjectJsFileId: string | null
	designData: DesignData
	updateDesignData: (updater: (draft: DesignData) => void) => void
	updateDesignDataAndScheduleSave: (updater: (draft: DesignData) => void) => void

	isInitialLoading: boolean
	isSaving: boolean

	fileVersionsList: FileHistoryVersion[]
	fileVersion: number | undefined
	isReadOnly: boolean
	isProcessingRevoke: boolean
	revokeType: "revoke" | "restore" | null

	private loadManager: DesignLoadManager
	private saveManager: DesignSaveManager
	private versionManager: DesignVersionManager
	private remoteListener: DesignRemoteListener | null = null

	private fetchRemoteDesignDataFn: FetchRemoteDesignDataFn
	private applyRemoteDesignDataFn: ApplyRemoteDesignDataFn
	private loadAndApplyRemoteFn: LoadAndApplyRemoteFn
	private pendingRemoteDesignData: {
		data: DesignData
		updateType: "message" | "revoke" | "restore"
	} | null = null
	private draftSaveTimer: ReturnType<typeof setTimeout> | null = null
	private pendingDraftSave: {
		designData: DesignData
		reason: DesignDraftReason
	} | null = null
	private hasShownLocalDraftUnavailableToast = false

	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions
	private getFileVersionsList: () => FileHistoryVersion[]
	private getFileVersion: () => number | undefined
	private getIsReadOnly: () => boolean

	constructor(params: DesignProjectManagerFactoryParams) {
		const { stateBag, options, getFileVersionsList, getFileVersion } = params

		this.stateBag = stateBag
		this.options = options
		this.getFileVersionsList = getFileVersionsList
		this.getFileVersion = getFileVersion
		this.getIsReadOnly = () => stateBag.getIsReadOnly()

		this.magicProjectJsFileId = null
		this.designData = {
			type: "design",
			name: "",
			version: MAGIC_PROJECT_VERSION_V2,
			canvas: { elements: [] },
		}
		this.updateDesignData = noopDesignDataUpdater
		this.updateDesignDataAndScheduleSave = noopDesignDataUpdater
		this.isInitialLoading = true
		this.isSaving = false
		this.fileVersionsList = []
		this.fileVersion = undefined
		this.isReadOnly =
			!options.allowEdit || options.isPlaybackMode || options.isShareRoute || options.isMobile
		this.isProcessingRevoke = false
		this.revokeType = null

		this.loadManager = new DesignLoadManager(stateBag, options)
		const saveLifecycleHandlers: DesignSaveLifecycleHandlers = {
			onSaveStart: () => this.remoteListener?.beginLocalSave() ?? null,
			onSaveEnd: async (saveToken, didSave, savedUpdatedAt) => {
				await this.remoteListener?.endLocalSave(saveToken, didSave, savedUpdatedAt)
				if (didSave && this.saveManager.wasLastSaveFullyPersisted()) {
					this.clearLocalDraft()
				}
			},
		}
		this.saveManager = new DesignSaveManager(
			stateBag,
			options,
			async () => {
				// Will be set after versionManager is created
				return []
			},
			saveLifecycleHandlers,
		)
		this.versionManager = new DesignVersionManager(
			stateBag,
			options,
			this.saveManager,
			getFileVersionsList,
			getFileVersion,
		)
		this.saveManager.updateFetchAndSetVersions(() => this.versionManager.fetchFileVersions())

		const fetchRemoteDesignData: FetchRemoteDesignDataFn = async () => {
			const fid = this.stateBag.getMagicProjectJsFileId()
			if (!fid) return null

			try {
				const { data } = await this.versionManager.loadLatest()
				if (!data) return null

				return cloneDeep(data) as DesignData
			} catch {
				return null
			}
		}

		const applyRemoteDesignData: ApplyRemoteDesignDataFn = (
			newData: DesignData,
			updateType: "message" | "revoke" | "restore",
		) => {
			return this.applyRemoteDesignDataSafely(newData, updateType)
		}

		const loadAndApplyRemote: LoadAndApplyRemoteFn = async (
			updateType: "message" | "revoke" | "restore" = "message",
		) => {
			const newData = await fetchRemoteDesignData()
			if (!newData) return false
			return applyRemoteDesignData(newData, updateType)
		}

		this.fetchRemoteDesignDataFn = fetchRemoteDesignData
		this.applyRemoteDesignDataFn = applyRemoteDesignData
		this.loadAndApplyRemoteFn = loadAndApplyRemote

		const checkRemoteUpdate: CheckRemoteUpdateFn = async () =>
			this.saveManager.checkRemoteUpdate()

		const listenerOptions: DesignRemoteListenerOptions = {
			...options,
			getMagicProjectJsFileId: () => this.stateBag.getMagicProjectJsFileId(),
			getIsViewingHistory: () => this.getFileVersion() !== undefined,
			getDesignDataName: () => this.stateBag.getDesignData().name,
			fetchAndSetVersions: () => this.versionManager.fetchFileVersions(),
			loadAndApplyRemote,
			fetchRemoteDesignData,
			applyRemoteDesignData,
			checkRemoteUpdate,
			updateListenerDebounceMs: options.updateListenerDebounceMs ?? 200,
			setIsProcessingRevoke: (v) => this.stateBag.setters.setIsProcessingRevoke(v),
			setRevokeType: (v) => this.stateBag.setters.setRevokeType(v),
		}

		this.remoteListener = new DesignRemoteListener(listenerOptions)
	}

	updateOptions(options: DesignProjectManagerOptions): void {
		this.options = options
		this.loadManager.updateOptions(options)
		this.saveManager.updateOptions(options)
		this.versionManager.updateOptions(options)
		this.remoteListener?.updateOptions({
			...options,
			getMagicProjectJsFileId: () => this.stateBag.getMagicProjectJsFileId(),
			getIsViewingHistory: () => this.getFileVersion() !== undefined,
			getDesignDataName: () => this.stateBag.getDesignData().name,
			fetchAndSetVersions: () => this.versionManager.fetchFileVersions(),
			loadAndApplyRemote: this.loadAndApplyRemoteFn,
			fetchRemoteDesignData: this.fetchRemoteDesignDataFn,
			applyRemoteDesignData: this.applyRemoteDesignDataFn,
			checkRemoteUpdate: async () => this.saveManager.checkRemoteUpdate(),
		})
	}

	private hasUnsafeLocalChanges(): boolean {
		return (
			this.saveManager.isLocalDirty() ||
			this.saveManager.hasPendingAutoSave() ||
			this.saveManager.hasRemoteConflict()
		)
	}

	private deferRemoteDesignData(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
	): void {
		this.pendingRemoteDesignData = {
			data: cloneDeep(newData) as DesignData,
			updateType,
		}
		this.saveManager.cancelAutoSave()
		this.saveManager.markRemoteConflict()
	}

	private applyRemoteDesignDataNow(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
	): boolean {
		try {
			const oldData = this.stateBag.getDesignData()
			this.pendingRemoteDesignData = null
			this.saveManager.cancelAutoSave()
			this.saveManager.clearRemoteConflict()
			this.stateBag.setters.setIsSaving(false)
			this.stateBag.setters.setDesignData(newData)
			this.stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(newData))
			this.options.onRemoteDesignDataUpdate?.(oldData, newData, updateType)
			return true
		} catch {
			return false
		}
	}

	private applyRemoteDesignDataSafely(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
	): boolean {
		if (this.hasUnsafeLocalChanges()) {
			this.deferRemoteDesignData(newData, updateType)
			return false
		}

		return this.applyRemoteDesignDataNow(newData, updateType)
	}

	private tryApplyPendingRemoteDesignData(): boolean {
		const pending = this.pendingRemoteDesignData
		if (!pending || this.hasUnsafeLocalChanges()) return false
		return this.applyRemoteDesignDataNow(pending.data, pending.updateType)
	}

	private clearPendingRemoteDesignData(): void {
		this.pendingRemoteDesignData = null
		this.saveManager.clearRemoteConflict()
	}

	scheduleAutoSave(): void {
		this.saveManager.scheduleAutoSave()
	}

	cancelAutoSave(): void {
		this.saveManager.cancelAutoSave()
	}

	private getDraftIdentity(): DesignDraftIdentity {
		return {
			projectId: this.options.projectId,
			designProjectId: this.options.designProjectId,
			magicProjectJsFileId: this.stateBag.getMagicProjectJsFileId(),
		}
	}

	private canUseLocalDraft(): boolean {
		return (
			!!this.options.projectId &&
			!!this.options.designProjectId &&
			!!this.stateBag.getMagicProjectJsFileId() &&
			this.options.allowEdit &&
			!this.options.isPlaybackMode &&
			!this.options.isShareRoute &&
			!this.options.isMobile &&
			this.getFileVersion() === undefined
		)
	}

	private getDesignProjectBasePath(): string | undefined {
		return resolveDesignProjectBasePathFromAttachments(this.options)
	}

	private clearPendingLocalDraftTimer(): void {
		if (this.draftSaveTimer) {
			clearTimeout(this.draftSaveTimer)
			this.draftSaveTimer = null
		}
		this.pendingDraftSave = null
	}

	private writeLocalDraftNow(designData: DesignData, reason: DesignDraftReason): void {
		if (!this.canUseLocalDraft()) return
		const baseRemoteFingerprint = this.stateBag.getPrevDesignDataFingerprint()
		if (!baseRemoteFingerprint) return

		const localFingerprint = hashDesignDataComparable(designData)
		const identity = this.getDraftIdentity()
		if (localFingerprint === baseRemoteFingerprint) {
			void deleteDesignDraft(identity)
			return
		}

		void writeDesignDraft(
			{
				...identity,
				designProjectBasePath: this.getDesignProjectBasePath(),
				baseRemoteVersion: this.stateBag.getMagicProjectJsVersion(),
				baseRemoteFingerprint,
				localFingerprint,
				localUpdatedAt: Date.now(),
				reason,
				designData,
			},
			{ emergency: reason === "pagehide" },
		).then((result) => this.handleLocalDraftWriteResult(result, reason))
	}

	private handleLocalDraftWriteResult(
		result: DesignDraftWriteResult,
		reason: DesignDraftReason,
	): void {
		if (result.durable) {
			this.hasShownLocalDraftUnavailableToast = false
			return
		}
		if (reason === "pagehide" || this.hasShownLocalDraftUnavailableToast) return
		this.hasShownLocalDraftUnavailableToast = true
		magicToast.warning("本地画布草稿暂不可用，请等待自动保存完成后再关闭页面。")
	}

	persistLocalDraft(
		designData: DesignData,
		options: { immediate?: boolean; reason?: DesignDraftReason } = {},
	): void {
		const reason = options.reason ?? "local-edit"
		if (options.immediate) {
			this.clearPendingLocalDraftTimer()
			this.writeLocalDraftNow(designData, reason)
			return
		}

		this.pendingDraftSave = {
			designData: cloneDeep(designData) as DesignData,
			reason,
		}
		if (this.draftSaveTimer) {
			clearTimeout(this.draftSaveTimer)
		}
		this.draftSaveTimer = setTimeout(() => {
			const pending = this.pendingDraftSave
			this.draftSaveTimer = null
			this.pendingDraftSave = null
			if (!pending) return
			this.writeLocalDraftNow(pending.designData, pending.reason)
		}, getDesignDraftWriteDebounceMs())
	}

	private clearLocalDraft(): void {
		this.clearPendingLocalDraftTimer()
		void deleteDesignDraft(this.getDraftIdentity())
	}

	private async tryRestoreLocalDraftAfterRemoteLoad(): Promise<void> {
		if (!this.canUseLocalDraft()) return

		const identity = this.getDraftIdentity()
		const draft = await readDesignDraft(identity)
		if (!draft) return

		const remoteFingerprint = this.stateBag.getPrevDesignDataFingerprint()
		if (!remoteFingerprint) return
		if (draft.localFingerprint === remoteFingerprint) {
			this.clearLocalDraft()
			return
		}

		const remoteVersion = this.stateBag.getMagicProjectJsVersion()
		const hasRemoteVersionAdvanced =
			draft.baseRemoteVersion !== null &&
			remoteVersion !== null &&
			remoteVersion > draft.baseRemoteVersion
		const hasRemoteFingerprintChanged =
			!!draft.baseRemoteFingerprint && draft.baseRemoteFingerprint !== remoteFingerprint

		if (hasRemoteVersionAdvanced || hasRemoteFingerprintChanged) {
			magicToast.warning(
				"检测到本地画布草稿，但远端版本已更新，已保留草稿并暂不自动覆盖远端内容。",
			)
			return
		}

		const restoredData = cloneDeep(draft.designData) as DesignData
		const dslBase = this.getDesignProjectBasePath()
		if (dslBase) normalizeDesignDataPathsAfterLoad(restoredData, dslBase)

		const oldData = this.stateBag.getDesignData()
		this.stateBag.setters.setDesignData(restoredData)
		this.stateBag.setPrevDesignDataFingerprint(remoteFingerprint)
		this.options.onRemoteDesignDataUpdate?.(oldData, restoredData, "draft")
		this.saveManager.scheduleAutoSave()
		magicToast.info("已恢复本地未保存的画布草稿。")
	}

	async manualSave(): Promise<void> {
		const didSave = await this.saveManager.manualSave()
		if (didSave) {
			if (this.saveManager.wasLastSaveFullyPersisted()) {
				this.clearLocalDraft()
			}
			this.pendingRemoteDesignData = null
			return
		}
		this.tryApplyPendingRemoteDesignData()
	}

	syncDesignData(newDesignData: DesignData): void {
		this.saveManager.syncDesignData(newDesignData)
		this.tryApplyPendingRemoteDesignData()
	}

	async loadFromRemote(): Promise<void> {
		this.clearPendingRemoteDesignData()
		await this.loadManager.loadFromRemote()
		await this.tryRestoreLocalDraftAfterRemoteLoad()
	}

	async resetAndReload(): Promise<void> {
		this.clearPendingRemoteDesignData()
		this.clearLocalDraft()
		await this.loadManager.resetAndReload()
	}

	async saveToRemote(): Promise<void> {
		if (this.getIsReadOnly()) return
		this.stateBag.setters.setIsSaving(true)
		const didSave = await this.saveManager.commitSave()
		if (didSave) {
			if (this.saveManager.wasLastSaveFullyPersisted()) {
				this.clearLocalDraft()
			}
			this.pendingRemoteDesignData = null
			return
		}
		this.tryApplyPendingRemoteDesignData()
	}

	generateContent(data?: DesignData): string {
		return this.saveManager.generateContent(data)
	}

	loadWithVersion(version: number): Promise<DesignData | null> {
		return this.versionManager.loadWithVersion(version)
	}

	loadLatest(): Promise<{ data: DesignData | null; version: number | null }> {
		return this.versionManager.loadLatest()
	}

	checkRemoteUpdate(): Promise<{
		hasUpdate: boolean
		currentVersion: number | null
		isCheckReliable: boolean
	}> {
		return this.saveManager.checkRemoteUpdate()
	}

	updateLocalVersion(version: number): void {
		this.saveManager.updateLocalVersion(version)
	}

	get isNewestVersion(): boolean {
		const list = this.getFileVersionsList()
		const fileVersion = this.getFileVersion()
		if (!list?.length) return true
		if (!fileVersion) return true
		return fileVersion === list[0].version
	}

	handleChangeFileVersion(version: number, isNewestVersion: boolean): Promise<void> {
		this.clearPendingRemoteDesignData()
		this.clearLocalDraft()
		return this.versionManager.handleChangeFileVersion(version, isNewestVersion)
	}

	handleReturnLatest(): void {
		this.clearPendingRemoteDesignData()
		this.clearLocalDraft()
		this.versionManager.handleReturnLatest()
	}

	handleVersionRollback(version?: number): Promise<void> {
		this.clearPendingRemoteDesignData()
		this.clearLocalDraft()
		return this.versionManager.handleVersionRollback(version)
	}

	fetchFileVersions(): Promise<FileHistoryVersion[]> {
		return this.versionManager.fetchFileVersions()
	}

	setIsReadOnly(value: boolean): void {
		this.stateBag.setters.setIsReadOnly(value)
	}

	getRemoteListener(): DesignRemoteListener | null {
		return this.remoteListener
	}
}

function noopDesignDataUpdater(_updater: (draft: DesignData) => void): void {
	void _updater
}
