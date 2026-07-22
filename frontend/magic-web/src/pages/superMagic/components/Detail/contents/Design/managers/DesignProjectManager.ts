import { cloneDeep } from "lodash-es"
import type { DesignData } from "../types"
import { MAGIC_PROJECT_VERSION_V2 } from "../utils/magicProjectCompression"
import type {
	DesignConflict,
	DesignConnectionConflict,
	DesignElementConflict,
	DesignProjectStateBag,
	DesignProjectManagerOptions,
} from "./types"
import { DesignRemoteListener } from "./DesignRemoteListener"
import type {
	ApplyRemoteDesignDataFn,
	CheckRemoteUpdateFn,
	DesignRemoteListenerOptions,
	FetchRemoteDesignDataFn,
	LoadAndApplyRemoteFn,
} from "./DesignRemoteListener"
import { DesignLoadManager } from "./DesignLoadManager"
import {
	DesignSaveManager,
	type DesignSaveContext,
	type DesignSaveLifecycleHandlers,
	type DesignSaveMetadata,
	type DesignSaveResult,
} from "./DesignSaveManager"
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
	type DesignDraftEntry,
	type DesignDraftIdentity,
	type DesignDraftReason,
	type DesignDraftWriteResult,
} from "../utils/designDraftStorage"
import {
	mergeDesignDataByElement,
	refreshDesignElementConflictsFromRemoteData,
	type DesignDataElementMergeResult,
} from "../utils/designDataElementMerge"
import {
	tryApplyCanvasDocumentPatch,
	tryMergeCanvasElementsByField,
} from "@/components/CanvasDesign/runtime/document"

type ElementLevelMergeConflictResult = Extract<
	DesignDataElementMergeResult,
	{ ok: false; isElementLevelConflict: true }
>

type ConnectionLevelMergeConflictResult = Extract<
	DesignDataElementMergeResult,
	{ ok: false; isConnectionLevelConflict: true }
>

interface LocalDraftBaseSnapshot {
	baseRemoteVersion: number | null
	baseRemoteFingerprint: string
	baseRemoteData?: DesignData
}

const DESIGN_SAVE_GUARD_LOG_PREFIX = "[DesignSaveGuard]"

function getTopLevelElementCount(data: DesignData | null | undefined): number {
	return data?.canvas?.elements?.length ?? 0
}

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
	updateDesignDataAndScheduleSave: (
		updater: (draft: DesignData) => void,
		metadata?: DesignSaveMetadata,
	) => void

	isInitialLoading: boolean
	isSaving: boolean

	scheduleAutoSave: (metadata?: DesignSaveMetadata) => void
	cancelAutoSave: () => void
	canUpdateCurrentDesignData: () => boolean
	persistLocalDraft: (
		designData: DesignData,
		options?: { immediate?: boolean; reason?: DesignDraftReason },
	) => void
	manualSave: () => Promise<void>
	syncDesignData: (newDesignData: DesignData) => void

	loadFromRemote: () => Promise<void>
	reloadPreservingLocalDraft: () => Promise<void>
	reloadDiscardingLocalDraft: () => Promise<void>

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
	clearConflictState: () => void
	resolveBlockingConflictWithRemote: () => boolean
	resolveBlockingConflictWithLocal: () => Promise<boolean>
	resolveElementConflictWithLocal: (elementId: string) => boolean
	resolveElementConflictWithRemote: (elementId: string) => boolean
	resolveConnectionConflictWithLocal: (connectionId: string) => boolean
	resolveConnectionConflictWithRemote: (connectionId: string) => boolean
	resolveEditedElementConflictsWithLocal: (
		elementIds: string[],
		nextDesignData: DesignData,
		metadata?: DesignSaveMetadata,
	) => boolean

	isProcessingRevoke: boolean
	revokeType: "revoke" | "restore" | null
	conflictState: DesignConflict | null

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
	updateDesignDataAndScheduleSave: (
		updater: (draft: DesignData) => void,
		metadata?: DesignSaveMetadata,
	) => void

	isInitialLoading: boolean
	isSaving: boolean

	fileVersionsList: FileHistoryVersion[]
	fileVersion: number | undefined
	isReadOnly: boolean
	isProcessingRevoke: boolean
	revokeType: "revoke" | "restore" | null
	conflictState: DesignConflict | null

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
		remoteVersion: number | null
	} | null = null
	private versionDataSourceLockCount = 0
	private baseDesignData: DesignData | null = null
	private draftSaveTimer: ReturnType<typeof setTimeout> | null = null
	private pendingDraftSave: {
		designData: DesignData
		reason: DesignDraftReason
		baseSnapshot: LocalDraftBaseSnapshot
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
		this.conflictState = null

		this.loadManager = new DesignLoadManager(stateBag, options)
		const saveLifecycleHandlers: DesignSaveLifecycleHandlers = {
			onSaveStart: () => this.remoteListener?.beginLocalSave() ?? null,
			onSaveEnd: async (saveToken, didSave, savedUpdatedAt) => {
				await this.remoteListener?.endLocalSave(saveToken, didSave, savedUpdatedAt)
				if (
					didSave &&
					this.saveManager.wasLastSaveFullyPersisted() &&
					!this.hasUnresolvedMergeConflicts()
				) {
					this.clearLocalDraftAfterFullyPersistedSave()
				}
			},
			onAutoSaveResult: async (saveResult) => {
				if (saveResult.ok) {
					this.handleSuccessfulSaveResult(saveResult)
					return
				}
				await this.handleSaveResultConflict(saveResult)
			},
			shouldBlockEmptyCanvasSave: (context) => this.shouldBlockUnsafeEmptyCanvasSave(context),
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

		const fetchRemoteDesignDataWithVersion = async (): Promise<{
			data: DesignData
			version: number | null
		} | null> => {
			const fid = this.stateBag.getMagicProjectJsFileId()
			if (!fid) return null

			try {
				const { data, version } = await this.versionManager.loadLatest()
				if (!data) return null

				return {
					data: cloneDeep(data) as DesignData,
					version,
				}
			} catch {
				return null
			}
		}

		const fetchRemoteDesignData: FetchRemoteDesignDataFn = async () =>
			(await fetchRemoteDesignDataWithVersion())?.data ?? null

		const isVersionDataSourceLocked = () => this.isVersionDataSourceLocked()

		const applyRemoteDesignData: ApplyRemoteDesignDataFn = (
			newData: DesignData,
			updateType: "message" | "revoke" | "restore",
			applyOptions,
		) => {
			return this.applyRemoteDesignDataSafely(newData, updateType, applyOptions)
		}

		const loadAndApplyRemote: LoadAndApplyRemoteFn = async (
			updateType: "message" | "revoke" | "restore" = "message",
		) => {
			if (isVersionDataSourceLocked()) return false
			const remote = await fetchRemoteDesignDataWithVersion()
			if (isVersionDataSourceLocked()) return false
			if (!remote) return false
			return applyRemoteDesignData(remote.data, updateType, {
				remoteVersion: remote.version,
			})
		}

		this.fetchRemoteDesignDataFn = fetchRemoteDesignData
		this.applyRemoteDesignDataFn = applyRemoteDesignData
		this.loadAndApplyRemoteFn = loadAndApplyRemote

		const checkRemoteUpdate: CheckRemoteUpdateFn = async () =>
			this.saveManager.checkRemoteUpdate()

		const listenerOptions: DesignRemoteListenerOptions = {
			...options,
			getMagicProjectJsFileId: () => this.stateBag.getMagicProjectJsFileId(),
			getIsViewingHistory: isVersionDataSourceLocked,
			getDesignDataName: () => this.stateBag.getDesignData().name,
			fetchAndSetVersions: () => this.versionManager.fetchFileVersions(),
			loadAndApplyRemote,
			fetchRemoteDesignData,
			applyRemoteDesignData,
			checkRemoteUpdate,
			getLocalVersion: () => this.stateBag.getMagicProjectJsVersion(),
			updateLocalVersion: (version) => this.updateLocalVersionIfNewer(version),
			updateListenerDebounceMs: options.updateListenerDebounceMs ?? 100,
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
			getIsViewingHistory: () => this.isVersionDataSourceLocked(),
			getDesignDataName: () => this.stateBag.getDesignData().name,
			fetchAndSetVersions: () => this.versionManager.fetchFileVersions(),
			loadAndApplyRemote: this.loadAndApplyRemoteFn,
			fetchRemoteDesignData: this.fetchRemoteDesignDataFn,
			applyRemoteDesignData: this.applyRemoteDesignDataFn,
			checkRemoteUpdate: async () => this.saveManager.checkRemoteUpdate(),
			getLocalVersion: () => this.stateBag.getMagicProjectJsVersion(),
			updateLocalVersion: (version) => this.updateLocalVersionIfNewer(version),
		})
	}

	private updateLocalVersionIfNewer(version: number): void {
		const currentVersion = this.stateBag.getMagicProjectJsVersion()
		if (currentVersion !== null && version < currentVersion) return
		this.saveManager.updateLocalVersion(version)
	}

	private setBaseDesignData(data: DesignData | null): void {
		this.baseDesignData = data ? (cloneDeep(data) as DesignData) : null
	}

	private isVersionDataSourceLocked(): boolean {
		return this.getFileVersion() !== undefined || this.versionDataSourceLockCount > 0
	}

	canUpdateCurrentDesignData(): boolean {
		return !this.isVersionDataSourceLocked()
	}

	private lockVersionDataSource(): () => void {
		let released = false
		this.versionDataSourceLockCount += 1
		return () => {
			if (released) return
			released = true
			this.versionDataSourceLockCount = Math.max(0, this.versionDataSourceLockCount - 1)
		}
	}

	private setSyncedRemoteBaseDesignData(data: DesignData): void {
		this.stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(data))
		this.setBaseDesignData(data)
	}

	private syncBaseDesignDataFromCurrent(): void {
		const currentData = this.stateBag.getDesignData()
		const currentFingerprint = hashDesignDataComparable(currentData)
		const syncedFingerprint = this.stateBag.getPrevDesignDataFingerprint()

		if (!syncedFingerprint || currentFingerprint !== syncedFingerprint) {
			return
		}

		this.setBaseDesignData(currentData)
	}

	private getBaseRemoteDataForLocalDraft(): DesignData | undefined {
		return this.baseDesignData ? (cloneDeep(this.baseDesignData) as DesignData) : undefined
	}

	private getLocalDraftBaseSnapshot(): LocalDraftBaseSnapshot | null {
		const baseRemoteFingerprint = this.stateBag.getPrevDesignDataFingerprint()
		if (!baseRemoteFingerprint) {
			return null
		}
		return {
			baseRemoteVersion: this.stateBag.getMagicProjectJsVersion(),
			baseRemoteFingerprint,
			baseRemoteData: this.getBaseRemoteDataForLocalDraft(),
		}
	}

	private isUserCanvasDeletionSource(context: DesignSaveContext): boolean {
		if (context.source === "manual-save" || context.source === "conflict-resolution") {
			return true
		}
		if (context.source !== "canvas-patch" && context.source !== "canvas-full-export") {
			return false
		}
		return context.deletedElementIds.length > 0
	}

	private shouldBlockUnsafeEmptyCanvasSave(context: DesignSaveContext): boolean {
		const trustedBaseElementCount = getTopLevelElementCount(this.baseDesignData)
		const shouldBlock =
			context.nextElementCount === 0 &&
			trustedBaseElementCount > 0 &&
			!this.isUserCanvasDeletionSource(context)

		if (shouldBlock) {
			this.logBlockedEmptyCanvasSave(context, trustedBaseElementCount)
		}

		return shouldBlock
	}

	private logBlockedEmptyCanvasSave(
		context: DesignSaveContext,
		trustedBaseElementCount: number,
	): void {
		console.warn(
			DESIGN_SAVE_GUARD_LOG_PREFIX,
			JSON.stringify({
				event: "blocked-empty-canvas-save",
				source: context.source,
				beforeElementCount: context.beforeElementCount,
				nextElementCount: context.nextElementCount,
				trustedBaseElementCount,
				deletedElementIds: context.deletedElementIds,
				designDataVersion: context.designData.version,
				magicProjectJsVersion: context.magicProjectJsVersion,
				fileVersion: this.getFileVersion(),
				isVersionDataSourceLocked: this.isVersionDataSourceLocked(),
				isRemoteApplying: context.isRemoteApplying,
				fromDraft: context.fromDraft,
				fromUpgrade: context.fromUpgrade,
				hasPendingRemoteDesignData: this.pendingRemoteDesignData !== null,
			}),
		)
	}

	private shouldAutoSaveRestoredDraft(localData: DesignData, remoteData: DesignData): boolean {
		const localElementCount = getTopLevelElementCount(localData)
		const remoteElementCount = getTopLevelElementCount(remoteData)
		return localElementCount > 0 || remoteElementCount === 0
	}

	private enterDraftRestoreConflictForUnsafeEmptyLocal(options: {
		localData: DesignData
		remoteData: DesignData
		baseRemoteData?: DesignData
		baseVersion?: number | null
		remoteVersion?: number | null
		baseFingerprint?: string
		localFingerprint?: string
		remoteFingerprint?: string
	}): void {
		const conflict = this.buildConflict({
			reason: "draft-remote-advanced",
			localData: options.localData,
			remoteData: options.remoteData,
			baseVersion: options.baseVersion,
			localVersion: options.baseVersion,
			remoteVersion: options.remoteVersion,
			baseFingerprint: options.baseFingerprint,
			localFingerprint: options.localFingerprint,
			remoteFingerprint: options.remoteFingerprint,
		})
		this.setConflictState(conflict)
		this.writeConflictLocalDraftNow(
			conflict,
			options.localData,
			options.baseRemoteData ?? options.remoteData,
		)
		console.warn(
			DESIGN_SAVE_GUARD_LOG_PREFIX,
			JSON.stringify({
				event: "blocked-empty-draft-restore-autosave",
				source: "draft-restore",
				localElementCount: getTopLevelElementCount(options.localData),
				remoteElementCount: getTopLevelElementCount(options.remoteData),
				magicProjectJsVersion: this.stateBag.getMagicProjectJsVersion(),
				fileVersion: this.getFileVersion(),
				isVersionDataSourceLocked: this.isVersionDataSourceLocked(),
			}),
		)
	}

	private hasUnresolvedElementConflicts(
		conflict: DesignConflict | null = this.stateBag.getConflictState(),
	): boolean {
		return !!conflict?.elementConflicts?.some(({ status }) => status === "unresolved")
	}

	private hasUnresolvedConnectionConflicts(
		conflict: DesignConflict | null = this.stateBag.getConflictState(),
	): boolean {
		return !!conflict?.connectionConflicts?.some(({ status }) => status === "unresolved")
	}

	private hasUnresolvedMergeConflicts(
		conflict: DesignConflict | null = this.stateBag.getConflictState(),
	): boolean {
		return (
			this.hasUnresolvedElementConflicts(conflict) ||
			this.hasUnresolvedConnectionConflicts(conflict)
		)
	}

	private getUnresolvedConnectionConflictIds(
		conflict: DesignConflict | null = this.stateBag.getConflictState(),
	): string[] {
		return (conflict?.connectionConflicts ?? [])
			.filter(({ status }) => status === "unresolved")
			.map(({ connectionId }) => connectionId)
	}

	private hasBlockingConflict(): boolean {
		const conflict = this.stateBag.getConflictState()
		return !!conflict && !this.hasUnresolvedMergeConflicts(conflict)
	}

	private hasUnsafeLocalChanges(): boolean {
		return (
			this.hasBlockingConflict() ||
			this.hasUnresolvedMergeConflicts() ||
			this.saveManager.isLocalDirty() ||
			this.saveManager.hasPendingAutoSave() ||
			this.saveManager.hasRemoteConflict()
		)
	}

	private getLocalDraftDataForCurrentConflict(designData: DesignData): DesignData {
		const conflict = this.stateBag.getConflictState()
		if (!this.hasUnresolvedMergeConflicts(conflict)) {
			return designData
		}
		let localData = designData
		if (conflict?.elementConflicts?.length) {
			localData = this.buildLocalDataFromElementConflicts(
				localData,
				conflict.elementConflicts,
			)
		}
		if (conflict?.connectionConflicts?.length) {
			localData = this.buildLocalDataFromConnectionConflicts(
				localData,
				conflict.connectionConflicts,
			)
		}
		return localData
	}

	private getRemoteSaveDataForCurrentElementConflicts(
		designData: DesignData = this.stateBag.getDesignData(),
	): DesignData | null {
		const conflict = this.stateBag.getConflictState()
		if (!this.hasUnresolvedElementConflicts(conflict) || !conflict?.elementConflicts?.length) {
			return null
		}

		const unresolvedElementConflicts = conflict.elementConflicts.filter(
			({ status }) => status === "unresolved",
		)
		const patchResult = tryApplyCanvasDocumentPatch(
			designData.canvas,
			{
				upserts: unresolvedElementConflicts
					.filter(
						(
							elementConflict,
						): elementConflict is DesignElementConflict & {
							remoteElement: NonNullable<DesignElementConflict["remoteElement"]>
						} => !!elementConflict.remoteElement,
					)
					.map((elementConflict) => ({
						element: cloneDeep(elementConflict.remoteElement),
						parentId: elementConflict.remoteParentId,
					})),
				deletedElementIds: unresolvedElementConflicts
					.filter(({ remoteElement }) => !remoteElement)
					.map(({ elementId }) => elementId),
				changedElementIds: unresolvedElementConflicts.map(({ elementId }) => elementId),
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) {
			return null
		}

		return {
			...designData,
			canvas: patchResult.canvas,
		}
	}

	private buildConflict(options: {
		reason: DesignConflict["reason"]
		localData: DesignData
		remoteData: DesignData
		baseVersion?: number | null
		localVersion?: number | null
		remoteVersion?: number | null
		baseFingerprint?: string
		localFingerprint?: string
		remoteFingerprint?: string
		elementConflicts?: DesignElementConflict[]
		connectionConflicts?: DesignConnectionConflict[]
		mergedData?: DesignData
	}): DesignConflict {
		const localData = cloneDeep(options.localData) as DesignData
		const remoteData = cloneDeep(options.remoteData) as DesignData
		const mergedData = options.mergedData
			? (cloneDeep(options.mergedData) as DesignData)
			: undefined
		const currentVersion = this.stateBag.getMagicProjectJsVersion()

		return {
			reason: options.reason,
			baseVersion: options.baseVersion ?? currentVersion,
			localVersion: options.localVersion ?? currentVersion,
			remoteVersion: options.remoteVersion ?? null,
			baseFingerprint:
				options.baseFingerprint ?? this.stateBag.getPrevDesignDataFingerprint(),
			localFingerprint: options.localFingerprint ?? hashDesignDataComparable(localData),
			remoteFingerprint: options.remoteFingerprint ?? hashDesignDataComparable(remoteData),
			localData,
			remoteData,
			createdAt: Date.now(),
			elementConflicts: options.elementConflicts,
			connectionConflicts: options.connectionConflicts,
			mergedData,
		}
	}

	private setConflictState(conflict: DesignConflict): void {
		this.conflictState = conflict
		this.stateBag.setters.setConflictState(conflict)
	}

	private clearBlockingConflictState(): void {
		if (this.hasUnresolvedMergeConflicts()) return
		this.clearConflictState()
	}

	private buildElementConflicts(
		mergeResult: ElementLevelMergeConflictResult,
		previousElementConflicts: DesignElementConflict[] = [],
	): DesignElementConflict[] {
		const createdAt = Date.now()
		const previousElementConflictsById = new Map(
			previousElementConflicts.map((elementConflict) => [
				elementConflict.elementId,
				elementConflict,
			]),
		)
		return mergeResult.elementConflicts.map((elementConflict) => {
			const previousElementConflict = previousElementConflictsById.get(
				elementConflict.elementId,
			)
			return {
				...elementConflict,
				status: "unresolved",
				createdAt:
					previousElementConflict?.status === "unresolved"
						? previousElementConflict.createdAt
						: createdAt,
			}
		})
	}

	private buildConnectionConflicts(
		mergeResult: ConnectionLevelMergeConflictResult,
		previousConnectionConflicts: DesignConnectionConflict[] = [],
	): DesignConnectionConflict[] {
		const createdAt = Date.now()
		const previousConnectionConflictsById = new Map(
			previousConnectionConflicts.map((connectionConflict) => [
				connectionConflict.connectionId,
				connectionConflict,
			]),
		)
		return mergeResult.connectionConflicts.map((connectionConflict) => {
			const previousConnectionConflict = previousConnectionConflictsById.get(
				connectionConflict.connectionId,
			)
			return {
				...connectionConflict,
				status: "unresolved",
				createdAt:
					previousConnectionConflict?.status === "unresolved"
						? previousConnectionConflict.createdAt
						: createdAt,
			}
		})
	}

	private mergeElementConflictsWithLatestRemote(options: {
		existingElementConflicts: DesignElementConflict[]
		remoteData: DesignData
		mergeResult?: ElementLevelMergeConflictResult
	}): DesignElementConflict[] {
		const refreshedExistingElementConflicts = refreshDesignElementConflictsFromRemoteData(
			options.existingElementConflicts,
			options.remoteData,
		)
		const nextElementConflictsById = new Map(
			refreshedExistingElementConflicts.map((elementConflict) => [
				elementConflict.elementId,
				elementConflict,
			]),
		)

		if (options.mergeResult) {
			this.buildElementConflicts(
				options.mergeResult,
				options.existingElementConflicts,
			).forEach((elementConflict) => {
				nextElementConflictsById.set(elementConflict.elementId, elementConflict)
			})
		}

		return Array.from(nextElementConflictsById.values())
	}

	private tryMergeElementConflictIntoData(
		data: DesignData,
		elementConflict: DesignElementConflict,
	): DesignData | null {
		if (
			elementConflict.status !== "unresolved" ||
			elementConflict.reason !== "same-element-changed" ||
			!elementConflict.baseElement ||
			!elementConflict.localElement ||
			!elementConflict.remoteElement ||
			elementConflict.baseParentId !== elementConflict.localParentId ||
			elementConflict.baseParentId !== elementConflict.remoteParentId
		) {
			return null
		}

		const mergedElement = tryMergeCanvasElementsByField(
			elementConflict.baseElement,
			elementConflict.localElement,
			elementConflict.remoteElement,
		)
		if (!mergedElement) return null

		const patchResult = tryApplyCanvasDocumentPatch(
			data.canvas,
			{
				upserts: [
					{
						element: mergedElement,
						parentId: elementConflict.remoteParentId,
					},
				],
				deletedElementIds: [],
				changedElementIds: [elementConflict.elementId],
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) return null

		return {
			...data,
			canvas: patchResult.canvas,
		}
	}

	private autoMergeElementConflictsIntoData(options: {
		mergedData: DesignData
		elementConflicts: DesignElementConflict[]
	}): {
		mergedData: DesignData
		elementConflicts: DesignElementConflict[]
		didAutoMerge: boolean
	} {
		let mergedData = options.mergedData
		let didAutoMerge = false
		const elementConflicts: DesignElementConflict[] = []

		options.elementConflicts.forEach((elementConflict) => {
			const nextMergedData = this.tryMergeElementConflictIntoData(mergedData, elementConflict)
			if (nextMergedData) {
				mergedData = nextMergedData
				didAutoMerge = true
				return
			}
			elementConflicts.push(elementConflict)
		})

		return {
			mergedData,
			elementConflicts,
			didAutoMerge,
		}
	}

	private buildLocalDataFromElementConflicts(
		mergedData: DesignData,
		elementConflicts: DesignElementConflict[],
	): DesignData {
		const unresolvedElementConflicts = elementConflicts.filter(
			({ status }) => status === "unresolved",
		)
		if (unresolvedElementConflicts.length === 0) {
			return cloneDeep(mergedData) as DesignData
		}

		const patchResult = tryApplyCanvasDocumentPatch(
			mergedData.canvas,
			{
				upserts: unresolvedElementConflicts
					.filter(
						(
							elementConflict,
						): elementConflict is DesignElementConflict & {
							localElement: NonNullable<DesignElementConflict["localElement"]>
						} => !!elementConflict.localElement,
					)
					.map((elementConflict) => ({
						element: cloneDeep(elementConflict.localElement),
						parentId: elementConflict.localParentId,
					})),
				deletedElementIds: unresolvedElementConflicts
					.filter(({ localElement }) => !localElement)
					.map(({ elementId }) => elementId),
				changedElementIds: unresolvedElementConflicts.map(({ elementId }) => elementId),
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) {
			return cloneDeep(mergedData) as DesignData
		}

		return {
			...mergedData,
			canvas: patchResult.canvas,
		}
	}

	private buildLocalDataFromConnectionConflicts(
		mergedData: DesignData,
		connectionConflicts: DesignConnectionConflict[],
	): DesignData {
		const unresolvedConnectionConflicts = connectionConflicts.filter(
			({ status }) => status === "unresolved",
		)
		if (unresolvedConnectionConflicts.length === 0) {
			return cloneDeep(mergedData) as DesignData
		}

		const patchResult = tryApplyCanvasDocumentPatch(
			mergedData.canvas,
			{
				upserts: [],
				deletedElementIds: [],
				changedElementIds: [],
				connectionUpserts: unresolvedConnectionConflicts
					.map(({ localConnection }) => localConnection)
					.filter(
						(
							connection,
						): connection is NonNullable<DesignConnectionConflict["localConnection"]> =>
							!!connection,
					)
					.map((connection) => cloneDeep(connection)),
				deletedConnectionIds: unresolvedConnectionConflicts
					.filter(({ localConnection }) => !localConnection)
					.map(({ connectionId }) => connectionId),
				changedConnectionIds: unresolvedConnectionConflicts.map(
					({ connectionId }) => connectionId,
				),
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) {
			return cloneDeep(mergedData) as DesignData
		}

		return {
			...mergedData,
			canvas: patchResult.canvas,
		}
	}

	private buildLocalDataFromMergeConflicts(
		baseData: DesignData,
		options: {
			elementConflicts?: DesignElementConflict[]
			connectionConflicts?: DesignConnectionConflict[]
		},
	): DesignData {
		let localData = baseData
		if (options.elementConflicts?.length) {
			localData = this.buildLocalDataFromElementConflicts(localData, options.elementConflicts)
		}
		if (options.connectionConflicts?.length) {
			localData = this.buildLocalDataFromConnectionConflicts(
				localData,
				options.connectionConflicts,
			)
		}
		return localData
	}

	private applyConnectionConflictResolutionToData(
		data: DesignData,
		connectionConflicts: DesignConnectionConflict[],
		resolution: "use-local" | "use-remote",
	): DesignData | null {
		const targetConnections = connectionConflicts
			.map((connectionConflict) =>
				resolution === "use-local"
					? connectionConflict.localConnection
					: connectionConflict.remoteConnection,
			)
			.filter(
				(
					connection,
				): connection is NonNullable<DesignConnectionConflict["localConnection"]> =>
					!!connection,
			)
			.map((connection) => cloneDeep(connection))
		const deletedConnectionIds = connectionConflicts
			.filter((connectionConflict) =>
				resolution === "use-local"
					? !connectionConflict.localConnection
					: !connectionConflict.remoteConnection,
			)
			.map(({ connectionId }) => connectionId)
		const changedConnectionIds = connectionConflicts.map(({ connectionId }) => connectionId)

		const patchResult = tryApplyCanvasDocumentPatch(
			data.canvas,
			{
				upserts: [],
				deletedElementIds: [],
				changedElementIds: [],
				connectionUpserts: targetConnections,
				deletedConnectionIds,
				changedConnectionIds,
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) return null

		return {
			...data,
			canvas: patchResult.canvas,
		}
	}

	private refreshElementConflictStateAfterRemoteMerge(options: {
		remoteData: DesignData
		remoteVersion?: number | null
		mergedData: DesignData
		mergeResult?: ElementLevelMergeConflictResult
	}): { refreshed: boolean; localData?: DesignData } {
		const existingConflict = this.stateBag.getConflictState()
		if (!existingConflict?.elementConflicts?.length) return { refreshed: false }

		const elementConflicts = this.mergeElementConflictsWithLatestRemote({
			existingElementConflicts: existingConflict.elementConflicts,
			remoteData: options.remoteData,
			mergeResult: options.mergeResult,
		})
		const autoMergeResult = this.autoMergeElementConflictsIntoData({
			mergedData: options.mergedData,
			elementConflicts,
		})
		if (!autoMergeResult.elementConflicts.some(({ status }) => status === "unresolved")) {
			this.clearConflictState()
			return {
				refreshed: false,
				localData: autoMergeResult.didAutoMerge ? autoMergeResult.mergedData : undefined,
			}
		}

		const remoteFingerprint = hashDesignDataComparable(options.remoteData)
		const localData = this.buildLocalDataFromElementConflicts(
			autoMergeResult.mergedData,
			autoMergeResult.elementConflicts,
		)
		const nextConflict: DesignConflict = {
			...existingConflict,
			reason: "element-level-conflict",
			baseVersion: options.remoteVersion ?? existingConflict.baseVersion,
			remoteVersion: options.remoteVersion ?? existingConflict.remoteVersion,
			baseFingerprint: remoteFingerprint,
			localFingerprint: hashDesignDataComparable(localData),
			remoteFingerprint,
			localData,
			remoteData: cloneDeep(options.remoteData) as DesignData,
			mergedData: cloneDeep(autoMergeResult.mergedData) as DesignData,
			elementConflicts: autoMergeResult.elementConflicts,
		}

		this.setConflictState(nextConflict)
		this.writeConflictLocalDraftNow(nextConflict, localData)
		return { refreshed: true, localData }
	}

	private deferRemoteDesignData(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
		options: {
			reason?: DesignConflict["reason"]
			remoteVersion?: number | null
		} = {},
	): void {
		const localData = this.stateBag.getDesignData()
		const remoteData = cloneDeep(newData) as DesignData
		this.pendingRemoteDesignData = {
			data: remoteData,
			updateType,
			remoteVersion: options.remoteVersion ?? null,
		}
		this.saveManager.cancelAutoSave()
		this.saveManager.markRemoteConflict()
		this.setConflictState(
			this.buildConflict({
				reason: options.reason ?? "remote-update-with-local-dirty",
				localData,
				remoteData,
				remoteVersion: options.remoteVersion ?? null,
			}),
		)
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
			this.clearConflictState()
			this.stateBag.setters.setIsSaving(false)
			this.stateBag.setters.setDesignData(newData)
			this.setSyncedRemoteBaseDesignData(newData)
			this.options.onRemoteDesignDataUpdate?.(oldData, newData, updateType)
			return true
		} catch {
			return false
		}
	}

	private tryMergeRemoteDesignData(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
		options?: { remoteVersion?: number | null },
	): boolean {
		if (updateType !== "message") return false
		if (this.hasBlockingConflict()) return false
		if (!this.baseDesignData) {
			return false
		}

		const oldData = this.stateBag.getDesignData()
		const mergeResult = mergeDesignDataByElement({
			baseData: this.baseDesignData,
			localData: oldData,
			remoteData: newData,
		})

		if (!mergeResult.ok) {
			if (mergeResult.isElementLevelConflict) {
				return this.applyElementLevelMergeConflict(
					newData,
					updateType,
					mergeResult,
					options,
				)
			}
			if (mergeResult.isConnectionLevelConflict) {
				return this.applyConnectionLevelMergeConflict(
					newData,
					updateType,
					mergeResult,
					options,
				)
			}

			return false
		}

		try {
			const mergedData = mergeResult.mergedData
			this.pendingRemoteDesignData = null
			this.saveManager.cancelAutoSave()
			this.saveManager.clearRemoteConflict()
			this.stateBag.setters.setIsSaving(false)
			const elementConflictRefresh = this.refreshElementConflictStateAfterRemoteMerge({
				remoteData: newData,
				remoteVersion: options?.remoteVersion,
				mergedData,
			})
			const nextDesignData = elementConflictRefresh.localData ?? mergedData
			this.stateBag.setters.setDesignData(nextDesignData)
			this.setSyncedRemoteBaseDesignData(newData)
			this.clearBlockingConflictState()
			this.options.onRemoteDesignDataUpdate?.(oldData, nextDesignData, updateType)
			if (!elementConflictRefresh.refreshed) {
				this.persistLocalDraft(nextDesignData)
				this.saveManager.scheduleAutoSave(undefined, { source: "remote-merge" })
			}
			return true
		} catch {
			return false
		}
	}

	private applyElementLevelMergeConflict(
		newData: DesignData,
		updateType: "message",
		mergeResult: ElementLevelMergeConflictResult,
		options?: { remoteVersion?: number | null },
	): boolean {
		if (!this.baseDesignData) return false

		try {
			const oldData = this.stateBag.getDesignData()
			const baseRemoteData = cloneDeep(this.baseDesignData) as DesignData
			const mergedData = mergeResult.mergedData
			const existingConflict = this.stateBag.getConflictState()
			const elementConflicts = this.mergeElementConflictsWithLatestRemote({
				existingElementConflicts: existingConflict?.elementConflicts ?? [],
				remoteData: newData,
				mergeResult,
			})
			const localData = this.buildLocalDataFromElementConflicts(mergedData, elementConflicts)
			const conflict = this.buildConflict({
				reason: "element-level-conflict",
				localData,
				remoteData: newData,
				remoteVersion: options?.remoteVersion ?? null,
				elementConflicts,
				mergedData,
			})

			this.pendingRemoteDesignData = null
			this.saveManager.cancelAutoSave()
			this.saveManager.clearRemoteConflict()
			this.stateBag.setters.setIsSaving(false)
			this.stateBag.setters.setDesignData(localData)
			this.setSyncedRemoteBaseDesignData(newData)
			this.options.onRemoteDesignDataUpdate?.(oldData, localData, updateType)
			this.setConflictState(conflict)
			this.writeConflictLocalDraftNow(conflict, localData, baseRemoteData)

			return true
		} catch {
			return false
		}
	}

	private applyConnectionLevelMergeConflict(
		newData: DesignData,
		updateType: "message",
		mergeResult: ConnectionLevelMergeConflictResult,
		options?: { remoteVersion?: number | null },
	): boolean {
		if (!this.baseDesignData) return false

		try {
			const oldData = this.stateBag.getDesignData()
			const baseRemoteData = cloneDeep(this.baseDesignData) as DesignData
			const mergedData = mergeResult.mergedData
			const existingConflict = this.stateBag.getConflictState()
			const connectionConflicts = this.buildConnectionConflicts(
				mergeResult,
				existingConflict?.connectionConflicts ?? [],
			)
			const localData = this.buildLocalDataFromConnectionConflicts(
				mergedData,
				connectionConflicts,
			)
			const conflict = this.buildConflict({
				reason: "connection-level-conflict",
				localData,
				remoteData: newData,
				remoteVersion: options?.remoteVersion ?? null,
				connectionConflicts,
				mergedData,
			})

			this.pendingRemoteDesignData = null
			this.saveManager.cancelAutoSave()
			this.saveManager.clearRemoteConflict()
			this.stateBag.setters.setIsSaving(false)
			this.stateBag.setters.setDesignData(localData)
			this.setSyncedRemoteBaseDesignData(newData)
			this.options.onRemoteDesignDataUpdate?.(oldData, localData, updateType)
			this.setConflictState(conflict)
			this.writeConflictLocalDraftNow(conflict, localData, baseRemoteData)

			return true
		} catch {
			return false
		}
	}

	private applyRemoteDesignDataSafely(
		newData: DesignData,
		updateType: "message" | "revoke" | "restore",
		options?: { remoteVersion?: number | null },
	): boolean {
		if (this.isVersionDataSourceLocked()) {
			return false
		}
		if (this.hasUnsafeLocalChanges()) {
			if (this.tryMergeRemoteDesignData(newData, updateType, options)) {
				return true
			}
			this.deferRemoteDesignData(newData, updateType, {
				remoteVersion: options?.remoteVersion,
			})
			return false
		}

		return this.applyRemoteDesignDataNow(newData, updateType)
	}

	private tryApplyPendingRemoteDesignData(): boolean {
		const pending = this.pendingRemoteDesignData
		if (!pending || this.isVersionDataSourceLocked() || this.hasUnsafeLocalChanges()) {
			return false
		}
		const applied = this.applyRemoteDesignDataNow(pending.data, pending.updateType)
		if (applied && pending.remoteVersion !== null) {
			this.updateLocalVersionIfNewer(pending.remoteVersion)
		}
		return applied
	}

	private clearPendingRemoteDesignData(): void {
		this.pendingRemoteDesignData = null
		this.saveManager.clearRemoteConflict()
		this.clearConflictState()
	}

	scheduleAutoSave(metadata?: DesignSaveMetadata): void {
		if (this.isVersionDataSourceLocked()) {
			return
		}
		if (this.hasUnresolvedConnectionConflicts()) {
			return
		}
		if (this.hasUnresolvedElementConflicts()) {
			const remoteSaveData = this.getRemoteSaveDataForCurrentElementConflicts()
			if (!remoteSaveData) {
				return
			}
			this.saveManager.scheduleAutoSave(remoteSaveData, {
				...metadata,
				source: metadata?.source ?? "conflict-resolution",
			})
			return
		}
		this.saveManager.scheduleAutoSave(undefined, metadata)
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
			!this.isVersionDataSourceLocked() &&
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

	private writeLocalDraftNow(
		designData: DesignData,
		reason: DesignDraftReason,
		baseSnapshot: LocalDraftBaseSnapshot | null = this.getLocalDraftBaseSnapshot(),
	): void {
		if (!this.canUseLocalDraft()) {
			return
		}
		if (!baseSnapshot) {
			return
		}

		const localFingerprint = hashDesignDataComparable(designData)
		const identity = this.getDraftIdentity()
		if (localFingerprint === baseSnapshot.baseRemoteFingerprint) {
			this.clearLocalDraftBecauseAlreadySynced()
			return
		}

		const shouldWriteEmergencyDraft = reason === "pagehide" || reason === "manual-refresh"

		void writeDesignDraft(
			{
				...identity,
				designProjectBasePath: this.getDesignProjectBasePath(),
				baseRemoteVersion: baseSnapshot.baseRemoteVersion,
				baseRemoteFingerprint: baseSnapshot.baseRemoteFingerprint,
				localFingerprint,
				localUpdatedAt: Date.now(),
				reason,
				designData,
				baseRemoteData: baseSnapshot.baseRemoteData,
			},
			{ emergency: shouldWriteEmergencyDraft },
		).then((result) => this.handleLocalDraftWriteResult(result, reason))
	}

	private writeConflictLocalDraftNow(
		conflict: DesignConflict,
		localData: DesignData,
		baseRemoteData?: DesignData,
	): void {
		if (!this.canUseLocalDraft()) {
			return
		}

		const baseRemoteFingerprint = conflict.baseFingerprint || conflict.remoteFingerprint
		if (!baseRemoteFingerprint) {
			return
		}

		const matchingBaseRemoteData =
			baseRemoteData && hashDesignDataComparable(baseRemoteData) === baseRemoteFingerprint
				? (cloneDeep(baseRemoteData) as DesignData)
				: hashDesignDataComparable(conflict.remoteData) === baseRemoteFingerprint
					? (cloneDeep(conflict.remoteData) as DesignData)
					: undefined
		const localFingerprint = hashDesignDataComparable(localData)
		void writeDesignDraft({
			...this.getDraftIdentity(),
			designProjectBasePath: this.getDesignProjectBasePath(),
			baseRemoteVersion: conflict.baseVersion,
			baseRemoteFingerprint,
			localFingerprint,
			localUpdatedAt: Date.now(),
			reason: "local-edit",
			designData: localData,
			baseRemoteData: matchingBaseRemoteData,
		}).then((result) => this.handleLocalDraftWriteResult(result, "local-edit"))
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
	}

	persistLocalDraft(
		designData: DesignData,
		options: { immediate?: boolean; reason?: DesignDraftReason } = {},
	): void {
		if (this.isVersionDataSourceLocked()) {
			this.clearPendingLocalDraftTimer()
			return
		}
		const reason = options.reason ?? "local-edit"
		const draftDesignData = this.getLocalDraftDataForCurrentConflict(designData)
		const baseSnapshot = this.getLocalDraftBaseSnapshot()
		if (options.immediate) {
			this.clearPendingLocalDraftTimer()
			this.writeLocalDraftNow(draftDesignData, reason, baseSnapshot)
			return
		}
		if (!baseSnapshot) {
			this.clearPendingLocalDraftTimer()
			return
		}

		this.pendingDraftSave = {
			designData: cloneDeep(draftDesignData) as DesignData,
			reason,
			baseSnapshot,
		}
		if (this.draftSaveTimer) {
			clearTimeout(this.draftSaveTimer)
		}
		this.draftSaveTimer = setTimeout(() => {
			const pending = this.pendingDraftSave
			this.draftSaveTimer = null
			this.pendingDraftSave = null
			if (!pending) return
			this.writeLocalDraftNow(pending.designData, pending.reason, pending.baseSnapshot)
		}, getDesignDraftWriteDebounceMs())
	}

	private clearLocalDraft(): void {
		this.clearPendingLocalDraftTimer()
		void deleteDesignDraft(this.getDraftIdentity())
	}

	private clearLocalDraftAfterFullyPersistedSave(): void {
		this.clearLocalDraft()
	}

	private clearLocalDraftBecauseAlreadySynced(): void {
		this.clearLocalDraft()
	}

	private clearLocalDraftBecauseRemoteAccepted(): void {
		this.clearLocalDraft()
	}

	private clearLocalDraftBecauseVersionSwitched(): void {
		this.clearLocalDraft()
	}

	private tryMergeRemoteAdvancedDraft(options: {
		draft: DesignDraftEntry
		draftData: DesignData
		baseData: DesignData
		remoteData: DesignData
		remoteVersion: number | null
		remoteFingerprint: string
	}): boolean {
		const { draft, draftData, baseData, remoteData, remoteVersion, remoteFingerprint } = options
		const mergeResult = mergeDesignDataByElement({
			baseData,
			localData: draftData,
			remoteData,
		})
		const oldData = this.stateBag.getDesignData()

		if (mergeResult.ok) {
			const mergedData = mergeResult.mergedData
			this.stateBag.setters.setDesignData(mergedData)
			this.setSyncedRemoteBaseDesignData(remoteData)
			this.options.onRemoteDesignDataUpdate?.(oldData, mergedData, "draft")
			if (!this.shouldAutoSaveRestoredDraft(mergedData, remoteData)) {
				this.enterDraftRestoreConflictForUnsafeEmptyLocal({
					localData: mergedData,
					remoteData,
					baseRemoteData: baseData,
					baseVersion: draft.baseRemoteVersion,
					remoteVersion,
					baseFingerprint: draft.baseRemoteFingerprint,
					localFingerprint: hashDesignDataComparable(mergedData),
					remoteFingerprint,
				})
				return true
			}
			this.clearConflictState()
			this.persistLocalDraft(mergedData, { immediate: true })
			this.saveManager.scheduleAutoSave(undefined, { source: "draft-restore" })
			return true
		}

		if (!mergeResult.isElementLevelConflict && !mergeResult.isConnectionLevelConflict) {
			return false
		}

		const mergedData = mergeResult.mergedData
		const elementConflicts = mergeResult.isElementLevelConflict
			? this.buildElementConflicts(mergeResult)
			: undefined
		const connectionConflicts = mergeResult.isConnectionLevelConflict
			? this.buildConnectionConflicts(mergeResult)
			: undefined
		let localData = mergedData
		if (elementConflicts) {
			localData = this.buildLocalDataFromElementConflicts(localData, elementConflicts)
		}
		if (connectionConflicts) {
			localData = this.buildLocalDataFromConnectionConflicts(localData, connectionConflicts)
		}
		const conflict = this.buildConflict({
			reason: mergeResult.isConnectionLevelConflict
				? "connection-level-conflict"
				: "element-level-conflict",
			localData,
			remoteData,
			baseVersion: draft.baseRemoteVersion,
			localVersion: draft.baseRemoteVersion,
			remoteVersion,
			baseFingerprint: draft.baseRemoteFingerprint,
			localFingerprint: hashDesignDataComparable(localData),
			remoteFingerprint,
			elementConflicts,
			connectionConflicts,
			mergedData,
		})

		this.pendingRemoteDesignData = null
		this.saveManager.cancelAutoSave()
		this.saveManager.clearRemoteConflict()
		this.stateBag.setters.setIsSaving(false)
		this.stateBag.setters.setDesignData(localData)
		this.setSyncedRemoteBaseDesignData(remoteData)
		this.options.onRemoteDesignDataUpdate?.(oldData, localData, "draft")
		this.setConflictState(conflict)
		this.writeConflictLocalDraftNow(conflict, localData, baseData)
		return true
	}

	private async tryRestoreLocalDraftAfterRemoteLoad(): Promise<void> {
		if (!this.canUseLocalDraft()) {
			return
		}

		const identity = this.getDraftIdentity()
		const draft = await readDesignDraft(identity)
		if (!draft) {
			return
		}

		const remoteFingerprint = this.stateBag.getPrevDesignDataFingerprint()
		if (!remoteFingerprint) {
			return
		}
		this.syncBaseDesignDataFromCurrent()
		if (draft.localFingerprint === remoteFingerprint) {
			this.clearLocalDraftBecauseAlreadySynced()
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
			const draftData = cloneDeep(draft.designData) as DesignData
			const dslBase = this.getDesignProjectBasePath()
			if (dslBase) {
				normalizeDesignDataPathsAfterLoad(draftData, dslBase, {
					flatAttachments: this.options.flatAttachments,
					attachmentIndex: this.options.attachmentIndex,
				})
			}
			const draftBaseData = draft.baseRemoteData
				? (cloneDeep(draft.baseRemoteData) as DesignData)
				: null
			if (draftBaseData) {
				if (dslBase) {
					normalizeDesignDataPathsAfterLoad(draftBaseData, dslBase, {
						flatAttachments: this.options.flatAttachments,
						attachmentIndex: this.options.attachmentIndex,
					})
				}
				if (
					this.tryMergeRemoteAdvancedDraft({
						draft,
						draftData,
						baseData: draftBaseData,
						remoteData: this.stateBag.getDesignData(),
						remoteVersion,
						remoteFingerprint,
					})
				) {
					return
				}
			}
			this.setConflictState(
				this.buildConflict({
					reason: "draft-remote-advanced",
					localData: draftData,
					remoteData: this.stateBag.getDesignData(),
					baseVersion: draft.baseRemoteVersion,
					localVersion: draft.baseRemoteVersion,
					remoteVersion,
					baseFingerprint: draft.baseRemoteFingerprint,
					localFingerprint: draft.localFingerprint,
					remoteFingerprint,
				}),
			)
			return
		}

		const restoredData = cloneDeep(draft.designData) as DesignData
		const dslBase = this.getDesignProjectBasePath()
		if (dslBase) {
			normalizeDesignDataPathsAfterLoad(restoredData, dslBase, {
				flatAttachments: this.options.flatAttachments,
				attachmentIndex: this.options.attachmentIndex,
			})
		}

		const oldData = this.stateBag.getDesignData()
		this.stateBag.setters.setDesignData(restoredData)
		this.stateBag.setPrevDesignDataFingerprint(remoteFingerprint)
		this.options.onRemoteDesignDataUpdate?.(oldData, restoredData, "draft")
		if (!this.shouldAutoSaveRestoredDraft(restoredData, oldData)) {
			this.enterDraftRestoreConflictForUnsafeEmptyLocal({
				localData: restoredData,
				remoteData: oldData,
				baseRemoteData: this.baseDesignData ?? oldData,
				baseVersion: draft.baseRemoteVersion,
				remoteVersion,
				baseFingerprint: draft.baseRemoteFingerprint || remoteFingerprint,
				localFingerprint: draft.localFingerprint,
				remoteFingerprint,
			})
			return
		}
		this.saveManager.scheduleAutoSave(undefined, { source: "draft-restore" })
	}

	private async handleSaveResultConflict(saveResult: DesignSaveResult): Promise<boolean> {
		if (saveResult.ok) {
			if (!this.hasUnresolvedMergeConflicts()) {
				this.clearConflictState()
			}
			return false
		}
		if (saveResult.reason !== "remote-updated") return false

		try {
			const { data, version } = await this.versionManager.loadLatest()
			if (!data) return false
			const remoteVersion = saveResult.remoteVersion ?? version
			if (
				this.tryMergeRemoteDesignData(data, "message", {
					remoteVersion,
				})
			) {
				if (remoteVersion !== null) {
					this.updateLocalVersionIfNewer(remoteVersion)
				}
				return true
			}
			this.deferRemoteDesignData(data, "message", {
				reason: "save-version-conflict",
				remoteVersion,
			})
			return true
		} catch {
			return false
		}
	}

	private refreshElementConflictStateAfterRemoteSave(
		savedRemoteData: DesignData,
		saveResult: DesignSaveResult,
	): void {
		const existingConflict = this.stateBag.getConflictState()
		if (!this.hasUnresolvedElementConflicts(existingConflict) || !existingConflict) return

		const elementConflicts = refreshDesignElementConflictsFromRemoteData(
			existingConflict.elementConflicts ?? [],
			savedRemoteData,
		)
		const localData = this.buildLocalDataFromElementConflicts(
			this.stateBag.getDesignData(),
			elementConflicts,
		)
		const remoteFingerprint = hashDesignDataComparable(savedRemoteData)
		const remoteVersion = saveResult.ok
			? (saveResult.savedVersion ?? existingConflict.remoteVersion)
			: existingConflict.remoteVersion
		const nextConflict: DesignConflict = {
			...existingConflict,
			reason: "element-level-conflict",
			baseVersion: remoteVersion,
			remoteVersion,
			baseFingerprint: remoteFingerprint,
			localFingerprint: hashDesignDataComparable(localData),
			remoteFingerprint,
			localData,
			remoteData: cloneDeep(savedRemoteData) as DesignData,
			mergedData: cloneDeep(savedRemoteData) as DesignData,
			elementConflicts,
		}

		this.setConflictState(nextConflict)
		this.writeConflictLocalDraftNow(nextConflict, localData)
	}

	private handleSuccessfulSaveResult(saveResult: DesignSaveResult): void {
		if (!saveResult.ok || !saveResult.fullyPersisted) return

		const savedRemoteData = saveResult.savedDesignData
		if (!savedRemoteData) {
			this.syncBaseDesignDataFromCurrent()
			return
		}

		this.setSyncedRemoteBaseDesignData(savedRemoteData)
		if (this.hasUnresolvedElementConflicts()) {
			this.refreshElementConflictStateAfterRemoteSave(savedRemoteData, saveResult)
			return
		}
		if (this.hasUnresolvedConnectionConflicts()) return
		this.clearConflictState()
	}

	async manualSave(): Promise<void> {
		if (this.isVersionDataSourceLocked()) {
			return
		}
		if (this.hasUnresolvedConnectionConflicts()) {
			this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
			return
		}
		if (this.hasUnresolvedElementConflicts()) {
			const remoteSaveData = this.getRemoteSaveDataForCurrentElementConflicts()
			if (!remoteSaveData) {
				this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
				return
			}
			this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
			this.saveManager.cancelAutoSave()
			this.stateBag.setters.setIsSaving(true)
			const saveResult = await this.saveManager.commitSave({
				allowRemoteConflict: true,
				designData: remoteSaveData,
				updateCurrentDesignData: false,
				source: "conflict-resolution",
			})
			if (saveResult.ok) {
				this.handleSuccessfulSaveResult(saveResult)
				this.pendingRemoteDesignData = null
				return
			}
			await this.handleSaveResultConflict(saveResult)
			this.tryApplyPendingRemoteDesignData()
			return
		}
		if (this.hasBlockingConflict()) {
			return
		}
		const saveResult = await this.saveManager.manualSave()
		if (saveResult.ok) {
			this.handleSuccessfulSaveResult(saveResult)
			if (
				this.saveManager.wasLastSaveFullyPersisted() &&
				!this.hasUnresolvedMergeConflicts()
			) {
				this.clearLocalDraftAfterFullyPersistedSave()
			}
			this.pendingRemoteDesignData = null
			return
		}
		await this.handleSaveResultConflict(saveResult)
		this.tryApplyPendingRemoteDesignData()
	}

	syncDesignData(newDesignData: DesignData): void {
		if (this.isVersionDataSourceLocked() || this.hasBlockingConflict()) {
			return
		}
		this.saveManager.syncDesignData(newDesignData)
		this.setBaseDesignData(newDesignData)
		this.tryApplyPendingRemoteDesignData()
	}

	async loadFromRemote(): Promise<void> {
		this.clearPendingRemoteDesignData()
		await this.loadManager.loadFromRemote()
		this.syncBaseDesignDataFromCurrent()
		await this.tryRestoreLocalDraftAfterRemoteLoad()
	}

	async reloadPreservingLocalDraft(): Promise<void> {
		this.clearPendingRemoteDesignData()
		await this.loadManager.resetAndReload()
		this.syncBaseDesignDataFromCurrent()
		await this.tryRestoreLocalDraftAfterRemoteLoad()
	}

	async reloadDiscardingLocalDraft(): Promise<void> {
		this.clearPendingRemoteDesignData()
		this.clearLocalDraftBecauseVersionSwitched()
		await this.loadManager.resetAndReload()
		this.syncBaseDesignDataFromCurrent()
	}

	async saveToRemote(): Promise<void> {
		if (this.isVersionDataSourceLocked()) return
		if (this.getIsReadOnly()) return
		if (this.hasUnresolvedConnectionConflicts()) {
			this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
			return
		}
		if (this.hasUnresolvedElementConflicts()) {
			const remoteSaveData = this.getRemoteSaveDataForCurrentElementConflicts()
			if (!remoteSaveData) {
				this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
				return
			}
			this.persistLocalDraft(this.stateBag.getDesignData(), { immediate: true })
			this.stateBag.setters.setIsSaving(true)
			const saveResult = await this.saveManager.commitSave({
				designData: remoteSaveData,
				updateCurrentDesignData: false,
				source: "conflict-resolution",
			})
			if (saveResult.ok) {
				this.handleSuccessfulSaveResult(saveResult)
				this.pendingRemoteDesignData = null
				return
			}
			await this.handleSaveResultConflict(saveResult)
			this.tryApplyPendingRemoteDesignData()
			return
		}
		if (this.hasBlockingConflict()) {
			return
		}
		this.stateBag.setters.setIsSaving(true)
		const saveResult = await this.saveManager.commitSave({ source: "manual-save" })
		if (saveResult.ok) {
			this.handleSuccessfulSaveResult(saveResult)
			if (
				this.saveManager.wasLastSaveFullyPersisted() &&
				!this.hasUnresolvedMergeConflicts()
			) {
				this.clearLocalDraftAfterFullyPersistedSave()
			}
			this.pendingRemoteDesignData = null
			return
		}
		await this.handleSaveResultConflict(saveResult)
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

	async handleChangeFileVersion(version: number, isNewestVersion: boolean): Promise<void> {
		const unlockVersionDataSource = this.lockVersionDataSource()
		try {
			this.clearPendingRemoteDesignData()
			this.clearLocalDraftBecauseVersionSwitched()
			this.saveManager.cancelAutoSave()
			await this.versionManager.handleChangeFileVersion(version, isNewestVersion)
			this.syncBaseDesignDataFromCurrent()
		} finally {
			unlockVersionDataSource()
		}
	}

	async handleReturnLatest(): Promise<void> {
		const unlockVersionDataSource = this.lockVersionDataSource()
		try {
			this.clearPendingRemoteDesignData()
			this.clearLocalDraftBecauseVersionSwitched()
			this.saveManager.cancelAutoSave()
			await this.versionManager.handleReturnLatest()
			this.syncBaseDesignDataFromCurrent()
		} finally {
			unlockVersionDataSource()
		}
	}

	async handleVersionRollback(version?: number): Promise<void> {
		const unlockVersionDataSource = this.lockVersionDataSource()
		try {
			this.clearPendingRemoteDesignData()
			this.clearLocalDraftBecauseVersionSwitched()
			this.saveManager.cancelAutoSave()
			await this.versionManager.handleVersionRollback(version)
			this.syncBaseDesignDataFromCurrent()
		} finally {
			unlockVersionDataSource()
		}
	}

	fetchFileVersions(): Promise<FileHistoryVersion[]> {
		return this.versionManager.fetchFileVersions()
	}

	setIsReadOnly(value: boolean): void {
		this.stateBag.setters.setIsReadOnly(value)
	}

	private resolveElementConflicts(options: {
		elementIds: string[]
		resolution: "use-local" | "use-remote"
		nextDesignData?: DesignData
		trigger: "user-edit" | "explicit-local" | "explicit-remote"
	}): boolean {
		const conflict = this.stateBag.getConflictState()
		if (!conflict?.elementConflicts?.length) return false

		const targetElementIds = new Set(options.elementIds)
		const resolvedAt = Date.now()
		let didResolve = false
		const elementConflicts = conflict.elementConflicts.map((elementConflict) => {
			if (
				elementConflict.status !== "unresolved" ||
				!targetElementIds.has(elementConflict.elementId)
			) {
				return elementConflict
			}

			didResolve = true
			return {
				...elementConflict,
				status: "resolved" as const,
				resolution: options.resolution,
				resolvedAt,
			}
		})

		if (!didResolve) return false

		const unresolvedElementIds = elementConflicts
			.filter(({ status }) => status === "unresolved")
			.map(({ elementId }) => elementId)
		const currentData = options.nextDesignData ?? this.stateBag.getDesignData()
		const nextLocalData = this.buildLocalDataFromMergeConflicts(currentData, {
			elementConflicts,
			connectionConflicts: conflict.connectionConflicts,
		})
		const nextConflict: DesignConflict = {
			...conflict,
			elementConflicts,
			localData: cloneDeep(nextLocalData) as DesignData,
			mergedData: options.nextDesignData
				? (cloneDeep(options.nextDesignData) as DesignData)
				: conflict.mergedData,
			localFingerprint: hashDesignDataComparable(nextLocalData),
		}

		if (unresolvedElementIds.length > 0 || this.hasUnresolvedMergeConflicts(nextConflict)) {
			this.setConflictState(nextConflict)
			this.writeConflictLocalDraftNow(nextConflict, nextLocalData)
			return true
		}

		this.clearConflictState()
		if (
			hashDesignDataComparable(currentData) === this.stateBag.getPrevDesignDataFingerprint()
		) {
			this.clearLocalDraftBecauseAlreadySynced()
		} else {
			this.persistLocalDraft(currentData)
		}
		return true
	}

	private tryAutoMergeSingleElementConflict(
		elementConflict: DesignElementConflict,
		resolution: "use-local" | "use-remote",
	): boolean {
		if (
			elementConflict.reason !== "same-element-changed" ||
			!elementConflict.baseElement ||
			!elementConflict.localElement ||
			!elementConflict.remoteElement ||
			elementConflict.baseParentId !== elementConflict.localParentId ||
			elementConflict.baseParentId !== elementConflict.remoteParentId
		) {
			return false
		}

		const mergedElement = tryMergeCanvasElementsByField(
			elementConflict.baseElement,
			elementConflict.localElement,
			elementConflict.remoteElement,
		)
		if (!mergedElement) return false

		const oldData = this.stateBag.getDesignData()
		const patchResult = tryApplyCanvasDocumentPatch(
			oldData.canvas,
			{
				upserts: [
					{
						element: mergedElement,
						parentId: elementConflict.remoteParentId,
					},
				],
				deletedElementIds: [],
				changedElementIds: [elementConflict.elementId],
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) return false

		const nextData: DesignData = {
			...oldData,
			canvas: patchResult.canvas,
		}
		this.stateBag.setters.setDesignData(nextData)
		this.options.onRemoteDesignDataUpdate?.(oldData, nextData, "draft")
		const didResolve = this.resolveElementConflicts({
			elementIds: [elementConflict.elementId],
			resolution,
			nextDesignData: nextData,
			trigger: "user-edit",
		})
		if (didResolve) {
			this.scheduleAutoSave({ source: "conflict-resolution" })
		}
		return didResolve
	}

	clearConflictState(): void {
		this.conflictState = null
		this.stateBag.setters.setConflictState(null)
	}

	resolveBlockingConflictWithRemote(): boolean {
		const conflict = this.stateBag.getConflictState()
		if (
			conflict &&
			this.hasUnresolvedConnectionConflicts(conflict) &&
			!this.hasUnresolvedElementConflicts(conflict)
		) {
			return this.resolveAllConnectionConflictsWithRemote()
		}
		if (!conflict || this.hasUnresolvedMergeConflicts(conflict)) return false

		const pending = this.pendingRemoteDesignData
		const remoteData = cloneDeep(pending?.data ?? conflict.remoteData) as DesignData
		const updateType = pending?.updateType ?? "message"
		const remoteVersion = pending?.remoteVersion ?? conflict.remoteVersion
		const applied = this.applyRemoteDesignDataNow(remoteData, updateType)
		if (!applied) return false

		if (remoteVersion !== null) {
			this.updateLocalVersionIfNewer(remoteVersion)
		}
		this.clearLocalDraftBecauseRemoteAccepted()
		return true
	}

	async resolveBlockingConflictWithLocal(): Promise<boolean> {
		const conflict = this.stateBag.getConflictState()
		if (
			conflict &&
			this.hasUnresolvedConnectionConflicts(conflict) &&
			!this.hasUnresolvedElementConflicts(conflict)
		) {
			return this.resolveAllConnectionConflictsWithLocal()
		}
		if (!conflict || this.hasUnresolvedMergeConflicts(conflict)) return false

		const localData = cloneDeep(conflict.localData) as DesignData
		const oldData = this.stateBag.getDesignData()
		this.saveManager.cancelAutoSave()
		this.stateBag.setters.setDesignData(localData)
		this.options.onRemoteDesignDataUpdate?.(oldData, localData, "draft")
		this.persistLocalDraft(localData, { immediate: true })

		this.stateBag.setters.setIsSaving(true)
		const saveResult = await this.saveManager.commitSave({
			allowRemoteConflict: true,
			designData: localData,
			updateCurrentDesignData: true,
			skipRemoteUpdateCheck: true,
			source: "conflict-resolution",
		})
		if (saveResult.ok) {
			this.pendingRemoteDesignData = null
			this.saveManager.clearRemoteConflict()
			if (saveResult.fullyPersisted) {
				this.handleSuccessfulSaveResult(saveResult)
			} else {
				this.clearConflictState()
			}
			if (
				this.saveManager.wasLastSaveFullyPersisted() &&
				!this.hasUnresolvedMergeConflicts()
			) {
				this.clearLocalDraftAfterFullyPersistedSave()
			}
			return true
		}

		return false
	}

	private resolveConnectionConflicts(options: {
		connectionIds: string[]
		resolution: "use-local" | "use-remote"
		nextDesignData?: DesignData
	}): boolean {
		const conflict = this.stateBag.getConflictState()
		if (!conflict?.connectionConflicts?.length) return false

		const targetConnectionIds = new Set(options.connectionIds)
		const resolvedAt = Date.now()
		let didResolve = false
		const connectionConflicts = conflict.connectionConflicts.map((connectionConflict) => {
			if (
				connectionConflict.status !== "unresolved" ||
				!targetConnectionIds.has(connectionConflict.connectionId)
			) {
				return connectionConflict
			}

			didResolve = true
			return {
				...connectionConflict,
				status: "resolved" as const,
				resolution: options.resolution,
				resolvedAt,
			}
		})

		if (!didResolve) return false

		const currentData = options.nextDesignData ?? this.stateBag.getDesignData()
		const nextLocalData = this.buildLocalDataFromMergeConflicts(currentData, {
			elementConflicts: conflict.elementConflicts,
			connectionConflicts,
		})
		const nextConflict: DesignConflict = {
			...conflict,
			connectionConflicts,
			localData: cloneDeep(nextLocalData) as DesignData,
			mergedData: options.nextDesignData
				? (cloneDeep(options.nextDesignData) as DesignData)
				: conflict.mergedData,
			localFingerprint: hashDesignDataComparable(nextLocalData),
		}

		if (this.hasUnresolvedMergeConflicts(nextConflict)) {
			this.setConflictState(nextConflict)
			this.writeConflictLocalDraftNow(nextConflict, nextLocalData)
			return true
		}

		this.clearConflictState()
		if (
			hashDesignDataComparable(currentData) === this.stateBag.getPrevDesignDataFingerprint()
		) {
			this.clearLocalDraftBecauseAlreadySynced()
		} else {
			this.persistLocalDraft(currentData)
		}
		return true
	}

	resolveElementConflictWithLocal(elementId: string): boolean {
		const conflict = this.stateBag.getConflictState()
		const elementConflict = conflict?.elementConflicts?.find(
			(item) => item.elementId === elementId && item.status === "unresolved",
		)
		if (!conflict || !elementConflict) return false
		if (this.tryAutoMergeSingleElementConflict(elementConflict, "use-local")) {
			return true
		}

		const oldData = this.stateBag.getDesignData()
		const patchResult = tryApplyCanvasDocumentPatch(
			oldData.canvas,
			{
				upserts: elementConflict.localElement
					? [
							{
								element: cloneDeep(elementConflict.localElement),
								parentId: elementConflict.localParentId,
							},
						]
					: [],
				deletedElementIds: elementConflict.localElement ? [] : [elementId],
				changedElementIds: [elementId],
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) {
			return false
		}
		const nextData: DesignData = {
			...oldData,
			canvas: patchResult.canvas,
		}

		this.stateBag.setters.setDesignData(nextData)
		this.options.onRemoteDesignDataUpdate?.(oldData, nextData, "draft")
		const didResolve = this.resolveElementConflicts({
			elementIds: [elementId],
			resolution: "use-local",
			nextDesignData: nextData,
			trigger: "explicit-local",
		})
		if (didResolve) {
			this.scheduleAutoSave({ source: "conflict-resolution" })
		}
		return didResolve
	}

	resolveElementConflictWithRemote(elementId: string): boolean {
		const conflict = this.stateBag.getConflictState()
		const elementConflict = conflict?.elementConflicts?.find(
			(item) => item.elementId === elementId && item.status === "unresolved",
		)
		if (!conflict || !elementConflict) return false
		if (this.tryAutoMergeSingleElementConflict(elementConflict, "use-remote")) {
			return true
		}

		const oldData = this.stateBag.getDesignData()
		const patchResult = tryApplyCanvasDocumentPatch(
			oldData.canvas,
			{
				upserts: elementConflict.remoteElement
					? [
							{
								element: cloneDeep(elementConflict.remoteElement),
								parentId: elementConflict.remoteParentId,
							},
						]
					: [],
				deletedElementIds: elementConflict.remoteElement ? [] : [elementId],
				changedElementIds: [elementId],
			},
			{ strictParent: true },
		)
		if (!patchResult.ok) {
			return false
		}
		const nextData: DesignData = {
			...oldData,
			canvas: patchResult.canvas,
		}

		this.stateBag.setters.setDesignData(nextData)
		this.options.onRemoteDesignDataUpdate?.(oldData, nextData, "draft")
		const didResolve = this.resolveElementConflicts({
			elementIds: [elementId],
			resolution: "use-remote",
			nextDesignData: nextData,
			trigger: "explicit-remote",
		})
		if (
			didResolve &&
			hashDesignDataComparable(nextData) !== this.stateBag.getPrevDesignDataFingerprint()
		) {
			this.scheduleAutoSave({ source: "conflict-resolution" })
		}
		return didResolve
	}

	resolveConnectionConflictWithLocal(connectionId: string): boolean {
		return this.resolveSingleConnectionConflict(connectionId, "use-local")
	}

	resolveConnectionConflictWithRemote(connectionId: string): boolean {
		return this.resolveSingleConnectionConflict(connectionId, "use-remote")
	}

	private resolveSingleConnectionConflict(
		connectionId: string,
		resolution: "use-local" | "use-remote",
	): boolean {
		const conflict = this.stateBag.getConflictState()
		const connectionConflict = conflict?.connectionConflicts?.find(
			(item) => item.connectionId === connectionId && item.status === "unresolved",
		)
		if (!conflict || !connectionConflict) return false

		const oldData = this.stateBag.getDesignData()
		const nextData = this.applyConnectionConflictResolutionToData(
			oldData,
			[connectionConflict],
			resolution,
		)
		if (!nextData) return false

		this.stateBag.setters.setDesignData(nextData)
		this.options.onRemoteDesignDataUpdate?.(oldData, nextData, "draft")
		const didResolve = this.resolveConnectionConflicts({
			connectionIds: [connectionId],
			resolution,
			nextDesignData: nextData,
		})
		if (
			didResolve &&
			hashDesignDataComparable(nextData) !== this.stateBag.getPrevDesignDataFingerprint()
		) {
			this.scheduleAutoSave({ source: "conflict-resolution" })
		}
		return didResolve
	}

	private resolveAllConnectionConflictsWithRemote(): boolean {
		const conflict = this.stateBag.getConflictState()
		const unresolvedConnectionIds = this.getUnresolvedConnectionConflictIds(conflict)
		if (!conflict || unresolvedConnectionIds.length === 0) return false

		const unresolvedConnectionConflicts = (conflict.connectionConflicts ?? []).filter(
			({ connectionId, status }) =>
				status === "unresolved" && unresolvedConnectionIds.includes(connectionId),
		)
		const oldData = this.stateBag.getDesignData()
		const nextData = this.applyConnectionConflictResolutionToData(
			oldData,
			unresolvedConnectionConflicts,
			"use-remote",
		)
		if (!nextData) return false

		this.stateBag.setters.setDesignData(nextData)
		this.options.onRemoteDesignDataUpdate?.(oldData, nextData, "draft")
		const didResolve = this.resolveConnectionConflicts({
			connectionIds: unresolvedConnectionIds,
			resolution: "use-remote",
			nextDesignData: nextData,
		})
		if (
			didResolve &&
			hashDesignDataComparable(nextData) !== this.stateBag.getPrevDesignDataFingerprint()
		) {
			this.scheduleAutoSave({ source: "conflict-resolution" })
		}
		return didResolve
	}

	private async resolveAllConnectionConflictsWithLocal(): Promise<boolean> {
		const conflict = this.stateBag.getConflictState()
		const unresolvedConnectionIds = this.getUnresolvedConnectionConflictIds(conflict)
		if (!conflict || unresolvedConnectionIds.length === 0) return false

		const localData = cloneDeep(conflict.localData) as DesignData
		const oldData = this.stateBag.getDesignData()
		this.saveManager.cancelAutoSave()
		this.stateBag.setters.setDesignData(localData)
		this.options.onRemoteDesignDataUpdate?.(oldData, localData, "draft")
		const didResolve = this.resolveConnectionConflicts({
			connectionIds: unresolvedConnectionIds,
			resolution: "use-local",
			nextDesignData: localData,
		})
		if (!didResolve) return false

		this.persistLocalDraft(localData, { immediate: true })
		this.stateBag.setters.setIsSaving(true)
		const saveResult = await this.saveManager.commitSave({
			allowRemoteConflict: true,
			designData: localData,
			updateCurrentDesignData: true,
			skipRemoteUpdateCheck: true,
			source: "conflict-resolution",
		})
		if (saveResult.ok) {
			this.pendingRemoteDesignData = null
			this.saveManager.clearRemoteConflict()
			if (saveResult.fullyPersisted) {
				this.handleSuccessfulSaveResult(saveResult)
			} else {
				this.clearConflictState()
			}
			if (
				this.saveManager.wasLastSaveFullyPersisted() &&
				!this.hasUnresolvedMergeConflicts()
			) {
				this.clearLocalDraftAfterFullyPersistedSave()
			}
			return true
		}

		this.setConflictState(conflict)
		this.writeConflictLocalDraftNow(conflict, localData)
		return false
	}

	resolveEditedElementConflictsWithLocal(
		elementIds: string[],
		nextDesignData: DesignData,
		metadata?: DesignSaveMetadata,
	): boolean {
		if (!elementIds.length) return false
		const didResolve = this.resolveElementConflicts({
			elementIds,
			resolution: "use-local",
			nextDesignData,
			trigger: "user-edit",
		})
		if (didResolve) {
			this.scheduleAutoSave({
				...metadata,
				source: metadata?.source ?? "canvas-patch",
			})
		}
		return didResolve
	}

	getRemoteListener(): DesignRemoteListener | null {
		return this.remoteListener
	}
}

function noopDesignDataUpdater(
	_updater: (draft: DesignData) => void,
	_metadata?: DesignSaveMetadata,
): void {
	void _updater
	void _metadata
}
