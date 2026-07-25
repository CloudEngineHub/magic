import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import { useCrossProjectFileOperation } from "../useCrossProjectFileOperation"
import type { AttachmentItem } from "../types"
import { detectCanvasProjectOperationRisk } from "../../utils/canvasProjectOperationRisk"
import { resolveSingleHtmlStaticDependencies } from "@/pages/superMagic/utils/htmlStaticDependencies"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: {
		confirm: vi.fn(),
	},
}))

vi.mock("@tabler/icons-react", () => ({
	IconAlertTriangleFilled: () => null,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		moveFile: vi.fn(),
		moveFiles: vi.fn(),
		copyFiles: vi.fn(),
		checkBatchOperationStatus: vi.fn(),
	},
}))

vi.mock("../../utils/canvasProjectOperationRisk", () => ({
	detectCanvasProjectOperationRisk: vi.fn(),
	getCanvasProjectOperationImpact: (risk: { riskTypes: string[] }) =>
		risk.riskTypes.includes("project-entry") ? "open-failure" : "content-loss",
}))

vi.mock("@/pages/superMagic/utils/htmlStaticDependencies", () => ({
	resolveSingleHtmlStaticDependencies: vi.fn(),
	mergeHtmlStaticDependencyFileIds: (
		fileIds: string[],
		dependencyFileIds: string[],
		includeDependencies: boolean,
	) =>
		includeDependencies
			? [...new Set([...fileIds, ...dependencyFileIds])]
			: [...new Set(fileIds)],
}))

const sourceAttachments: AttachmentItem[] = [
	{
		file_id: "file-1",
		file_name: "magic.project.js",
		is_directory: false,
		relative_file_path: "Design/magic.project.js",
	},
]

describe("useCrossProjectFileOperation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: false,
			riskTypes: [],
			affectedProjectNames: [],
		})
		vi.mocked(SuperMagicApi.moveFile).mockResolvedValue({ status: "success" })
		vi.mocked(SuperMagicApi.copyFiles).mockResolvedValue({ status: "success" })
		vi.mocked(resolveSingleHtmlStaticDependencies).mockResolvedValue({
			isHtml: false,
			dependencyFileIds: [],
			dependencyTransferFileIds: [],
		})
	})

	it("跨项目移动命中画布风险且用户取消时不执行移动", async () => {
		vi.mocked(detectCanvasProjectOperationRisk).mockResolvedValue({
			shouldWarn: true,
			riskTypes: ["project-entry"],
			affectedProjectNames: ["Design"],
		})
		vi.mocked(MagicModal.confirm).mockImplementation((config) => {
			config.onCancel?.()
			return undefined as never
		})

		const { result } = renderHook(() =>
			useCrossProjectFileOperation({
				projectId: "project-1",
				selectedWorkspace: null,
				selectedProject: null,
				projects: [],
			}),
		)

		await act(async () => {
			await result.current.executeMoveOperation({
				fileIds: ["file-1"],
				targetProjectId: "project-2",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments,
			})
		})

		expect(detectCanvasProjectOperationRisk).toHaveBeenCalledWith({
			attachments: sourceAttachments,
			fileIds: ["file-1"],
			operation: "move",
		})
		expect(MagicModal.confirm).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "topicFiles.canvasOperationRisk.title",
				content: "topicFiles.canvasOperationRisk.moveOpenFailureContent",
			}),
		)
		expect(SuperMagicApi.moveFile).not.toHaveBeenCalled()
	})

	it("copies the confirmed single-HTML static dependencies with the HTML file", async () => {
		const { result } = renderHook(() =>
			useCrossProjectFileOperation({
				projectId: "project-1",
				selectedWorkspace: null,
				selectedProject: null,
				projects: [],
			}),
		)

		await act(async () => {
			await result.current.executeCopyOperation({
				fileIds: ["file-1"],
				targetProjectId: "project-2",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments,
				includeHtmlDependencies: true,
				htmlDependencyFileIds: ["image-1"],
			})
		})

		expect(SuperMagicApi.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				file_ids: ["file-1", "image-1"],
				project_id: "project-1",
				target_project_id: "project-2",
			}),
		)
	})

	it("copies dependency folders when a nested HTML resource needs its directory structure", async () => {
		vi.mocked(resolveSingleHtmlStaticDependencies).mockResolvedValue({
			isHtml: true,
			dependencyFileIds: ["image-1"],
			dependencyTransferFileIds: ["assets-folder"],
		})

		const { result } = renderHook(() =>
			useCrossProjectFileOperation({
				projectId: "project-1",
				selectedWorkspace: null,
				selectedProject: null,
				projects: [],
			}),
		)

		await act(async () => {
			await result.current.executeCopyOperation({
				fileIds: ["file-1"],
				targetProjectId: "project-2",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments,
			})
		})

		expect(SuperMagicApi.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				file_ids: ["file-1", "assets-folder"],
			}),
		)
	})

	it("warns when dependency analysis falls back to the selected HTML file", async () => {
		vi.mocked(resolveSingleHtmlStaticDependencies).mockRejectedValue(
			new Error("dependency analysis failed"),
		)

		const { result } = renderHook(() =>
			useCrossProjectFileOperation({
				projectId: "project-1",
				selectedWorkspace: null,
				selectedProject: null,
				projects: [],
			}),
		)

		await act(async () => {
			await result.current.executeCopyOperation({
				fileIds: ["file-1"],
				targetProjectId: "project-2",
				targetPath: [],
				targetAttachments: [],
				sourceAttachments,
			})
		})

		expect(magicToast.warning).toHaveBeenCalledWith("share.htmlDependenciesAnalysisFailed")
		expect(SuperMagicApi.copyFiles).toHaveBeenCalledWith(
			expect.objectContaining({ file_ids: ["file-1"] }),
		)
	})
})
