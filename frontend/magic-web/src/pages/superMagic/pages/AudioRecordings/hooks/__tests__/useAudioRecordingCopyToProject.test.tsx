import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import magicToast from "@/components/base/MagicToaster/utils"
import { useAudioRecordingCopyToProject } from "../useAudioRecordingCopyToProject"

const loadProjectAttachmentsMock = vi.fn()
const loadProjectsForWorkspaceMock = vi.fn()

const superMagicApiMocks = vi.hoisted(() => ({
	getWorkspaces: vi.fn(),
	createProject: vi.fn(),
	copyFiles: vi.fn(),
	checkBatchOperationStatus: vi.fn(),
}))

const conflictMocks = vi.hoisted(() => ({
	detectFolderConflictsForMove: vi.fn(() => new Map()),
	detectDuplicateFilesForMove: vi.fn(() => new Map()),
	checkConflicts: vi.fn(),
	checkDuplicates: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	getAdminLocaleModules: () => ({ adminZhCNModules: {}, adminEnUSModules: {} }),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: superMagicApiMocks,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		info: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/projectAttachmentsLoader", () => ({
	loadProjectAttachments: (...args: unknown[]) => loadProjectAttachmentsMock(...args),
}))

vi.mock("@/pages/superMagic/stores/core/project", () => ({
	default: {
		loadProjectsForWorkspace: (...args: unknown[]) => loadProjectsForWorkspaceMock(...args),
	},
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/utils/folderConflictHandler", () => ({
	detectFolderConflictsForMove: (...args: unknown[]) =>
		conflictMocks.detectFolderConflictsForMove(...args),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/utils/moveOrCopyDuplicateHandler", () => ({
	detectDuplicateFilesForMove: (...args: unknown[]) =>
		conflictMocks.detectDuplicateFilesForMove(...args),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/hooks/useFolderConflictHandler", () => ({
	useFolderConflictHandler: () => ({
		checkConflicts: (...args: unknown[]) => conflictMocks.checkConflicts(...args),
		modalVisible: false,
		currentFolderName: "",
		totalConflicts: 0,
		canMerge: false,
		handleKeepBoth: vi.fn(),
		handleMerge: vi.fn(),
		handleCancel: vi.fn(),
	}),
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/hooks/useMoveOrCopyDuplicateHandler",
	() => ({
		useMoveOrCopyDuplicateHandler: () => ({
			checkDuplicates: (...args: unknown[]) => conflictMocks.checkDuplicates(...args),
			modalVisible: false,
			currentFileName: "",
			totalDuplicates: 0,
			handleReplace: vi.fn(),
			handleKeepBoth: vi.fn(),
			handleCancel: vi.fn(),
		}),
	}),
)

/** Builds a stable recording item for copy hook tests without using real project data. */
function buildAudioProject(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "mock-source-audio-project-id",
		project_name: "Mock source recording",
		created_at: 1710000000,
		duration: 120,
		tags: [],
		device_id: "mock-device-id",
		audio_source: "recorded",
		current_phase: "merging",
		phase_status: "completed",
		card_status: "not_summarized",
		is_summarized: false,
		audio_file_id: "mock-audio-file-id",
		...overrides,
	}
}

/** Creates a visible attachment node used by copy root extraction and target directory selection. */
function attachment(overrides: Partial<AttachmentItem> = {}): AttachmentItem {
	return {
		file_id: "mock-source-file-id",
		file_name: "mock-source-file.md",
		name: "mock-source-file.md",
		is_directory: false,
		is_hidden: false,
		children: [],
		...overrides,
	} as AttachmentItem
}

describe("useAudioRecordingCopyToProject", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		superMagicApiMocks.getWorkspaces.mockResolvedValue({
			list: [{ id: "mock-target-workspace-id", name: "Mock target workspace" }],
		})
		superMagicApiMocks.createProject.mockResolvedValue({
			project: {
				id: "mock-created-project-id",
				project_name: "Mock source recording",
				workspace_id: "mock-target-workspace-id",
				project_mode: "",
			},
		})
		superMagicApiMocks.copyFiles.mockResolvedValue({ status: "success" })
		loadProjectAttachmentsMock.mockResolvedValue({
			tree: [attachment({ file_id: "mock-root-file-id" })],
		})
		loadProjectsForWorkspaceMock.mockResolvedValue(undefined)
		conflictMocks.detectFolderConflictsForMove.mockReturnValue(new Map())
		conflictMocks.detectDuplicateFilesForMove.mockReturnValue(new Map())
		conflictMocks.checkConflicts.mockResolvedValue({
			shouldProceed: true,
			keepBothIds: [],
		})
		conflictMocks.checkDuplicates.mockResolvedValue({
			shouldProceed: true,
			keepBothIds: [],
		})
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("does not expose a recording-specific target project filter", () => {
		const { result } = renderHook(() => useAudioRecordingCopyToProject())

		expect("isNormalTargetProject" in result.current).toBe(false)
	})

	it("creates a normal project and copies to its root when only a workspace is selected", async () => {
		const onSuccess = vi.fn()
		const { result } = renderHook(() => useAudioRecordingCopyToProject({ onSuccess }))

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		await act(async () => {
			await result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		expect(superMagicApiMocks.createProject).toHaveBeenCalledWith({
			workspace_id: "mock-target-workspace-id",
			project_name: "Mock source recording",
			project_description: "",
			project_mode: "",
		})
		expect(superMagicApiMocks.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				project_id: "mock-source-audio-project-id",
				target_project_id: "mock-created-project-id",
				target_parent_id: "",
				file_ids: ["mock-root-file-id"],
			}),
		)
		await waitFor(() => {
			expect(onSuccess).toHaveBeenCalledWith({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-created-project-id",
			})
		})
	})

	it("copies into the selected directory when an existing target project path is selected", async () => {
		const { result } = renderHook(() => useAudioRecordingCopyToProject())

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		await act(async () => {
			await result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [
					attachment({
						file_id: "mock-target-folder-id",
						file_name: "mock-target-folder",
						is_directory: true,
					}),
				],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		expect(superMagicApiMocks.createProject).not.toHaveBeenCalled()
		expect(superMagicApiMocks.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				target_project_id: "mock-existing-project-id",
				target_parent_id: "mock-target-folder-id",
			}),
		)
	})

	it("keeps copy success when refreshing the target workspace project list fails", async () => {
		const onSuccess = vi.fn()
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		loadProjectsForWorkspaceMock.mockRejectedValueOnce(new Error("mock refresh failed"))
		const { result } = renderHook(() => useAudioRecordingCopyToProject({ onSuccess }))

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		await act(async () => {
			await result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		expect(superMagicApiMocks.copyFiles).toHaveBeenCalledTimes(1)
		expect(onSuccess).toHaveBeenCalledWith({
			targetWorkspaceId: "mock-target-workspace-id",
			targetProjectId: "mock-existing-project-id",
		})
		expect(magicToast.success).toHaveBeenCalledWith("audioRecordings:copy.success")
		expect(magicToast.error).not.toHaveBeenCalledWith("audioRecordings:copy.failed")
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Failed to refresh target workspace after recording copy:",
			expect.any(Error),
		)
		consoleErrorSpy.mockRestore()
	})

	it("ignores duplicate submit calls while a copy is being prepared", async () => {
		let resolveAttachments: (value: { tree: AttachmentItem[] }) => void = () => {
			throw new Error("mock attachment resolver was not initialized")
		}
		loadProjectAttachmentsMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveAttachments = resolve
				}),
		)
		const { result } = renderHook(() => useAudioRecordingCopyToProject())

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		let firstSubmit: Promise<void> | undefined
		let secondSubmit: Promise<void> | undefined
		act(() => {
			firstSubmit = result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
			secondSubmit = result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		await act(async () => {
			resolveAttachments({ tree: [attachment({ file_id: "mock-root-file-id" })] })
			await firstSubmit
			await secondSubmit
		})

		expect(superMagicApiMocks.copyFiles).toHaveBeenCalledTimes(1)
	})

	it("polls processing batch operations until success", async () => {
		vi.useFakeTimers()
		const onSuccess = vi.fn()
		superMagicApiMocks.copyFiles.mockResolvedValueOnce({
			status: "processing",
			batch_key: "mock-batch-key",
		})
		superMagicApiMocks.checkBatchOperationStatus
			.mockResolvedValueOnce({ status: "processing", progress: "42" })
			.mockResolvedValueOnce({ status: "success", progress: "100" })
		const { result } = renderHook(() => useAudioRecordingCopyToProject({ onSuccess }))

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		let submitPromise: Promise<void> | undefined
		await act(async () => {
			submitPromise = result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000)
		})
		expect(result.current.operationProgress).toBe(42)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000)
			await submitPromise
		})

		expect(superMagicApiMocks.checkBatchOperationStatus).toHaveBeenCalledWith("mock-batch-key")
		expect(onSuccess).toHaveBeenCalledWith({
			targetWorkspaceId: "mock-target-workspace-id",
			targetProjectId: "mock-existing-project-id",
		})
	})

	it("keeps polling while a batch operation remains processing", async () => {
		vi.useFakeTimers()
		superMagicApiMocks.copyFiles.mockResolvedValueOnce({
			status: "processing",
			batch_key: "mock-processing-batch-key",
		})
		superMagicApiMocks.checkBatchOperationStatus.mockResolvedValue({
			status: "processing",
			progress: "1",
		})
		const { result } = renderHook(() => useAudioRecordingCopyToProject())

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		let submitPromise: Promise<void> | undefined
		await act(async () => {
			submitPromise = result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})
		await act(async () => {
			await submitPromise
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2_000 * 3)
		})

		expect(superMagicApiMocks.checkBatchOperationStatus).toHaveBeenCalledTimes(3)
		expect(result.current.isOperating).toBe(true)
		expect(result.current.operationProgress).toBe(1)
		expect(magicToast.error).not.toHaveBeenCalledWith("audioRecordings:copy.failed")
	})

	it("passes keep_both ids selected from folder and duplicate conflict handlers", async () => {
		const folderConflicts = new Map([["mock-folder-conflict-id", []]])
		const duplicateConflicts = new Map([["mock-duplicate-conflict-id", []]])
		conflictMocks.detectFolderConflictsForMove.mockReturnValueOnce(folderConflicts)
		conflictMocks.detectDuplicateFilesForMove.mockReturnValueOnce(duplicateConflicts)
		conflictMocks.checkConflicts.mockResolvedValueOnce({
			shouldProceed: true,
			keepBothIds: ["mock-folder-conflict-id"],
		})
		conflictMocks.checkDuplicates.mockResolvedValueOnce({
			shouldProceed: true,
			keepBothIds: ["mock-duplicate-conflict-id"],
		})
		const sourceTree = [
			attachment({
				file_id: "mock-folder-conflict-id",
				file_name: "mock-folder",
				is_directory: true,
			}),
			attachment({
				file_id: "mock-duplicate-conflict-id",
				file_name: "mock-file.md",
			}),
		]
		loadProjectAttachmentsMock
			.mockResolvedValueOnce({ tree: sourceTree })
			.mockResolvedValueOnce({
				tree: [attachment({ file_id: "mock-target-existing-file-id" })],
			})
		const { result } = renderHook(() => useAudioRecordingCopyToProject())

		await act(async () => {
			await result.current.openCopyToProject(buildAudioProject())
		})

		await act(async () => {
			await result.current.submitCopy({
				targetWorkspaceId: "mock-target-workspace-id",
				targetProjectId: "mock-existing-project-id",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments: [],
			})
		})

		expect(superMagicApiMocks.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				keep_both_file_ids: ["mock-folder-conflict-id", "mock-duplicate-conflict-id"],
			}),
		)
	})
})
