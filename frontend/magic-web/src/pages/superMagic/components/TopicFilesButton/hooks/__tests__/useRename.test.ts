import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import MagicModal from "@/components/base/MagicModal"
import { useRename } from "../useRename"
import type { AttachmentItem } from "../types"
import { detectCanvasProjectOperationRisk } from "../../utils/canvasProjectOperationRisk"
import { repairCanvasProjectsBeforeFileOperation } from "@/pages/superMagic/components/Detail/contents/Design/utils/canvasProjectPathRepair"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: {
		confirm: vi.fn(),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		renameFile: vi.fn(),
	},
}))

vi.mock("../../utils/canvasProjectOperationRisk", () => ({
	detectCanvasProjectOperationRisk: vi.fn(),
	getCanvasProjectOperationImpact: (risk: { riskTypes: string[] }) =>
		risk.riskTypes.includes("project-entry") ? "open-failure" : "content-loss",
}))

vi.mock(
	"@/pages/superMagic/components/Detail/contents/Design/utils/canvasProjectPathRepair",
	() => ({
		repairCanvasProjectsBeforeFileOperation: vi.fn(),
		formatCanvasPathRepairFailures: vi.fn(() => "repair failed"),
	}),
)

const imagesDir: AttachmentItem = {
	file_id: "images-dir",
	file_name: "images",
	name: "images",
	is_directory: true,
	relative_file_path: "Canvas/images",
}

describe("useRename", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: true,
			riskTypes: ["canvas-resource"],
			affectedProjectNames: ["Canvas"],
		})
		vi.mocked(repairCanvasProjectsBeforeFileOperation).mockResolvedValue({
			affectedProjects: [],
			repairedFileIds: [],
			repairedFiles: [],
			failures: [],
			hasFailures: false,
			requiresConfirmation: false,
		})
	})

	it("画布风险确认弹窗打开期间重复提交只弹一次，取消后退出重命名态", async () => {
		let confirmConfig: Parameters<typeof MagicModal.confirm>[0] | undefined
		vi.mocked(MagicModal.confirm).mockImplementation((config) => {
			confirmConfig = config
			return undefined as never
		})

		const { result } = renderHook(() =>
			useRename({
				attachments: [imagesDir],
			}),
		)

		act(() => {
			result.current.handleStartRename(imagesDir)
			result.current.setRenameValue("media")
		})

		const firstConfirmPromise = result.current.handleRenameConfirm()

		await waitFor(() => {
			expect(MagicModal.confirm).toHaveBeenCalledTimes(1)
		})
		expect(MagicModal.confirm).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "topicFiles.canvasOperationRisk.renameContentLossContent",
			}),
		)

		const blurConfirmPromise = result.current.handleRenameConfirm()

		await Promise.resolve()
		expect(MagicModal.confirm).toHaveBeenCalledTimes(1)

		await act(async () => {
			confirmConfig?.onCancel?.()
			await Promise.all([firstConfirmPromise, blurConfirmPromise])
		})

		expect(result.current.renamingItemId).toBeNull()
		expect(result.current.renameValue).toBe("")
		expect(SuperMagicApi.renameFile).not.toHaveBeenCalled()
	})

	it("目录路径修复完成后才调用重命名接口", async () => {
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: false,
			riskTypes: [],
			affectedProjectNames: [],
		})
		vi.mocked(SuperMagicApi.renameFile).mockResolvedValue({} as never)

		const { result } = renderHook(() => useRename({ attachments: [imagesDir] }))
		act(() => {
			result.current.handleStartRename(imagesDir)
			result.current.setRenameValue("media")
		})

		await act(async () => {
			await result.current.handleRenameConfirm()
		})

		expect(repairCanvasProjectsBeforeFileOperation).toHaveBeenCalledTimes(1)
		expect(SuperMagicApi.renameFile).toHaveBeenCalledTimes(1)
		expect(
			vi.mocked(repairCanvasProjectsBeforeFileOperation).mock.invocationCallOrder[0],
		).toBeLessThan(vi.mocked(SuperMagicApi.renameFile).mock.invocationCallOrder[0])
	})

	it("文件重命名不触发画布路径修复", async () => {
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: false,
			riskTypes: [],
			affectedProjectNames: [],
		})
		vi.mocked(SuperMagicApi.renameFile).mockResolvedValue({} as never)
		const file: AttachmentItem = {
			file_id: "file-1",
			file_name: "a.txt",
			relative_file_path: "Canvas/a.txt",
		}

		const { result } = renderHook(() => useRename({ attachments: [file] }))
		act(() => {
			result.current.handleStartRename(file)
			result.current.setRenameValue("b.txt")
		})
		await act(async () => {
			await result.current.handleRenameConfirm()
		})

		expect(repairCanvasProjectsBeforeFileOperation).not.toHaveBeenCalled()
		expect(SuperMagicApi.renameFile).toHaveBeenCalledTimes(1)
	})

	it("路径修复失败时取消不会调用重命名接口", async () => {
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: false,
			riskTypes: [],
			affectedProjectNames: [],
		})
		vi.mocked(repairCanvasProjectsBeforeFileOperation).mockResolvedValue({
			affectedProjects: [],
			repairedFileIds: [],
			repairedFiles: [],
			failures: [
				{ projectName: "Canvas", fileName: "magic.project.js", message: "read failed" },
			],
			hasFailures: true,
			requiresConfirmation: true,
		})
		let confirmConfig: Parameters<typeof MagicModal.confirm>[0] | undefined
		vi.mocked(MagicModal.confirm).mockImplementation((config) => {
			confirmConfig = config
			return undefined as never
		})
		const { result } = renderHook(() => useRename({ attachments: [imagesDir] }))
		act(() => {
			result.current.handleStartRename(imagesDir)
			result.current.setRenameValue("media")
		})

		const promise = result.current.handleRenameConfirm()
		await waitFor(() => expect(MagicModal.confirm).toHaveBeenCalledTimes(1))
		await act(async () => {
			confirmConfig?.onCancel?.()
			await promise
		})

		expect(SuperMagicApi.renameFile).not.toHaveBeenCalled()
	})
})
