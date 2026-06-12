import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

const {
	projectStoreMock,
	isCurrentChatProjectRouteMock,
	moveProjectMock,
	getProjectDetailMock,
	switchProjectInDesktopMock,
	deleteProjectMock,
	navigateToHomeMock,
} = vi.hoisted(() => ({
	projectStoreMock: { selectedProject: null as ProjectListItem | null },
	isCurrentChatProjectRouteMock: vi.fn(),
	moveProjectMock: vi.fn(),
	getProjectDetailMock: vi.fn(),
	switchProjectInDesktopMock: vi.fn(),
	deleteProjectMock: vi.fn(),
	navigateToHomeMock: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		deleteProject: deleteProjectMock,
		navigateToHome: navigateToHomeMock,
		switchProjectInDesktop: switchProjectInDesktopMock,
		route: {
			isCurrentChatProjectRoute: isCurrentChatProjectRouteMock,
		},
		project: {
			moveProject: moveProjectMock,
			getProjectDetail: getProjectDetailMock,
			renameProject: vi.fn(),
		},
		workspace: {
			fetchWorkspaces: vi.fn(),
		},
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: projectStoreMock,
	topicStore: { selectedTopic: null },
	workspaceStore: {
		workspaces: [
			{ id: "workspace-home", workspace_type: "default" },
			{ id: "workspace-chat", workspace_type: "chat" },
		],
	},
}))

vi.mock("@/pages/superMagic/pages/ChatProjectPage/components/ChatProjectRenameDialog", () => ({
	ChatProjectRenameDialog: () => null,
}))

vi.mock("@/pages/superMagic/components/EmptyWorkspacePanel/hooks/projectActionModals", () => ({
	loadDeleteDangerModal: () =>
		Promise.resolve({
			default: ({ onSubmit }: { onSubmit: () => void }) => (
				<button type="button" data-testid="confirm-delete-project" onClick={onSubmit}>
					Confirm delete
				</button>
			),
		}),
}))

vi.mock("@/pages/superMagic/pages/ChatProjectPage/components/ChatSaveAsProjectModal", () => ({
	default: ({
		onConfirm,
	}: {
		onConfirm: (payload: { workspaceId: string; projectName: string }) => void
	}) => (
		<button
			type="button"
			data-testid="confirm-save-as-project"
			onClick={() =>
				onConfirm({
					workspaceId: "workspace-target",
					projectName: "Mock saved project",
				})
			}
		>
			Confirm save as
		</button>
	),
}))

import { useDesktopChatProjectActions } from "../useDesktopChatProjectActions"

const currentChatProject = {
	id: "project-current",
	workspace_id: "workspace-source",
	project_name: "Mock current chat",
} as ProjectListItem

const anotherChatProject = {
	id: "project-other",
	workspace_id: "workspace-source",
	project_name: "Mock other chat",
} as ProjectListItem

interface SaveAsHarnessProps {
	project: ProjectListItem
}

/**
 * Exercises the hook through its public action map and rendered modal components.
 */
function SaveAsHarness({ project }: SaveAsHarnessProps) {
	const { updateCurrentActionItem, projectActionMap, projectActionComponents } =
		useDesktopChatProjectActions({
			actionContext: "list",
		})

	return (
		<>
			<button
				type="button"
				data-testid="open-save-as"
				onClick={() => {
					updateCurrentActionItem(project)
					projectActionMap.get("saveAsProject")?.onClick()
				}}
			>
				Open save as
			</button>
			<button
				type="button"
				data-testid="open-delete"
				onClick={() => {
					updateCurrentActionItem(project)
					projectActionMap.get("delete")?.onClick()
				}}
			>
				Open delete
			</button>
			{projectActionComponents}
		</>
	)
}

describe("useDesktopChatProjectActions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		projectStoreMock.selectedProject = null
		isCurrentChatProjectRouteMock.mockReturnValue(false)
		moveProjectMock.mockResolvedValue(undefined)
		getProjectDetailMock.mockResolvedValue({
			id: "project-current",
			workspace_id: "workspace-target",
			project_name: "Mock saved project",
		})
		switchProjectInDesktopMock.mockResolvedValue(undefined)
		deleteProjectMock.mockResolvedValue(undefined)
		navigateToHomeMock.mockResolvedValue(undefined)
	})

	it("exposes desktop chat action keys for rename, save-as, and delete", () => {
		const { result } = renderHook(() => useDesktopChatProjectActions())

		expect(result.current.projectActions.map((action) => action.key)).toEqual([
			"rename",
			"saveAsProject",
			"delete",
		])
		expect(result.current.projectActionMap.get("rename")?.label).toBe("chat.renameChat")
		expect(result.current.projectActionMap.get("saveAsProject")?.label).toBe(
			"chat.saveAsProject",
		)
		expect(result.current.projectActionMap.get("delete")?.variant).toBe("danger")
	})

	it("switches to the moved project after sidebar save-as moves the visible chat detail project", async () => {
		projectStoreMock.selectedProject = currentChatProject
		isCurrentChatProjectRouteMock.mockReturnValue(true)

		render(<SaveAsHarness project={currentChatProject} />)

		act(() => {
			screen.getByTestId("open-save-as").click()
		})
		const confirmButton = await screen.findByTestId("confirm-save-as-project")
		act(() => {
			confirmButton.click()
		})

		await waitFor(() => {
			expect(moveProjectMock).toHaveBeenCalledWith({
				projectId: "project-current",
				sourceWorkspaceId: "workspace-source",
				targetWorkspaceId: "workspace-target",
				targetProjectName: "Mock saved project",
			})
			expect(getProjectDetailMock).toHaveBeenCalledWith("project-current", {
				enableErrorMessagePrompt: false,
			})
			expect(switchProjectInDesktopMock).toHaveBeenCalledWith({
				id: "project-current",
				workspace_id: "workspace-target",
				project_name: "Mock saved project",
			})
			expect(navigateToHomeMock).not.toHaveBeenCalled()
		})
	})

	it("keeps the current page after sidebar save-as moves another chat project", async () => {
		projectStoreMock.selectedProject = currentChatProject
		isCurrentChatProjectRouteMock.mockReturnValue(true)

		render(<SaveAsHarness project={anotherChatProject} />)

		act(() => {
			screen.getByTestId("open-save-as").click()
		})
		const confirmButton = await screen.findByTestId("confirm-save-as-project")
		act(() => {
			confirmButton.click()
		})

		await waitFor(() => {
			expect(moveProjectMock).toHaveBeenCalledWith({
				projectId: "project-other",
				sourceWorkspaceId: "workspace-source",
				targetWorkspaceId: "workspace-target",
				targetProjectName: "Mock saved project",
			})
			expect(switchProjectInDesktopMock).not.toHaveBeenCalled()
			expect(navigateToHomeMock).not.toHaveBeenCalled()
		})
	})

	it("uses the first normal workspace as home fallback when deleting the visible chat detail project", async () => {
		projectStoreMock.selectedProject = currentChatProject

		render(<SaveAsHarness project={currentChatProject} />)

		act(() => {
			screen.getByTestId("open-delete").click()
		})
		const confirmButton = await screen.findByTestId("confirm-delete-project")
		act(() => {
			confirmButton.click()
		})

		await waitFor(() => {
			expect(deleteProjectMock).toHaveBeenCalledWith(currentChatProject, {
				selectedProjectBehavior: "navigate-home",
				lastUsedWorkspaceId: "workspace-home",
			})
		})
	})
})
