import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { produce } from "immer"
import { useImmer } from "use-immer"
import { useMount, useUnmount } from "ahooks"
import type { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"
import { DesignData } from "../types"
import {
	DesignProjectManager,
	type DesignConflict,
	type DesignProjectManagerOptions,
	type DesignProjectStateBag,
	type DesignSaveMetadata,
} from "../managers"
import { MAGIC_PROJECT_VERSION_V2 } from "../utils/magicProjectCompression"
import type { DesignDraftReason } from "../utils/designDraftStorage"

export type UseDesignProjectManagerOptions = DesignProjectManagerOptions

export interface UseDesignProjectManagerReturn {
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

	isProcessingRevoke: boolean
	revokeType: "revoke" | "restore" | null
	conflictState: DesignConflict | null
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

	fileVersionsList: FileHistoryVersion[]
	fileVersion: number | undefined
	isNewestVersion: boolean
	handleChangeFileVersion: (version: number, isNewestVersion: boolean) => Promise<void>
	handleReturnLatest: () => Promise<void>
	handleVersionRollback: (version?: number) => Promise<void>
	fetchFileVersions: () => Promise<FileHistoryVersion[]>
}

const INITIAL_DESIGN_DATA: DesignData = {
	type: "design",
	name: "",
	version: MAGIC_PROJECT_VERSION_V2,
	canvas: { elements: [] },
}

function getTopLevelElementCount(data: DesignData | null | undefined): number {
	return data?.canvas?.elements?.length ?? 0
}

export function useDesignProjectManager(
	options: UseDesignProjectManagerOptions,
): UseDesignProjectManagerReturn {
	const { t } = useTranslation("super")

	const [magicProjectJsFileId, setMagicProjectJsFileId] = useState<string | null>(null)
	const [designData, updateDesignData] = useImmer<DesignData>(INITIAL_DESIGN_DATA)
	const [isInitialLoading, setIsInitialLoading] = useState(true)
	const [isReadOnly, setIsReadOnly] = useState(
		!options.allowEdit || options.isPlaybackMode || options.isShareRoute || options.isMobile,
	)
	const [isSaving, setIsSaving] = useState(false)
	const [fileVersionsList, setFileVersionsList] = useState<FileHistoryVersion[]>([])
	const [fileVersion, setFileVersion] = useState<number | undefined>(undefined)
	const [isProcessingRevoke, setIsProcessingRevoke] = useState(false)
	const [revokeType, setRevokeType] = useState<"revoke" | "restore" | null>(null)
	const [conflictState, setConflictState] = useState<DesignConflict | null>(null)

	const designDataRef = useRef(designData)
	const conflictStateRef = useRef<DesignConflict | null>(conflictState)
	const magicProjectJsFileIdRef = useRef<string | null>(null)
	const isReadOnlyRef = useRef(isReadOnly)
	const magicProjectJsVersionRef = useRef<number | null>(null)
	const prevDesignDataFingerprintRef = useRef<string>("")
	const fileVersionsListRef = useRef<FileHistoryVersion[]>([])
	const fileVersionRef = useRef<number | undefined>(undefined)

	designDataRef.current = designData
	conflictStateRef.current = conflictState
	magicProjectJsFileIdRef.current = magicProjectJsFileId
	isReadOnlyRef.current = isReadOnly
	fileVersionsListRef.current = fileVersionsList
	fileVersionRef.current = fileVersion

	const updateDesignDataState = useCallback(
		(updater: (draft: DesignData) => void) => {
			const nextData = produce(designDataRef.current, updater)
			designDataRef.current = nextData
			updateDesignData(() => nextData)
		},
		[updateDesignData],
	)

	const stateBag: DesignProjectStateBag = useMemo(
		() => ({
			getDesignData: () => designDataRef.current,
			getConflictState: () => conflictStateRef.current,
			getMagicProjectJsFileId: () => magicProjectJsFileIdRef.current,
			getMagicProjectJsVersion: () => magicProjectJsVersionRef.current,
			setMagicProjectJsVersion: (v) => {
				magicProjectJsVersionRef.current = v
			},
			getPrevDesignDataFingerprint: () => prevDesignDataFingerprintRef.current,
			setPrevDesignDataFingerprint: (v) => {
				prevDesignDataFingerprintRef.current = v
			},
			getIsReadOnly: () => isReadOnlyRef.current,
			setters: {
				setMagicProjectJsFileId,
				setDesignData: (data) => {
					designDataRef.current = data
					updateDesignData(() => data)
				},
				setIsInitialLoading,
				setIsSaving,
				setIsReadOnly: (v) => {
					isReadOnlyRef.current = v
					setIsReadOnly(v)
				},
				setFileVersionsList,
				setFileVersion,
				setIsProcessingRevoke,
				setRevokeType,
				setConflictState: (v) => {
					conflictStateRef.current = v
					setConflictState(v)
				},
			},
		}),
		[updateDesignData],
	)

	const managerRef = useRef<DesignProjectManager | null>(null)
	if (!managerRef.current) {
		managerRef.current = new DesignProjectManager({
			stateBag,
			options: { ...options, getT: () => t },
			getFileVersionsList: () => fileVersionsListRef.current,
			getFileVersion: () => fileVersionRef.current,
		})
	}

	const manager = managerRef.current

	useEffect(() => {
		manager.updateOptions({ ...options, getT: () => t })
	}, [manager, options, t])

	useEffect(() => {
		if (options.isShareRoute || !magicProjectJsFileId) return
		manager.fetchFileVersions()
	}, [manager, magicProjectJsFileId, options.isShareRoute])

	useMount(() => {
		manager.getRemoteListener()?.mount()
	})

	useUnmount(() => {
		manager.getRemoteListener()?.unmount()
	})

	const updateDesignDataAndScheduleSave = useCallback(
		(updater: (draft: DesignData) => void, metadata?: DesignSaveMetadata) => {
			if (!manager.canUpdateCurrentDesignData()) {
				return
			}
			const previousData = designDataRef.current
			const nextData = produce(previousData, updater)
			designDataRef.current = nextData
			updateDesignData(() => nextData)
			manager.persistLocalDraft(nextData)
			manager.scheduleAutoSave({
				...metadata,
				beforeElementCount:
					metadata?.beforeElementCount ?? getTopLevelElementCount(previousData),
				nextElementCount: metadata?.nextElementCount ?? getTopLevelElementCount(nextData),
			})
		},
		[updateDesignData, manager],
	)

	const isNewestVersion = useMemo(() => {
		if (!fileVersionsList?.length) return true
		if (!fileVersion) return true
		return fileVersion === fileVersionsList[0].version
	}, [fileVersion, fileVersionsList])

	return {
		magicProjectJsFileId,
		designData,
		updateDesignData: updateDesignDataState,
		updateDesignDataAndScheduleSave,

		isInitialLoading,
		isSaving,

		scheduleAutoSave: (metadata) => manager.scheduleAutoSave(metadata),
		cancelAutoSave: () => manager.cancelAutoSave(),
		persistLocalDraft: (data, persistOptions) =>
			manager.persistLocalDraft(data, persistOptions),
		manualSave: () => manager.manualSave(),
		syncDesignData: (data) => manager.syncDesignData(data),

		loadFromRemote: () => manager.loadFromRemote(),
		reloadPreservingLocalDraft: () => manager.reloadPreservingLocalDraft(),
		reloadDiscardingLocalDraft: () => manager.reloadDiscardingLocalDraft(),

		saveToRemote: () => manager.saveToRemote(),
		generateContent: (data) => manager.generateContent(data),

		loadWithVersion: (v) => manager.loadWithVersion(v),
		loadLatest: () => manager.loadLatest(),

		checkRemoteUpdate: () => manager.checkRemoteUpdate(),
		updateLocalVersion: (v) => manager.updateLocalVersion(v),

		isReadOnly,
		setIsReadOnly: (v) => manager.setIsReadOnly(v),

		isProcessingRevoke,
		revokeType,
		conflictState,
		clearConflictState: () => manager.clearConflictState(),
		resolveBlockingConflictWithRemote: () => manager.resolveBlockingConflictWithRemote(),
		resolveBlockingConflictWithLocal: () => manager.resolveBlockingConflictWithLocal(),
		resolveElementConflictWithLocal: (elementId) =>
			manager.resolveElementConflictWithLocal(elementId),
		resolveElementConflictWithRemote: (elementId) =>
			manager.resolveElementConflictWithRemote(elementId),
		resolveConnectionConflictWithLocal: (connectionId) =>
			manager.resolveConnectionConflictWithLocal(connectionId),
		resolveConnectionConflictWithRemote: (connectionId) =>
			manager.resolveConnectionConflictWithRemote(connectionId),
		resolveEditedElementConflictsWithLocal: (elementIds, nextDesignData, metadata) =>
			manager.resolveEditedElementConflictsWithLocal(elementIds, nextDesignData, metadata),

		fileVersionsList,
		fileVersion,
		isNewestVersion,
		handleChangeFileVersion: (v, isNew) => manager.handleChangeFileVersion(v, isNew),
		handleReturnLatest: () => manager.handleReturnLatest(),
		handleVersionRollback: (ver) => manager.handleVersionRollback(ver),
		fetchFileVersions: () => manager.fetchFileVersions(),
	}
}
