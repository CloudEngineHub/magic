import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CopyProjectModal from "../CopyProjectModal"

const mocks = vi.hoisted(() => ({
	getWorkspaces: vi.fn(),
	copyShareResource: vi.fn(),
	createWorkspace: vi.fn(),
	errorToast: vi.fn(),
	successToast: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getWorkspaces: mocks.getWorkspaces,
		copyShareResource: mocks.copyShareResource,
		createWorkspace: mocks.createWorkspace,
	},
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("antd", () => ({
	Modal: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
		open ? <div data-testid="antd-modal">{children}</div> : null,
	Input: ({
		value,
		onChange,
		onBlur,
		onKeyDown,
		placeholder,
		"data-testid": dataTestId,
	}: {
		value?: string
		onChange?: React.ChangeEventHandler<HTMLInputElement>
		onBlur?: React.FocusEventHandler<HTMLInputElement>
		onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
		placeholder?: string
		"data-testid"?: string
	}) => (
		<input
			value={value}
			onChange={onChange}
			onBlur={onBlur}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			data-testid={dataTestId}
		/>
	),
	Button: ({
		children,
		onClick,
		disabled,
		"data-testid": dataTestId,
	}: {
		children: React.ReactNode
		onClick?: React.MouseEventHandler<HTMLButtonElement>
		disabled?: boolean
		"data-testid"?: string
	}) => (
		<button type="button" onClick={onClick} disabled={disabled} data-testid={dataTestId}>
			{children}
		</button>
	),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: mocks.errorToast,
		success: mocks.successToast,
	},
}))

describe("CopyProjectModal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getWorkspaces.mockResolvedValue({
			list: [
				{
					id: "workspace-1",
					name: "Workspace One",
					is_archived: 0,
					current_topic_id: "",
					current_project_id: null,
					workspace_status: "waiting",
					project_count: 0,
				},
			],
		})
		mocks.copyShareResource.mockResolvedValue({
			copy_record_id: 1,
			new_project_id: 123,
			status: "running",
			progress: 0,
			processed_files: 0,
			total_files: 1,
		})
	})

	it("sends target_project_name when copying a shared project", async () => {
		render(
			<CopyProjectModal
				open
				onCancel={vi.fn()}
				onCopySuccess={vi.fn()}
				projectData={{
					originalAuthor: "Tester",
					originalProjectName: "Original Project",
					projectId: "project-1",
					defaultNewProjectName: "Original Project",
					resourceId: "resource-1",
					password: "ANCT8G",
					isProjectShare: true,
				}}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("Workspace One")).toBeInTheDocument()
		})

		fireEvent.change(screen.getByTestId("new-project-name-input"), {
			target: { value: " Renamed Project " },
		})
		fireEvent.click(screen.getByTestId("copy-project-confirm-button"))

		await waitFor(() => {
			expect(mocks.copyShareResource).toHaveBeenCalledWith({
				resource_id: "resource-1",
				target_workspace_id: "workspace-1",
				target_project_name: "Renamed Project",
				password: "ANCT8G",
			})
		})
	})
})
