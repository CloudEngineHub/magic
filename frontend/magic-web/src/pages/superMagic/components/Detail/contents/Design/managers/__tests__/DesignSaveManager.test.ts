import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { DesignSaveManager, type DesignSaveLifecycleHandlers } from "../DesignSaveManager"
import type { DesignProjectManagerOptions, DesignProjectStateBag } from "../types"
import type { DesignData } from "../../types"
import { hashDesignDataComparable } from "../../utils/designContentHash"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getFileInfo: vi.fn(),
		saveFileContent: vi.fn(),
	},
}))

function createDesignData(name: string, elements: LayerElement[] = []): DesignData {
	return {
		type: "design",
		name,
		version: "2.0.0",
		canvas: { elements },
	}
}

function createSaveManager(
	initialData = createDesignData("local"),
	handlers?: DesignSaveLifecycleHandlers,
) {
	let designData = initialData
	let magicProjectJsFileId: string | null = "file-1"
	let magicProjectJsVersion: number | null = 2
	let prevDesignDataFingerprint = "base-fingerprint"
	let isReadOnly = false

	const stateBag: DesignProjectStateBag = {
		getDesignData: () => designData,
		getConflictState: () => null,
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
			setConflictState: vi.fn(),
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
	}

	return new DesignSaveManager(stateBag, options, vi.fn().mockResolvedValue([]), handlers)
}

describe("DesignSaveManager remote checks", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({} as never)
	})

	it("stops before writing when the remote version has advanced", async () => {
		const saveManager = createSaveManager()
		vi.spyOn(saveManager, "checkRemoteUpdate").mockResolvedValue({
			hasUpdate: true,
			currentVersion: 3,
			isCheckReliable: true,
		})

		const result = await saveManager.commitSave()

		expect(result).toEqual({
			ok: false,
			reason: "remote-updated",
			remoteVersion: 3,
			isCheckReliable: true,
		})
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
		expect(saveManager.hasRemoteConflict()).toBe(true)
	})

	it("skips the remote version check only when explicitly requested", async () => {
		const saveManager = createSaveManager()
		const checkRemoteUpdate = vi.spyOn(saveManager, "checkRemoteUpdate").mockResolvedValue({
			hasUpdate: true,
			currentVersion: 3,
			isCheckReliable: true,
		})
		vi.mocked(SuperMagicApi.getFileInfo).mockResolvedValue({ version: 4 } as never)

		const result = await saveManager.commitSave({ skipRemoteUpdateCheck: true })

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				savedVersion: 4,
			}),
		)
		expect(checkRemoteUpdate).not.toHaveBeenCalled()
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
		expect(saveManager.hasRemoteConflict()).toBe(false)
	})

	it("stops before writing when the remote version check is unreliable", async () => {
		const saveManager = createSaveManager()
		vi.spyOn(saveManager, "checkRemoteUpdate").mockResolvedValue({
			hasUpdate: false,
			currentVersion: 3,
			isCheckReliable: false,
		})

		const result = await saveManager.commitSave()

		expect(result).toEqual({
			ok: false,
			reason: "remote-check-unreliable",
			remoteVersion: 3,
			isCheckReliable: false,
		})
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
		expect(saveManager.hasRemoteConflict()).toBe(false)
	})

	it("can save an explicit payload without replacing the current design state", async () => {
		const localData = createDesignData("local-display")
		const remoteSaveData = createDesignData("remote-save")
		remoteSaveData.version = "1.0.0"
		const saveManager = createSaveManager(localData)
		const stateBag = (saveManager as unknown as { stateBag: DesignProjectStateBag }).stateBag
		vi.spyOn(saveManager, "checkRemoteUpdate").mockResolvedValue({
			hasUpdate: false,
			currentVersion: 2,
			isCheckReliable: true,
		})
		vi.mocked(SuperMagicApi.getFileInfo).mockResolvedValue({ version: 3 } as never)

		const result = await saveManager.commitSave({
			designData: remoteSaveData,
			updateCurrentDesignData: false,
		})

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				savedDesignData: remoteSaveData,
				savedFingerprint: hashDesignDataComparable(remoteSaveData),
			}),
		)
		expect(stateBag.getDesignData()).toBe(localData)
		expect(stateBag.setters.setDesignData).not.toHaveBeenCalled()
		expect(stateBag.getPrevDesignDataFingerprint()).toBe(
			hashDesignDataComparable(remoteSaveData),
		)
		expect(SuperMagicApi.saveFileContent).toHaveBeenCalledTimes(1)
	})

	it("stops before writing when the empty canvas save guard blocks the payload", async () => {
		const shouldBlockEmptyCanvasSave = vi.fn(() => true)
		const saveManager = createSaveManager(createDesignData("local"), {
			shouldBlockEmptyCanvasSave,
		})
		vi.spyOn(saveManager, "checkRemoteUpdate").mockResolvedValue({
			hasUpdate: false,
			currentVersion: 2,
			isCheckReliable: true,
		})

		const result = await saveManager.commitSave({
			source: "draft-restore",
			beforeElementCount: 2,
			deletedElementIds: ["a", "a"],
		})

		expect(result).toEqual({ ok: false, reason: "unsafe-empty-canvas" })
		expect(shouldBlockEmptyCanvasSave).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "draft-restore",
				beforeElementCount: 2,
				nextElementCount: 0,
				deletedElementIds: ["a"],
				magicProjectJsVersion: 2,
				fromDraft: true,
			}),
		)
		expect(SuperMagicApi.saveFileContent).not.toHaveBeenCalled()
	})
})
