import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

const {
	projectStoreMock,
	isCurrentChatProjectRouteMock,
	pinProjectMock,
	moveProjectMock,
	getProjectDetailMock,
	loadProjectsForWorkspaceMock,
	switchProjectInDesktopMock,
	deleteProjectMock,
	navigateToHomeMock,
	toastSuccessMock,
	toastErrorMock,
} = vi.hoisted(() => ({
	projectStoreMock: {
		selectedProject: null as ProjectListItem | null,
		updateProject: vi.fn(),
	},
	isCurrentChatProjectRouteMock: vi.fn(),
	pinProjectMock: vi.fn(),
	moveProjectMock: vi.fn(),
	getProjectDetailMock: vi.fn(),
	loadProjectsForWorkspaceMock: vi.fn(),
	switchProjectInDesktopMock: vi.fn(),
	deleteProjectMock: vi.fn(),
	navigateToHomeMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	toastErrorMock: vi.fn(),
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
			pinProject: pinProjectMock,
			moveProject: moveProjectMock,
			getProjectDetail: getProjectDetailMock,
			renameProject: vi.fn(),
		},
		workspace: {
			fetchWorkspaces: vi.fn(),
		},
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: toastSuccessMock,
		error: toastErrorMock,
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		...projectStoreMock,
		loadProjectsForWorkspace: loadProjectsForWorkspaceMock,
	},
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
		pinProjectMock.mockResolvedValue(undefined)
		moveProjectMock.mockResolvedValue(undefined)
		getProjectDetailMock.mockResolvedValue({
			id: "project-current",
			workspace_id: "workspace-target",
			project_name: "Mock saved project",
		})
		loadProjectsForWorkspaceMock.mockResolvedValue(undefined)
		switchProjectInDesktopMock.mockResolvedValue(undefined)
		deleteProjectMock.mockResolvedValue(undefined)
		navigateToHomeMock.mockResolvedValue(undefined)
	})

	it("exposes desktop chat action keys for pin, rename, save-as, and delete", () => {
		const { result } = renderHook(() => useDesktopChatProjectActions())

		expect(result.current.projectActions.map((action) => action.key)).toEqual([
			"pinProject",
			"rename",
			"saveAsProject",
			"delete",
		])
		expect(result.current.projectActionMap.get("pinProject")?.label).toBe("chat.pinChat")
		expect(result.current.projectActionMap.get("rename")?.label).toBe("chat.renameChat")
		expect(result.current.projectActionMap.get("saveAsProject")?.label).toBe(
			"chat.saveAsProject",
		)
		expect(result.current.projectActionMap.get("delete")?.variant).toBe("danger")
	})

	it("shows unpin label when the selected detail project is already pinned", () => {
		projectStoreMock.selectedProject = {
			...currentChatProject,
			is_pinned: true,
		} as ProjectListItem

		const { result } = renderHook(() =>
			useDesktopChatProjectActions({
				actionContext: "detail",
			}),
		)

		expect(result.current.projectActionMap.get("pinProject")?.label).toBe("chat.unpinChat")
	})

	it("updates the detail pin label when selectedProject pin state changes after mount", () => {
		projectStoreMock.selectedProject = {
			...currentChatProject,
			is_pinned: false,
		} as ProjectListItem

		const { result, rerender } = renderHook(() =>
			useDesktopChatProjectActions({
				actionContext: "detail",
			}),
		)

		expect(result.current.projectActionMap.get("pinProject")?.label).toBe("chat.pinChat")

		projectStoreMock.selectedProject = {
			...currentChatProject,
			is_pinned: true,
		} as ProjectListItem
		rerender()

		expect(result.current.projectActionMap.get("pinProject")?.label).toBe("chat.unpinChat")
	})

	it("uses selectedProject over stale currentActionItem in detail context", () => {
		projectStoreMock.selectedProject = {
			...currentChatProject,
			is_pinned: true,
		} as ProjectListItem

		function DetailLabelHarness() {
			const { updateCurrentActionItem, projectActionMap } = useDesktopChatProjectActions({
				actionContext: "detail",
			})

			return (
				<>
					<button
						type="button"
						data-testid="set-stale-detail-project"
						onClick={() => {
							updateCurrentActionItem({
								...anotherChatProject,
								is_pinned: false,
							} as ProjectListItem)
						}}
					>
						Set stale detail project
					</button>
					<div data-testid="detail-pin-label">
						{projectActionMap.get("pinProject")?.label}
					</div>
				</>
			)
		}

		render(<DetailLabelHarness />)

		act(() => {
			screen.getByTestId("set-stale-detail-project").click()
		})

		expect(screen.getByTestId("detail-pin-label")).toHaveTextContent("chat.unpinChat")
	})

	it("pins the targeted chat project and refreshes the list", async () => {
		const onProjectChanged = vi.fn().mockResolvedValue(undefined)
		const project = {
			...currentChatProject,
			is_pinned: false,
		} as ProjectListItem

		function PinHarness() {
			const { updateCurrentActionItem, projectActionMap } = useDesktopChatProjectActions({
				onProjectChanged,
			})

			return (
				<>
					<button
						type="button"
						data-testid="set-pin-project"
						onClick={() => {
							updateCurrentActionItem(project)
						}}
					>
						Set project
					</button>
					<button
						type="button"
						data-testid="run-pin-project"
						onClick={() => {
							projectActionMap.get("pinProject")?.onClick()
						}}
					>
						Run pin
					</button>
				</>
			)
		}

		render(<PinHarness />)

		act(() => {
			screen.getByTestId("set-pin-project").click()
		})

		act(() => {
			screen.getByTestId("run-pin-project").click()
		})

		await waitFor(() => {
			expect(pinProjectMock).toHaveBeenCalledWith(project, true)
			expect(onProjectChanged).toHaveBeenCalled()
			expect(toastSuccessMock).toHaveBeenCalledWith("chat.pinChatSuccess")
		})
	})

	it("uses the selected project as a fallback target for detail pin actions", async () => {
		const onProjectChanged = vi.fn().mockResolvedValue(undefined)
		projectStoreMock.selectedProject = {
			...currentChatProject,
			is_pinned: false,
		} as ProjectListItem

		function DetailPinHarness() {
			const { projectActionMap } = useDesktopChatProjectActions({
				actionContext: "detail",
				onProjectChanged,
			})

			return (
				<button
					type="button"
					data-testid="run-detail-pin-project"
					onClick={() => {
						projectActionMap.get("pinProject")?.onClick()
					}}
				>
					Run detail pin
				</button>
			)
		}

		render(<DetailPinHarness />)

		act(() => {
			screen.getByTestId("run-detail-pin-project").click()
		})

		await waitFor(() => {
			expect(pinProjectMock).toHaveBeenCalledWith(
				expect.objectContaining({ id: "project-current" }),
				true,
			)
			expect(onProjectChanged).toHaveBeenCalled()
			expect(toastSuccessMock).toHaveBeenCalledWith("chat.pinChatSuccess")
		})
	})

	it("updates the pin action label immediately after unpinning", async () => {
		const onProjectChanged = vi.fn().mockResolvedValue(undefined)
		const pinnedProject = {
			...currentChatProject,
			is_pinned: true,
		} as ProjectListItem

		function LabelHarness() {
			const { updateCurrentActionItem, projectActions, projectActionMap } =
				useDesktopChatProjectActions({
					onProjectChanged,
				})

			return (
				<>
					<button
						type="button"
						data-testid="set-pinned-project"
						onClick={() => {
							updateCurrentActionItem(pinnedProject)
						}}
					>
						Set pinned project
					</button>
					<button
						type="button"
						data-testid="run-unpin-project"
						onClick={() => {
							projectActionMap.get("pinProject")?.onClick()
						}}
					>
						Run unpin
					</button>
					<div data-testid="pin-label">
						{projectActions.find((action) => action.key === "pinProject")?.label}
					</div>
				</>
			)
		}

		render(<LabelHarness />)

		act(() => {
			screen.getByTestId("set-pinned-project").click()
		})

		expect(screen.getByTestId("pin-label")).toHaveTextContent("chat.unpinChat")

		act(() => {
			screen.getByTestId("run-unpin-project").click()
		})

		await waitFor(() => {
			expect(pinProjectMock).toHaveBeenCalledWith(pinnedProject, false)
			expect(screen.getByTestId("pin-label")).toHaveTextContent("chat.pinChat")
			expect(toastSuccessMock).toHaveBeenCalledWith("chat.unpinChatSuccess")
		})
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

	it("refreshes the target workspace project cache after sidebar save-as moves another chat project", async () => {
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
			expect(loadProjectsForWorkspaceMock).toHaveBeenCalledWith(
				"workspace-target",
				true,
				true,
			)
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
