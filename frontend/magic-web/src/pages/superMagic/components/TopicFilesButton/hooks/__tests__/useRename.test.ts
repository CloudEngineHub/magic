import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import MagicModal from "@/components/base/MagicModal"
import { useRename } from "../useRename"
import type { AttachmentItem } from "../types"
import { detectCanvasProjectOperationRisk } from "../../utils/canvasProjectOperationRisk"

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
})
