import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SharedTopicFilterStatus } from "../../types"
import FileShareManagementListCore from "../FileShareManagementListCore"

const mocks = vi.hoisted(() => ({
	getShareResourcesList: vi.fn(),
	cancelShareResource: vi.fn(),
	errorToast: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getShareResourcesList: mocks.getShareResourcesList,
		cancelShareResource: mocks.cancelShareResource,
		batchCancelShareResources: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: mocks.errorToast,
		warning: vi.fn(),
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../FileShareListNew", () => ({
	default: ({
		data,
		loading,
		fileShareUiConfig,
	}: {
		data: { title: string }[]
		loading: boolean
		fileShareUiConfig?: { hideManageShareLinks?: boolean }
	}) => (
		<div
			data-hide-manage-share-links={String(Boolean(fileShareUiConfig?.hideManageShareLinks))}
			data-testid="file-share-list-new"
		>
			{loading ? (
				<span>loading</span>
			) : (
				data.map((item) => <span key={item.title}>{item.title}</span>)
			)}
		</div>
	),
}))

describe("FileShareManagementListCore", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getShareResourcesList.mockResolvedValue({
			total: 17,
			list: [
				{
					id: 1,
					resource_id: "share-demo-file-001",
					resource_name: "demo-recording-share.wav",
					resource_type: 3,
					created_at: "2026-01-01T00:00:00Z",
					created_uid: "user-demo-001",
					share_type: 2,
					project_id: "project-demo-001",
					project_name: "Demo Recording Project",
					workspace_id: "workspace-demo-001",
					workspace_name: "Demo Workspace",
					extend: { file_count: 1 },
				},
			],
		})
	})

	it("requests current project file shares without exposing keyword search", async () => {
		const onTotalPagesChange = vi.fn()

		render(
			<FileShareManagementListCore
				projectId="project-demo-001"
				filterStatus={SharedTopicFilterStatus.Active}
				currentPage={1}
				pageSize={10}
				onTotalPagesChange={onTotalPagesChange}
			/>,
		)

		await waitFor(() => {
			expect(mocks.getShareResourcesList).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 1,
					page_size: 10,
					keyword: "",
					project_id: "project-demo-001",
					filter_type: SharedTopicFilterStatus.Active,
					share_project: undefined,
				}),
			)
		})
		expect(screen.getByTestId("file-share-management-list-core")).toBeInTheDocument()
		expect(screen.getByTestId("file-share-list-new")).toHaveTextContent(
			"demo-recording-share.wav",
		)
		expect(onTotalPagesChange).toHaveBeenCalledWith(2)
	})

	it("forwards status changes to the share list request", async () => {
		const { rerender } = render(
			<FileShareManagementListCore
				projectId="project-demo-001"
				filterStatus={SharedTopicFilterStatus.Active}
				currentPage={1}
				pageSize={10}
			/>,
		)

		await waitFor(() => {
			expect(mocks.getShareResourcesList).toHaveBeenCalledTimes(1)
		})

		rerender(
			<FileShareManagementListCore
				projectId="project-demo-001"
				filterStatus={SharedTopicFilterStatus.Expired}
				currentPage={1}
				pageSize={10}
			/>,
		)

		await waitFor(() => {
			expect(mocks.getShareResourcesList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					filter_type: SharedTopicFilterStatus.Expired,
					keyword: "",
				}),
			)
		})
	})

	it("passes scene file-share UI policy into the reusable file list", async () => {
		render(
			<FileShareManagementListCore
				projectId="project-demo-001"
				filterStatus={SharedTopicFilterStatus.Active}
				currentPage={1}
				pageSize={10}
				fileShareUiConfig={{ hideManageShareLinks: true }}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("file-share-list-new")).toHaveAttribute(
				"data-hide-manage-share-links",
				"true",
			)
		})
	})
})
