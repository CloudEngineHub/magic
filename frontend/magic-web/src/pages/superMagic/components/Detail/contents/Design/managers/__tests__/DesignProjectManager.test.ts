import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
	CanvasConnection,
	LayerElement,
} from "@/components/CanvasDesign/runtime/document/types"
import { DesignProjectManager } from "../DesignProjectManager"
import type { DesignConflict, DesignProjectManagerOptions, DesignProjectStateBag } from "../types"
import type { DesignData } from "../../types"
import {
	deleteDesignDraft,
	readDesignDraft,
	writeDesignDraft,
	type DesignDraftEntry,
} from "../../utils/designDraftStorage"
import { hashDesignDataComparable } from "../../utils/designContentHash"

vi.mock("../../utils/designDraftStorage", () => ({
	getDesignDraftWriteDebounceMs: vi.fn(() => 0),
	readDesignDraft: vi.fn(),
	writeDesignDraft: vi.fn(),
	deleteDesignDraft: vi.fn(),
}))

function rect(id: string, options: Partial<LayerElement> = {}): LayerElement {
	return {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		zIndex: 1,
		...options,
	}
}

function connection(
	id: string,
	sourceElementId = "source",
	targetElementId = "target",
): CanvasConnection {
	return { id, sourceElementId, targetElementId }
}

function createDesignData(
	name: string,
	elements: LayerElement[] = [],
	connections?: CanvasConnection[],
): DesignData {
	return {
		type: "design",
		name,
		version: "2.0.0",
		canvas: { elements, ...(connections ? { connections } : {}) },
	}
}

function createConflict(localData: DesignData, remoteData: DesignData): DesignConflict {
	return {
		reason: "draft-remote-advanced",
		baseVersion: 2,
		localVersion: 2,
		remoteVersion: 3,
		baseFingerprint: "base-fingerprint",
		localFingerprint: "local-fingerprint",
		remoteFingerprint: "remote-fingerprint",
		localData,
		remoteData,
		createdAt: 1,
	}
}

function getBaseDesignData(manager: DesignProjectManager): DesignData | null {
	return (manager as unknown as { baseDesignData: DesignData | null }).baseDesignData
}

function createManager(
	initialData = createDesignData("local"),
	optionsOverrides: Partial<DesignProjectManagerOptions> = {},
) {
	let designData = initialData
	let conflictState: DesignConflict | null = null
	let magicProjectJsFileId: string | null = "file-1"
	let magicProjectJsVersion: number | null = 2
	let prevDesignDataFingerprint = "initial-fingerprint"
	let isReadOnly = false

	const stateBag: DesignProjectStateBag = {
		getDesignData: () => designData,
		getConflictState: () => conflictState,
		getMagicProjectJsFileId: () => magicProjectJsFileId,
		getMagicProjectJsVersion: () => magicProjectJsVersion,
		setMagicProjectJsVersion: (v) => {
			magicProjectJsVersion = v
		},
		getPrevDesignDataFingerprint: () => prevDesignDataFingerprint,
		setPrevDesignDataFingerprint: (v) => {
			prevDesignDataFingerprint = v
		},
		getIsReadOnly: () => isReadOnly,
		setters: {
			setMagicProjectJsFileId: vi.fn((v: string | null) => {
				magicProjectJsFileId = v
			}),
			setDesignData: vi.fn((data: DesignData) => {
				designData = data
			}),
			setIsInitialLoading: vi.fn(),
			setIsSaving: vi.fn(),
			setIsReadOnly: vi.fn((v: boolean) => {
				isReadOnly = v
			}),
			setFileVersionsList: vi.fn(),
			setFileVersion: vi.fn(),
			setIsProcessingRevoke: vi.fn(),
			setRevokeType: vi.fn(),
			setConflictState: vi.fn((v: DesignConflict | null) => {
				conflictState = v
			}),
		},
	}

	const options: DesignProjectManagerOptions = {
		allowEdit: true,
		isPlaybackMode: false,
		isShareRoute: false,
		isMobile: false,
		projectId: "project-1",
		designProjectId: "design-1",
		designProjectName: "design",
		attachments: [],
		flatAttachments: [],
		...optionsOverrides,
	}

	const manager = new DesignProjectManager({
		stateBag,
		options,
		getFileVersionsList: () => [],
		getFileVersion: () => undefined,
	})

	return {
		manager,
		stateBag,
		getState: () => ({
			designData,
			conflictState,
			magicProjectJsVersion,
			prevDesignDataFingerprint,
		}),
	}
}

describe("DesignProjectManager conflict boundaries", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(readDesignDraft).mockResolvedValue(null)
		vi.mocked(writeDesignDraft).mockResolvedValue({ target: "memory", durable: false })
		vi.mocked(deleteDesignDraft).mockResolvedValue(undefined)
	})

	it("does not clear an active conflict while syncing design data", () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, stateBag, getState } = createManager(localData)
		const conflict = createConflict(localData, remoteData)
		stateBag.setters.setConflictState(conflict)
		stateBag.setPrevDesignDataFingerprint("conflict-base-fingerprint")

		manager.syncDesignData(remoteData)

		expect(getState().conflictState).toBe(conflict)
		expect(getState().prevDesignDataFingerprint).toBe("conflict-base-fingerprint")
	})

	it("stores a full cloned base design when syncing clean design data", () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager(localData)
		const remoteFingerprint = hashDesignDataComparable(remoteData)

		manager.syncDesignData(remoteData)

		const baseDesignData = getBaseDesignData(manager)
		expect(getState().prevDesignDataFingerprint).toBe(remoteFingerprint)
		expect(baseDesignData).toEqual(remoteData)
		expect(baseDesignData).not.toBe(remoteData)

		remoteData.name = "mutated-after-sync"
		expect(baseDesignData?.name).toBe("remote")
	})

	it("writes manual refresh drafts through the emergency fallback", () => {
		const draftData = createDesignData("manual-refresh", [rect("moved", { x: 120 })])
		const { manager } = createManager()

		manager.persistLocalDraft(draftData, { immediate: true, reason: "manual-refresh" })

		expect(writeDesignDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				designData: draftData,
				reason: "manual-refresh",
			}),
			{ emergency: true },
		)
	})

	it("force reloads remote data while preserving local draft recovery", async () => {
		const { manager } = createManager()
		const managerInternals = manager as unknown as {
			loadManager: { resetAndReload: () => Promise<void> }
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
		}
		managerInternals.loadManager.resetAndReload = vi.fn().mockResolvedValue(undefined)
		managerInternals.tryRestoreLocalDraftAfterRemoteLoad = vi.fn().mockResolvedValue(undefined)

		await manager.reloadPreservingLocalDraft()

		expect(managerInternals.loadManager.resetAndReload).toHaveBeenCalledTimes(1)
		expect(deleteDesignDraft).not.toHaveBeenCalled()
		expect(managerInternals.tryRestoreLocalDraftAfterRemoteLoad).toHaveBeenCalledTimes(1)
	})

	it("force reloads remote data while discarding local drafts for data source switches", async () => {
		const { manager } = createManager()
		const managerInternals = manager as unknown as {
			loadManager: { resetAndReload: () => Promise<void> }
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
		}
		managerInternals.loadManager.resetAndReload = vi.fn().mockResolvedValue(undefined)
		managerInternals.tryRestoreLocalDraftAfterRemoteLoad = vi.fn().mockResolvedValue(undefined)

		await manager.reloadDiscardingLocalDraft()

		expect(managerInternals.loadManager.resetAndReload).toHaveBeenCalledTimes(1)
		expect(deleteDesignDraft).toHaveBeenCalledTimes(1)
		expect(managerInternals.tryRestoreLocalDraftAfterRemoteLoad).not.toHaveBeenCalled()
	})

	it("clears local draft after a fully persisted save", async () => {
		const localData = createDesignData("local")
		const { manager } = createManager(localData)
		const managerInternals = manager as unknown as {
			saveManager: {
				commitSave: () => Promise<unknown>
				wasLastSaveFullyPersisted: () => boolean
			}
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: true,
			savedVersion: 3,
			savedUpdatedAt: "2026-01-01 00:00:00",
			fullyPersisted: true,
			savedDesignData: localData,
			savedFingerprint: hashDesignDataComparable(localData),
		})
		managerInternals.saveManager.wasLastSaveFullyPersisted = vi.fn(() => true)

		await manager.saveToRemote()

		expect(deleteDesignDraft).toHaveBeenCalledTimes(1)
	})

	it("keeps local draft when save succeeds without full persistence", async () => {
		const localData = createDesignData("local")
		const { manager } = createManager(localData)
		const managerInternals = manager as unknown as {
			saveManager: {
				commitSave: () => Promise<unknown>
				wasLastSaveFullyPersisted: () => boolean
			}
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: true,
			savedVersion: 3,
			savedUpdatedAt: "2026-01-01 00:00:00",
			fullyPersisted: false,
			savedDesignData: localData,
			savedFingerprint: hashDesignDataComparable(localData),
		})
		managerInternals.saveManager.wasLastSaveFullyPersisted = vi.fn(() => false)

		await manager.saveToRemote()

		expect(deleteDesignDraft).not.toHaveBeenCalled()
	})

	it("keeps local draft when save fails", async () => {
		const localData = createDesignData("local")
		const { manager } = createManager(localData)
		const managerInternals = manager as unknown as {
			saveManager: { commitSave: () => Promise<unknown> }
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "error",
			error: "save failed",
		})

		await manager.saveToRemote()

		expect(deleteDesignDraft).not.toHaveBeenCalled()
	})

	it("clears local draft for version data source switches", async () => {
		const { manager } = createManager()
		const managerInternals = manager as unknown as {
			versionManager: {
				handleChangeFileVersion: () => Promise<void>
				handleReturnLatest: () => Promise<void>
				handleVersionRollback: () => Promise<void>
			}
		}
		managerInternals.versionManager.handleChangeFileVersion = vi
			.fn()
			.mockResolvedValue(undefined)
		managerInternals.versionManager.handleReturnLatest = vi.fn().mockResolvedValue(undefined)
		managerInternals.versionManager.handleVersionRollback = vi.fn().mockResolvedValue(undefined)

		await manager.handleChangeFileVersion(2, false)
		await manager.handleReturnLatest()
		await manager.handleVersionRollback(1)

		expect(deleteDesignDraft).toHaveBeenCalledTimes(3)
	})

	it("keeps the version data source locked until overlapping version switches finish", async () => {
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager()
		let resolveChangeVersion: (() => void) | undefined
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			loadAndApplyRemoteFn: (updateType?: "message") => Promise<boolean>
			versionManager: {
				handleChangeFileVersion: () => Promise<void>
				handleReturnLatest: () => Promise<void>
				loadLatest: () => Promise<{ data: DesignData | null; version: number | null }>
			}
		}
		managerInternals.versionManager.handleChangeFileVersion = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveChangeVersion = resolve
				}),
		)
		managerInternals.versionManager.handleReturnLatest = vi.fn().mockResolvedValue(undefined)
		managerInternals.versionManager.loadLatest = vi.fn().mockResolvedValue({
			data: remoteData,
			version: 4,
		})

		const changeVersionPromise = manager.handleChangeFileVersion(2, false)
		const returnLatestPromise = manager.handleReturnLatest()
		await returnLatestPromise

		expect(managerInternals.versionDataSourceLockCount).toBe(1)
		const applied = await managerInternals.loadAndApplyRemoteFn("message")
		expect(applied).toBe(false)
		expect(managerInternals.versionManager.loadLatest).not.toHaveBeenCalled()
		expect(getState().designData.name).toBe("local")

		resolveChangeVersion?.()
		await changeVersionPromise

		expect(managerInternals.versionDataSourceLockCount).toBe(0)
	})

	it("blocks incoming remote data while the version data source is locked", () => {
		const localData = createDesignData("local")
		const incomingRemoteData = createDesignData("incoming-remote")
		const { manager, getState } = createManager(localData)
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
		}
		managerInternals.versionDataSourceLockCount = 1

		const applied = managerInternals.applyRemoteDesignDataSafely(
			incomingRemoteData,
			"message",
			{ remoteVersion: 4 },
		)

		expect(applied).toBe(false)
		expect(getState().designData).toBe(localData)
		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
	})

	it("does not schedule auto-save while the version data source is locked", () => {
		const { manager } = createManager()
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.versionDataSourceLockCount = 1
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		manager.scheduleAutoSave()

		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("blocks save and sync entrypoints while the version data source is locked", async () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager(localData)
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			saveManager: {
				syncDesignData: (data: DesignData) => void
				manualSave: () => Promise<unknown>
				commitSave: () => Promise<unknown>
			}
		}
		managerInternals.versionDataSourceLockCount = 1
		managerInternals.saveManager.syncDesignData = vi.fn()
		managerInternals.saveManager.manualSave = vi.fn()
		managerInternals.saveManager.commitSave = vi.fn()

		expect(manager.canUpdateCurrentDesignData()).toBe(false)

		manager.syncDesignData(remoteData)
		await manager.manualSave()
		await manager.saveToRemote()

		expect(managerInternals.saveManager.syncDesignData).not.toHaveBeenCalled()
		expect(managerInternals.saveManager.manualSave).not.toHaveBeenCalled()
		expect(managerInternals.saveManager.commitSave).not.toHaveBeenCalled()
		expect(getState().prevDesignDataFingerprint).toBe("initial-fingerprint")
		expect(getBaseDesignData(manager)).toBeNull()
	})

	it("does not queue or write local drafts while the version data source is locked", () => {
		vi.useFakeTimers()
		try {
			const { manager } = createManager()
			const managerInternals = manager as unknown as {
				versionDataSourceLockCount: number
				draftSaveTimer: ReturnType<typeof setTimeout> | null
				pendingDraftSave: unknown
			}
			manager.persistLocalDraft(createDesignData("pending-draft"))
			expect(managerInternals.draftSaveTimer).not.toBeNull()

			managerInternals.versionDataSourceLockCount = 1
			manager.persistLocalDraft(createDesignData("blocked-draft"))
			vi.runOnlyPendingTimers()

			expect(managerInternals.draftSaveTimer).toBeNull()
			expect(managerInternals.pendingDraftSave).toBeNull()
			expect(writeDesignDraft).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("does not apply remote data if version switching starts before remote load", async () => {
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager()
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			loadAndApplyRemoteFn: (updateType?: "message") => Promise<boolean>
			versionManager: {
				loadLatest: () => Promise<{ data: DesignData | null; version: number | null }>
			}
		}
		managerInternals.versionManager.loadLatest = vi.fn().mockResolvedValue({
			data: remoteData,
			version: 4,
		})
		managerInternals.versionDataSourceLockCount = 1

		const applied = await managerInternals.loadAndApplyRemoteFn("message")

		expect(applied).toBe(false)
		expect(managerInternals.versionManager.loadLatest).not.toHaveBeenCalled()
		expect(getState().designData.name).toBe("local")
	})

	it("does not apply remote data if version switching starts after remote load", async () => {
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager()
		const managerInternals = manager as unknown as {
			versionDataSourceLockCount: number
			loadAndApplyRemoteFn: (updateType?: "message") => Promise<boolean>
			versionManager: {
				loadLatest: () => Promise<{ data: DesignData | null; version: number | null }>
			}
		}
		managerInternals.versionManager.loadLatest = vi.fn().mockImplementation(async () => {
			managerInternals.versionDataSourceLockCount = 1
			return {
				data: remoteData,
				version: 4,
			}
		})

		const applied = await managerInternals.loadAndApplyRemoteFn("message")

		expect(applied).toBe(false)
		expect(managerInternals.versionManager.loadLatest).toHaveBeenCalledTimes(1)
		expect(getState().designData.name).toBe("local")
	})

	it("defers incoming remote data while a conflict is active", () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const incomingRemoteData = createDesignData("incoming-remote")
		const { manager, stateBag, getState } = createManager(localData)
		stateBag.setters.setConflictState(createConflict(localData, remoteData))

		const applied = (
			manager as unknown as {
				applyRemoteDesignDataSafely: (
					data: DesignData,
					updateType: "message",
					options: { remoteVersion: number },
				) => boolean
			}
		).applyRemoteDesignDataSafely(incomingRemoteData, "message", { remoteVersion: 4 })

		const pendingRemoteDesignData = (
			manager as unknown as {
				pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
			}
		).pendingRemoteDesignData
		const saveManager = (
			manager as unknown as { saveManager: { hasRemoteConflict: () => boolean } }
		).saveManager

		expect(applied).toBe(false)
		expect(getState().designData).toBe(localData)
		expect(getState().conflictState?.remoteData).toEqual(incomingRemoteData)
		expect(getState().conflictState?.remoteVersion).toBe(4)
		expect(pendingRemoteDesignData?.data).toEqual(incomingRemoteData)
		expect(pendingRemoteDesignData?.remoteVersion).toBe(4)
		expect(saveManager.hasRemoteConflict()).toBe(true)
	})

	it("resolves a blocking conflict by applying pending remote data", () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const pendingRemoteData = createDesignData("pending-remote")
		const onRemoteDesignDataUpdate = vi.fn()
		const { manager, stateBag, getState } = createManager(localData, {
			onRemoteDesignDataUpdate,
		})
		stateBag.setters.setConflictState(createConflict(localData, remoteData))
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: {
				data: DesignData
				updateType: "message"
				remoteVersion: number
			} | null
			saveManager: {
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
			}
		}
		managerInternals.pendingRemoteDesignData = {
			data: pendingRemoteData,
			updateType: "message",
			remoteVersion: 4,
		}
		managerInternals.saveManager.markRemoteConflict()

		const didResolve = manager.resolveBlockingConflictWithRemote()

		expect(didResolve).toBe(true)
		expect(getState().designData).toEqual(pendingRemoteData)
		expect(getState().conflictState).toBeNull()
		expect(getState().magicProjectJsVersion).toBe(4)
		expect(getState().prevDesignDataFingerprint).toBe(
			hashDesignDataComparable(pendingRemoteData),
		)
		expect(getBaseDesignData(manager)).toEqual(pendingRemoteData)
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(deleteDesignDraft).toHaveBeenCalledTimes(1)
		expect(onRemoteDesignDataUpdate).toHaveBeenCalledWith(
			localData,
			pendingRemoteData,
			"message",
		)
	})

	it("resolves a draft conflict by using remote data and deleting the local draft", () => {
		const localDraftData = createDesignData("local-draft")
		const remoteData = createDesignData("remote")
		const { manager, stateBag, getState } = createManager(localDraftData)
		stateBag.setters.setConflictState(createConflict(localDraftData, remoteData))
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: unknown
			saveManager: {
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
			}
		}
		managerInternals.saveManager.markRemoteConflict()

		const didResolve = manager.resolveBlockingConflictWithRemote()

		expect(didResolve).toBe(true)
		expect(getState().designData).toEqual(remoteData)
		expect(getState().conflictState).toBeNull()
		expect(getState().magicProjectJsVersion).toBe(3)
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(deleteDesignDraft).toHaveBeenCalledTimes(1)
	})

	it("resolves a draft conflict by applying local draft data and force-saving once", async () => {
		const currentRemoteData = createDesignData("current-remote")
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const onRemoteDesignDataUpdate = vi.fn()
		const { manager, stateBag, getState } = createManager(currentRemoteData, {
			onRemoteDesignDataUpdate,
		})
		stateBag.setters.setConflictState(createConflict(localData, remoteData))
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
			saveManager: {
				commitSave: (options?: unknown) => Promise<unknown>
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
				wasLastSaveFullyPersisted: () => boolean
			}
		}
		managerInternals.pendingRemoteDesignData = { data: remoteData, remoteVersion: 3 }
		managerInternals.saveManager.markRemoteConflict()
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: true,
			savedVersion: 5,
			savedUpdatedAt: "2026-01-01 00:00:00",
			fullyPersisted: true,
			savedDesignData: localData,
			savedFingerprint: hashDesignDataComparable(localData),
		})
		managerInternals.saveManager.wasLastSaveFullyPersisted = vi.fn(() => true)

		const didResolve = await manager.resolveBlockingConflictWithLocal()

		expect(didResolve).toBe(true)
		expect(getState().designData).toEqual(localData)
		expect(getState().conflictState).toBeNull()
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(localData))
		expect(getBaseDesignData(manager)).toEqual(localData)
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(managerInternals.saveManager.commitSave).toHaveBeenCalledWith({
			allowRemoteConflict: true,
			designData: localData,
			updateCurrentDesignData: true,
			skipRemoteUpdateCheck: true,
			source: "conflict-resolution",
		})
		expect(writeDesignDraft).toHaveBeenCalledTimes(1)
		expect(deleteDesignDraft).toHaveBeenCalledTimes(1)
		expect(onRemoteDesignDataUpdate).toHaveBeenCalledWith(currentRemoteData, localData, "draft")
	})

	it("keeps a blocking conflict recoverable when local force-save fails", async () => {
		const currentRemoteData = createDesignData("current-remote")
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const onRemoteDesignDataUpdate = vi.fn()
		const { manager, stateBag, getState } = createManager(currentRemoteData, {
			onRemoteDesignDataUpdate,
		})
		const conflict = createConflict(localData, remoteData)
		const pendingRemoteDesignData = {
			data: remoteData,
			updateType: "message" as const,
			remoteVersion: 3,
		}
		stateBag.setters.setConflictState(conflict)
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: typeof pendingRemoteDesignData | null
			saveManager: {
				commitSave: (options?: unknown) => Promise<unknown>
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
			}
		}
		managerInternals.pendingRemoteDesignData = pendingRemoteDesignData
		managerInternals.saveManager.markRemoteConflict()
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "error",
			error: "save failed",
		})

		const didResolve = await manager.resolveBlockingConflictWithLocal()

		expect(didResolve).toBe(false)
		expect(getState().designData).toEqual(localData)
		expect(getState().conflictState).toBe(conflict)
		expect(managerInternals.pendingRemoteDesignData).toBe(pendingRemoteDesignData)
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(true)
		expect(writeDesignDraft).toHaveBeenCalledTimes(1)
		expect(deleteDesignDraft).not.toHaveBeenCalled()
		expect(onRemoteDesignDataUpdate).toHaveBeenCalledWith(currentRemoteData, localData, "draft")
	})

	it("clears a blocking conflict but keeps the local draft when sidecar persistence fails", async () => {
		const currentRemoteData = createDesignData("current-remote")
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, stateBag, getState } = createManager(currentRemoteData)
		stateBag.setters.setConflictState(createConflict(localData, remoteData))
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: {
				data: DesignData
				updateType: "message"
				remoteVersion: number
			} | null
			saveManager: {
				commitSave: (options?: unknown) => Promise<unknown>
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
				wasLastSaveFullyPersisted: () => boolean
			}
		}
		managerInternals.pendingRemoteDesignData = {
			data: remoteData,
			updateType: "message",
			remoteVersion: 3,
		}
		managerInternals.saveManager.markRemoteConflict()
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: true,
			savedVersion: 5,
			savedUpdatedAt: "2026-01-01 00:00:00",
			fullyPersisted: false,
			savedDesignData: localData,
			savedFingerprint: hashDesignDataComparable(localData),
		})
		managerInternals.saveManager.wasLastSaveFullyPersisted = vi.fn(() => false)

		const didResolve = await manager.resolveBlockingConflictWithLocal()

		expect(didResolve).toBe(true)
		expect(getState().designData).toEqual(localData)
		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(writeDesignDraft).toHaveBeenCalledTimes(1)
		expect(deleteDesignDraft).not.toHaveBeenCalled()
	})

	it("keeps the blocking conflict visible while local force-save is still running", async () => {
		const currentRemoteData = createDesignData("current-remote")
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, stateBag, getState } = createManager(currentRemoteData)
		const conflict = createConflict(localData, remoteData)
		const pendingRemoteDesignData = {
			data: remoteData,
			updateType: "message" as const,
			remoteVersion: 3,
		}
		stateBag.setters.setConflictState(conflict)
		const managerInternals = manager as unknown as {
			pendingRemoteDesignData: typeof pendingRemoteDesignData | null
			saveManager: {
				commitSave: (options?: unknown) => Promise<unknown>
				markRemoteConflict: () => void
				hasRemoteConflict: () => boolean
				wasLastSaveFullyPersisted: () => boolean
			}
		}
		managerInternals.pendingRemoteDesignData = pendingRemoteDesignData
		managerInternals.saveManager.markRemoteConflict()
		let resolveSave!: (value: unknown) => void
		managerInternals.saveManager.commitSave = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveSave = resolve
				}),
		)
		managerInternals.saveManager.wasLastSaveFullyPersisted = vi.fn(() => true)

		const resolvePromise = manager.resolveBlockingConflictWithLocal()

		expect(getState().designData).toEqual(localData)
		expect(getState().conflictState).toBe(conflict)
		expect(managerInternals.pendingRemoteDesignData).toBe(pendingRemoteDesignData)
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(true)

		resolveSave({
			ok: true,
			savedVersion: 5,
			savedUpdatedAt: "2026-01-01 00:00:00",
			fullyPersisted: true,
			savedDesignData: localData,
			savedFingerprint: hashDesignDataComparable(localData),
		})
		await expect(resolvePromise).resolves.toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
	})

	it("keeps normal save entrypoints blocked while a blocking conflict is active", async () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, stateBag } = createManager(localData)
		stateBag.setters.setConflictState(createConflict(localData, remoteData))
		const managerInternals = manager as unknown as {
			saveManager: { commitSave: () => Promise<unknown> }
		}
		managerInternals.saveManager.commitSave = vi.fn()

		await manager.manualSave()
		await manager.saveToRemote()

		expect(managerInternals.saveManager.commitSave).not.toHaveBeenCalled()
	})

	it("merges incoming remote data when local and remote changed different elements", () => {
		const baseData = createDesignData("design", [rect("remote-element"), rect("local-element")])
		const localData = createDesignData("design", [
			rect("remote-element"),
			rect("local-element", { y: 200 }),
		])
		const remoteData = createDesignData("design", [
			rect("remote-element", { x: 100 }),
			rect("local-element"),
		])
		const onRemoteDesignDataUpdate = vi.fn()
		const { manager, stateBag, getState } = createManager(baseData, {
			onRemoteDesignDataUpdate,
		})
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			pendingRemoteDesignData: unknown
			saveManager: {
				hasRemoteConflict: () => boolean
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const applied = managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		expect(applied).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "remote-element", x: 100, y: 0 }),
			expect.objectContaining({ id: "local-element", x: 0, y: 200 }),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
		expect(onRemoteDesignDataUpdate).toHaveBeenCalledWith(
			localData,
			expect.objectContaining({
				canvas: expect.objectContaining({
					elements: [
						expect.objectContaining({ id: "remote-element", x: 100, y: 0 }),
						expect.objectContaining({ id: "local-element", x: 0, y: 200 }),
					],
				}),
			}),
			"message",
		)
	})

	it("auto-merges incoming remote data when local and remote changed different fields on the same element", () => {
		const baseData = createDesignData("design", [rect("same"), rect("local-element")])
		const localData = createDesignData("design", [
			rect("same", { y: 200 }),
			rect("local-element", { y: 300 }),
		])
		const remoteData = createDesignData("design", [
			rect("same", { x: 100 }),
			rect("local-element"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
			saveManager: {
				hasRemoteConflict: () => boolean
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const applied = managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		expect(applied).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "same", x: 100, y: 200 }),
				expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
			]),
		)
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
	})

	it("creates an element-level conflict when both sides change the same field", () => {
		const baseData = createDesignData("design", [rect("same"), rect("local-element")])
		const localData = createDesignData("design", [
			rect("same", { x: 200 }),
			rect("local-element", { y: 300 }),
		])
		const remoteData = createDesignData("design", [
			rect("same", { x: 100 }),
			rect("local-element"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
			saveManager: {
				hasRemoteConflict: () => boolean
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const applied = managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		expect(applied).toBe(true)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200, y: 0 }),
			expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
		])
		expect(getState().conflictState?.reason).toBe("element-level-conflict")
		expect(getState().conflictState?.localData).toEqual(localData)
		expect(getState().conflictState?.remoteData).toEqual(remoteData)
		expect(getState().conflictState?.mergedData?.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 100, y: 0 }),
			expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
		])
		expect(getState().conflictState?.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "same",
				reason: "same-element-changed",
				status: "unresolved",
				baseElement: expect.objectContaining({ id: "same", x: 0, y: 0 }),
				localElement: expect.objectContaining({ id: "same", x: 200, y: 0 }),
				remoteElement: expect.objectContaining({ id: "same", x: 100, y: 0 }),
			}),
		])
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
		expect(writeDesignDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				baseRemoteData: baseData,
				designData: localData,
				reason: "local-edit",
			}),
		)
	})

	it("creates a connection-level conflict when both sides change the same connection", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseData = createDesignData("design", elements, [
			connection("edge", "source", "target"),
		])
		const localData = createDesignData("design", elements, [
			connection("edge", "target", "other"),
		])
		const remoteData = createDesignData("design", elements, [
			connection("edge", "other", "source"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const applied = managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		expect(applied).toBe(true)
		expect(getState().conflictState?.reason).toBe("connection-level-conflict")
		expect(getState().designData.canvas?.connections).toEqual([
			connection("edge", "target", "other"),
		])
		expect(getState().conflictState?.mergedData?.canvas?.connections).toEqual([
			connection("edge", "other", "source"),
		])
		expect(getState().conflictState?.connectionConflicts).toEqual([
			expect.objectContaining({
				connectionId: "edge",
				reason: "same-connection-changed",
				status: "unresolved",
				baseConnection: connection("edge", "source", "target"),
				localConnection: connection("edge", "target", "other"),
				remoteConnection: connection("edge", "other", "source"),
			}),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("resolves a connection-level blocking conflict with the remote connection", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseData = createDesignData("design", elements, [
			connection("edge", "source", "target"),
		])
		const localData = createDesignData("design", elements, [
			connection("edge", "target", "other"),
		])
		const remoteData = createDesignData("design", elements, [
			connection("edge", "other", "source"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		const didResolve = manager.resolveBlockingConflictWithRemote()

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.connections).toEqual([
			connection("edge", "other", "source"),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("keeps a connection-level conflict recoverable when local force-save fails", async () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseData = createDesignData("design", elements, [
			connection("edge", "source", "target"),
		])
		const localData = createDesignData("design", elements, [
			connection("edge", "target", "other"),
		])
		const remoteData = createDesignData("design", elements, [
			connection("edge", "other", "source"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				commitSave: (options?: unknown) => Promise<unknown>
			}
		}
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		const conflict = getState().conflictState
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "error",
			error: "save failed",
		})

		const didResolve = await manager.resolveBlockingConflictWithLocal()

		expect(didResolve).toBe(false)
		expect(getState().conflictState).toEqual(conflict)
		expect(getState().designData.canvas?.connections).toEqual([
			connection("edge", "target", "other"),
		])
		expect(writeDesignDraft).toHaveBeenCalled()
	})

	it("saves non-conflicting changes remotely while unresolved element conflicts keep remote candidates", async () => {
		const baseData = createDesignData("design", [rect("same"), rect("local-element")])
		const localData = createDesignData("design", [
			rect("same", { x: 200 }),
			rect("local-element", { y: 300 }),
		])
		const remoteData = createDesignData("design", [
			rect("same", { x: 100 }),
			rect("local-element"),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				commitSave: (options?: { designData?: DesignData }) => Promise<unknown>
				scheduleAutoSave: (designData?: DesignData) => void
			}
		}
		managerInternals.saveManager.commitSave = vi.fn(
			async (options?: { designData?: DesignData }) => ({
				ok: true,
				savedVersion: 3,
				savedUpdatedAt: null,
				fullyPersisted: true,
				savedDesignData: options?.designData ?? getState().designData,
				savedFingerprint: hashDesignDataComparable(
					options?.designData ?? getState().designData,
				),
			}),
		)
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		vi.mocked(writeDesignDraft).mockClear()

		manager.scheduleAutoSave()
		await manager.saveToRemote()
		await manager.manualSave()

		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledWith(
			expect.objectContaining({
				canvas: expect.objectContaining({
					elements: [
						expect.objectContaining({ id: "same", x: 100, y: 0 }),
						expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
					],
				}),
			}),
			expect.objectContaining({ source: "conflict-resolution" }),
		)
		expect(managerInternals.saveManager.commitSave).toHaveBeenCalledTimes(2)
		expect(managerInternals.saveManager.commitSave).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				designData: expect.objectContaining({
					canvas: expect.objectContaining({
						elements: [
							expect.objectContaining({ id: "same", x: 100, y: 0 }),
							expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
						],
					}),
				}),
				updateCurrentDesignData: false,
			}),
		)
		expect(managerInternals.saveManager.commitSave).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				allowRemoteConflict: true,
				designData: expect.objectContaining({
					canvas: expect.objectContaining({
						elements: [
							expect.objectContaining({ id: "same", x: 100, y: 0 }),
							expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
						],
					}),
				}),
				updateCurrentDesignData: false,
			}),
		)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200, y: 0 }),
			expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
		])
		expect(writeDesignDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				designData: expect.objectContaining({
					canvas: expect.objectContaining({
						elements: [
							expect.objectContaining({ id: "same", x: 200, y: 0 }),
							expect.objectContaining({ id: "local-element", x: 0, y: 300 }),
						],
					}),
				}),
				reason: "local-edit",
			}),
			expect.any(Object),
		)
	})

	it("auto-clears an existing element conflict when a later remote merge can reconcile it by field", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { y: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		stateBag.setters.setConflictState({
			reason: "element-level-conflict",
			baseVersion: 2,
			localVersion: 2,
			remoteVersion: 3,
			baseFingerprint: hashDesignDataComparable(baseData),
			localFingerprint: hashDesignDataComparable(localData),
			remoteFingerprint: hashDesignDataComparable(remoteData),
			localData,
			remoteData,
			mergedData: remoteData,
			createdAt: 1,
			elementConflicts: [
				{
					elementId: "same",
					reason: "same-element-changed",
					status: "unresolved",
					baseElement: rect("same"),
					localElement: rect("same", { y: 200 }),
					remoteElement: rect("same", { x: 100 }),
					baseParentId: null,
					localParentId: null,
					remoteParentId: null,
					createdAt: 1,
				},
			],
		})
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const applied = managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		expect(applied).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 100, y: 200 }),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
	})

	it("refreshes an unresolved element conflict when a later remote update changes that element", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { x: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const newerRemoteData = createDesignData("design", [rect("same", { x: 180 })])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		vi.mocked(writeDesignDraft).mockClear()

		const applied = managerInternals.applyRemoteDesignDataSafely(newerRemoteData, "message", {
			remoteVersion: 4,
		})

		expect(applied).toBe(true)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200, y: 0 }),
		])
		expect(getState().conflictState?.remoteData).toEqual(newerRemoteData)
		expect(getState().conflictState?.remoteVersion).toBe(4)
		expect(getState().conflictState?.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "same",
				status: "unresolved",
				localElement: expect.objectContaining({ id: "same", x: 200, y: 0 }),
				remoteElement: expect.objectContaining({ id: "same", x: 180, y: 0 }),
			}),
		])
		expect(getState().conflictState?.localData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200, y: 0 }),
		])
		expect(writeDesignDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				designData: expect.objectContaining({
					canvas: expect.objectContaining({
						elements: [expect.objectContaining({ id: "same", x: 200, y: 0 })],
					}),
				}),
				reason: "local-edit",
			}),
		)
	})

	it("keeps existing unresolved element conflicts when a newer remote update adds another element conflict", () => {
		const baseData = createDesignData("design", [rect("same-a"), rect("same-b")])
		const localData = createDesignData("design", [
			rect("same-a", { x: 200 }),
			rect("same-b", { x: 300 }),
		])
		const remoteData = createDesignData("design", [rect("same-a", { x: 100 }), rect("same-b")])
		const newerRemoteData = createDesignData("design", [
			rect("same-a", { x: 150 }),
			rect("same-b", { x: 120 }),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		const applied = managerInternals.applyRemoteDesignDataSafely(newerRemoteData, "message", {
			remoteVersion: 4,
		})

		expect(applied).toBe(true)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same-a", x: 200, y: 0 }),
			expect.objectContaining({ id: "same-b", x: 300, y: 0 }),
		])
		const conflictsById = new Map(
			getState().conflictState?.elementConflicts?.map((elementConflict) => [
				elementConflict.elementId,
				elementConflict,
			]),
		)
		expect(conflictsById.get("same-a")).toEqual(
			expect.objectContaining({
				status: "unresolved",
				localElement: expect.objectContaining({ id: "same-a", x: 200, y: 0 }),
				remoteElement: expect.objectContaining({ id: "same-a", x: 150, y: 0 }),
			}),
		)
		expect(conflictsById.get("same-b")).toEqual(
			expect.objectContaining({
				status: "unresolved",
				localElement: expect.objectContaining({ id: "same-b", x: 300, y: 0 }),
				remoteElement: expect.objectContaining({ id: "same-b", x: 120, y: 0 }),
			}),
		)
		expect(getState().conflictState?.localData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same-a", x: 200, y: 0 }),
			expect.objectContaining({ id: "same-b", x: 300, y: 0 }),
		])
	})

	it("resolves an element-level conflict as remote when the latest remote deleted the element", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { y: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const newerRemoteData = createDesignData("design", [])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		managerInternals.applyRemoteDesignDataSafely(newerRemoteData, "message", {
			remoteVersion: 4,
		})

		const didResolve = manager.resolveElementConflictWithRemote("same")

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([])
	})

	it("resolves an element-level conflict as local when the conflicted element is edited", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { x: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const editedData = createDesignData("design", [rect("same", { x: 160, y: 240 })])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		stateBag.setters.setDesignData(editedData)

		const didResolve = manager.resolveEditedElementConflictsWithLocal(["same"], editedData)

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 160, y: 240 }),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
	})

	it("reschedules selective remote save when one edited conflict is resolved locally and others remain unresolved", () => {
		const baseData = createDesignData("design", [rect("same-a"), rect("same-b")])
		const localData = createDesignData("design", [
			rect("same-a", { x: 200 }),
			rect("same-b", { x: 300 }),
		])
		const remoteData = createDesignData("design", [
			rect("same-a", { x: 100 }),
			rect("same-b", { x: 120 }),
		])
		const editedData = createDesignData("design", [
			rect("same-a", { x: 160, y: 240 }),
			rect("same-b", { x: 300 }),
		])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: (designData?: DesignData, metadata?: unknown) => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})
		vi.mocked(managerInternals.saveManager.scheduleAutoSave).mockClear()
		stateBag.setters.setDesignData(editedData)

		const didResolve = manager.resolveEditedElementConflictsWithLocal(["same-a"], editedData, {
			source: "canvas-patch",
			deletedElementIds: ["same-a"],
		})

		expect(didResolve).toBe(true)
		expect(getState().conflictState?.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "same-a",
				status: "resolved",
				resolution: "use-local",
			}),
			expect.objectContaining({
				elementId: "same-b",
				status: "unresolved",
			}),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledWith(
			expect.objectContaining({
				canvas: expect.objectContaining({
					elements: [
						expect.objectContaining({ id: "same-a", x: 160, y: 240 }),
						expect.objectContaining({ id: "same-b", x: 120, y: 0 }),
					],
				}),
			}),
			expect.objectContaining({
				source: "canvas-patch",
				deletedElementIds: ["same-a"],
			}),
		)
	})

	it("does not schedule selective remote save when an unresolved conflict cannot restore its remote parent", () => {
		const localData = createDesignData("design", [rect("same", { y: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const { manager, stateBag } = createManager(localData)
		stateBag.setters.setConflictState({
			reason: "element-level-conflict",
			baseVersion: 2,
			localVersion: 2,
			remoteVersion: 3,
			baseFingerprint: "base-fingerprint",
			localFingerprint: "local-fingerprint",
			remoteFingerprint: "remote-fingerprint",
			localData,
			remoteData,
			createdAt: 1,
			elementConflicts: [
				{
					elementId: "same",
					reason: "missing-parent",
					status: "unresolved",
					baseElement: rect("same"),
					localElement: rect("same", { y: 200 }),
					remoteElement: rect("same", { x: 100 }),
					baseParentId: null,
					localParentId: null,
					remoteParentId: "missing-parent",
					createdAt: 1,
				},
			],
		})
		const managerInternals = manager as unknown as {
			saveManager: {
				scheduleAutoSave: (designData?: DesignData) => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		manager.scheduleAutoSave()

		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("auto-merges a stale single element conflict before applying a local choice", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { y: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const { manager, stateBag, getState } = createManager(localData)
		stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(remoteData))
		stateBag.setters.setConflictState({
			reason: "element-level-conflict",
			baseVersion: 2,
			localVersion: 2,
			remoteVersion: 3,
			baseFingerprint: hashDesignDataComparable(baseData),
			localFingerprint: hashDesignDataComparable(localData),
			remoteFingerprint: hashDesignDataComparable(remoteData),
			localData,
			remoteData,
			mergedData: remoteData,
			createdAt: 1,
			elementConflicts: [
				{
					elementId: "same",
					reason: "same-element-changed",
					status: "unresolved",
					baseElement: rect("same"),
					localElement: rect("same", { y: 200 }),
					remoteElement: rect("same", { x: 100 }),
					baseParentId: null,
					localParentId: null,
					remoteParentId: null,
					createdAt: 1,
				},
			],
		})
		const managerInternals = manager as unknown as {
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		const didResolve = manager.resolveElementConflictWithLocal("same")

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 100, y: 200 }),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
	})

	it("resolves an element-level conflict as local when the local element is chosen", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { x: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		const didResolve = manager.resolveElementConflictWithLocal("same")

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200, y: 0 }),
		])
	})

	it("resolves an element-level conflict as remote when the remote element is chosen", () => {
		const baseData = createDesignData("design", [rect("same")])
		const localData = createDesignData("design", [rect("same", { x: 200 })])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const { manager, stateBag, getState } = createManager(baseData)
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			applyRemoteDesignDataSafely: (
				data: DesignData,
				updateType: "message",
				options: { remoteVersion: number },
			) => boolean
			saveManager: {
				scheduleAutoSave: () => void
			}
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.applyRemoteDesignDataSafely(remoteData, "message", {
			remoteVersion: 3,
		})

		const didResolve = manager.resolveElementConflictWithRemote("same")

		expect(didResolve).toBe(true)
		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 100, y: 0 }),
		])
	})

	it("turns a remote-updated save result into a conflict with pending remote data", async () => {
		const localData = createDesignData("local")
		const remoteData = createDesignData("remote")
		const { manager, getState } = createManager(localData)
		const managerInternals = manager as unknown as {
			saveManager: { commitSave: () => Promise<unknown>; hasRemoteConflict: () => boolean }
			versionManager: { loadLatest: () => Promise<{ data: DesignData; version: number }> }
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "remote-updated",
			remoteVersion: 3,
			isCheckReliable: true,
		})
		managerInternals.versionManager.loadLatest = vi
			.fn()
			.mockResolvedValue({ data: remoteData, version: 3 })

		await manager.saveToRemote()

		expect(getState().designData).toBe(localData)
		expect(getState().conflictState?.reason).toBe("save-version-conflict")
		expect(getState().conflictState?.remoteData).toEqual(remoteData)
		expect(getState().conflictState?.remoteVersion).toBe(3)
		expect(managerInternals.pendingRemoteDesignData?.data).toEqual(remoteData)
		expect(managerInternals.pendingRemoteDesignData?.remoteVersion).toBe(3)
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(true)
	})

	it("merges a remote-updated save result when local and remote changed different elements", async () => {
		const baseData = createDesignData("design", [rect("remote-element"), rect("local-element")])
		const localData = createDesignData("design", [
			rect("remote-element"),
			rect("local-element", { y: 200 }),
		])
		const remoteData = createDesignData("design", [
			rect("remote-element", { x: 100 }),
			rect("local-element"),
		])
		const onRemoteDesignDataUpdate = vi.fn()
		const { manager, stateBag, getState } = createManager(baseData, {
			onRemoteDesignDataUpdate,
		})
		manager.syncDesignData(baseData)
		stateBag.setters.setDesignData(localData)
		const managerInternals = manager as unknown as {
			saveManager: {
				commitSave: () => Promise<unknown>
				hasRemoteConflict: () => boolean
				scheduleAutoSave: () => void
			}
			versionManager: { loadLatest: () => Promise<{ data: DesignData; version: number }> }
			pendingRemoteDesignData: { data: DesignData; remoteVersion: number } | null
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "remote-updated",
			remoteVersion: 3,
			isCheckReliable: true,
		})
		managerInternals.saveManager.scheduleAutoSave = vi.fn()
		managerInternals.versionManager.loadLatest = vi
			.fn()
			.mockResolvedValue({ data: remoteData, version: 3 })

		await manager.saveToRemote()

		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.saveManager.hasRemoteConflict()).toBe(false)
		expect(getState().magicProjectJsVersion).toBe(3)
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "remote-element", x: 100, y: 0 }),
			expect.objectContaining({ id: "local-element", x: 0, y: 200 }),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
		expect(onRemoteDesignDataUpdate).toHaveBeenCalledWith(
			localData,
			expect.objectContaining({
				canvas: expect.objectContaining({
					elements: [
						expect.objectContaining({ id: "remote-element", x: 100, y: 0 }),
						expect.objectContaining({ id: "local-element", x: 0, y: 200 }),
					],
				}),
			}),
			"message",
		)
	})

	it("does not create a conflict when the remote check is unreliable but no remote data was loaded", async () => {
		const localData = createDesignData("local")
		const { manager, getState } = createManager(localData)
		const managerInternals = manager as unknown as {
			saveManager: { commitSave: () => Promise<unknown> }
			versionManager: { loadLatest: () => Promise<unknown> }
			pendingRemoteDesignData: unknown
		}
		managerInternals.saveManager.commitSave = vi.fn().mockResolvedValue({
			ok: false,
			reason: "remote-check-unreliable",
			remoteVersion: 3,
			isCheckReliable: false,
		})
		managerInternals.versionManager.loadLatest = vi.fn()

		await manager.saveToRemote()

		expect(getState().designData).toBe(localData)
		expect(getState().conflictState).toBeNull()
		expect(managerInternals.pendingRemoteDesignData).toBeNull()
		expect(managerInternals.versionManager.loadLatest).not.toHaveBeenCalled()
	})

	it("auto-merges a remote-advanced local draft when base remote data is available", async () => {
		const baseData = createDesignData("design", [rect("same")])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const draftData = createDesignData("design", [rect("same", { y: 200 })])
		const { manager, stateBag, getState } = createManager(remoteData)
		stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(remoteData))
		const draft: DesignDraftEntry = {
			key: "draft-key",
			schemaVersion: 1,
			projectId: "project-1",
			designProjectId: "design-1",
			magicProjectJsFileId: "file-1",
			baseRemoteVersion: 1,
			baseRemoteFingerprint: hashDesignDataComparable(baseData),
			localFingerprint: hashDesignDataComparable(draftData),
			localUpdatedAt: 1,
			reason: "local-edit",
			designData: draftData,
			baseRemoteData: baseData,
		}
		vi.mocked(readDesignDraft).mockResolvedValue(draft)
		const managerInternals = manager as unknown as {
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		await managerInternals.tryRestoreLocalDraftAfterRemoteLoad()

		expect(getState().conflictState).toBeNull()
		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 100, y: 200 }),
		])
		expect(getState().prevDesignDataFingerprint).toBe(hashDesignDataComparable(remoteData))
		expect(getBaseDesignData(manager)).toEqual(remoteData)
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
		expect(writeDesignDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				designData: expect.objectContaining({
					canvas: expect.objectContaining({
						elements: [expect.objectContaining({ id: "same", x: 100, y: 200 })],
					}),
				}),
				baseRemoteData: remoteData,
				reason: "local-edit",
			}),
			expect.any(Object),
		)
	})

	it("keeps a legacy remote-advanced local draft as a blocking conflict", async () => {
		const remoteData = createDesignData("remote")
		const draftData = createDesignData("local-draft")
		const { manager, getState } = createManager(remoteData)
		const draft: DesignDraftEntry = {
			key: "draft-key",
			schemaVersion: 1,
			projectId: "project-1",
			designProjectId: "design-1",
			magicProjectJsFileId: "file-1",
			baseRemoteVersion: 1,
			baseRemoteFingerprint: "base-fingerprint",
			localFingerprint: "local-fingerprint",
			localUpdatedAt: 1,
			reason: "local-edit",
			designData: draftData,
		}
		vi.mocked(readDesignDraft).mockResolvedValue(draft)
		const managerInternals = manager as unknown as {
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		await managerInternals.tryRestoreLocalDraftAfterRemoteLoad()

		expect(getState().designData).toBe(remoteData)
		expect(getState().conflictState?.reason).toBe("draft-remote-advanced")
		expect(getState().conflictState?.localData).toEqual(draftData)
		expect(getState().conflictState?.remoteData).toEqual(remoteData)
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("keeps only element-level conflicts when a remote-advanced draft cannot merge one field", async () => {
		const baseData = createDesignData("design", [rect("same")])
		const remoteData = createDesignData("design", [rect("same", { x: 100 })])
		const draftData = createDesignData("design", [rect("same", { x: 200 })])
		const { manager, stateBag, getState } = createManager(remoteData)
		stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(remoteData))
		const draft: DesignDraftEntry = {
			key: "draft-key",
			schemaVersion: 1,
			projectId: "project-1",
			designProjectId: "design-1",
			magicProjectJsFileId: "file-1",
			baseRemoteVersion: 1,
			baseRemoteFingerprint: hashDesignDataComparable(baseData),
			localFingerprint: hashDesignDataComparable(draftData),
			localUpdatedAt: 1,
			reason: "local-edit",
			designData: draftData,
			baseRemoteData: baseData,
		}
		vi.mocked(readDesignDraft).mockResolvedValue(draft)
		const managerInternals = manager as unknown as {
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		await managerInternals.tryRestoreLocalDraftAfterRemoteLoad()

		expect(getState().designData.canvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 200 }),
		])
		expect(getState().conflictState?.reason).toBe("element-level-conflict")
		expect(getState().conflictState?.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "same",
				reason: "same-element-changed",
				status: "unresolved",
			}),
		])
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
	})

	it("keeps the clean remote base when a compatible local draft is restored", async () => {
		const remoteData = createDesignData("remote")
		const draftData = createDesignData("local-draft")
		const { manager, getState } = createManager(remoteData)
		manager.syncDesignData(remoteData)
		const remoteFingerprint = hashDesignDataComparable(remoteData)
		const draft: DesignDraftEntry = {
			key: "draft-key",
			schemaVersion: 1,
			projectId: "project-1",
			designProjectId: "design-1",
			magicProjectJsFileId: "file-1",
			baseRemoteVersion: 2,
			baseRemoteFingerprint: remoteFingerprint,
			localFingerprint: hashDesignDataComparable(draftData),
			localUpdatedAt: 1,
			reason: "local-edit",
			designData: draftData,
		}
		vi.mocked(readDesignDraft).mockResolvedValue(draft)
		const managerInternals = manager as unknown as {
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		await managerInternals.tryRestoreLocalDraftAfterRemoteLoad()

		const baseDesignData = getBaseDesignData(manager)
		expect(getState().designData).toEqual(draftData)
		expect(getState().prevDesignDataFingerprint).toBe(remoteFingerprint)
		expect(baseDesignData).toEqual(remoteData)
		expect(baseDesignData).not.toBe(remoteData)
		expect(managerInternals.saveManager.scheduleAutoSave).toHaveBeenCalledTimes(1)
	})

	it("keeps an empty restored draft local when the trusted remote base is non-empty", async () => {
		const remoteData = createDesignData("remote", [rect("remote")])
		const draftData = createDesignData("empty-draft")
		const { manager, getState } = createManager(remoteData)
		manager.syncDesignData(remoteData)
		const remoteFingerprint = hashDesignDataComparable(remoteData)
		const draft: DesignDraftEntry = {
			key: "draft-key",
			schemaVersion: 1,
			projectId: "project-1",
			designProjectId: "design-1",
			magicProjectJsFileId: "file-1",
			baseRemoteVersion: 2,
			baseRemoteFingerprint: remoteFingerprint,
			localFingerprint: hashDesignDataComparable(draftData),
			localUpdatedAt: 1,
			reason: "local-edit",
			designData: draftData,
		}
		vi.mocked(readDesignDraft).mockResolvedValue(draft)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const managerInternals = manager as unknown as {
			tryRestoreLocalDraftAfterRemoteLoad: () => Promise<void>
			saveManager: { scheduleAutoSave: () => void }
		}
		managerInternals.saveManager.scheduleAutoSave = vi.fn()

		await managerInternals.tryRestoreLocalDraftAfterRemoteLoad()

		expect(getState().designData).toEqual(draftData)
		expect(getState().conflictState).toEqual(
			expect.objectContaining({
				reason: "draft-remote-advanced",
				localData: draftData,
				remoteData,
			}),
		)
		expect(managerInternals.saveManager.scheduleAutoSave).not.toHaveBeenCalled()
		expect(warnSpy).toHaveBeenCalledWith(
			"[DesignSaveGuard]",
			expect.stringContaining("blocked-empty-draft-restore-autosave"),
		)
		warnSpy.mockRestore()
	})
})
