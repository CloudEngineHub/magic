import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { handleProjectTopicBackNavigation } from "../backNavigation"
import { RouteName } from "@/routes/constants"
import MainHeader from "../index"

const mockState = vi.hoisted(() => ({
	routeName: "SuperWorkspaceProjectTopicState" as string | undefined,
	projectStore: {
		selectedProject: {
			id: "project-1",
			project_name: "Summer Campaign 2025",
		} as { id: string; project_name?: string } | null,
	},
	topicStore: {
		selectedTopic: {
			id: "topic-1",
			topic_name: "Kickoff Discussion",
		} as { id: string; topic_name?: string } | null,
		setSelectedTopic: vi.fn(),
	},
	workspaceStore: {
		selectedWorkspace: null as { id: string } | null,
	},
}))

vi.mock("@/components/base/FlexBox", () => ({
	default: "div",
}))

vi.mock("../../../../components/WorkspaceSelect", () => ({
	default: () => null,
}))

vi.mock("react-i18next", async () => {
	const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next")

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router")

	return {
		...actual,
		useLocation: () => ({ pathname: "/demo/super/project-1/topic-1", state: null }),
		useParams: () => ({ projectId: "project-1" }),
	}
})

vi.mock("@/routes/history/helpers", () => ({
	routesMatch: () =>
		mockState.routeName
			? {
					route: { name: mockState.routeName },
				}
			: null,
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: mockState.projectStore,
	topicStore: mockState.topicStore,
	workspaceStore: mockState.workspaceStore,
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("@/pages/superMagic/components/WithCollaborators/hooks/useCollaboratorUpdatePanel", () => ({
	default: () => ({ canManageCollaborators: false }),
}))

vi.mock("@/pages/superMagicMobile/utils/sharedProjectActionPolicy", () => ({
	resolveProjectDetailHeaderActions: () => ({
		showActionCapsule: true,
		actionSlots: { share: true, more: true, collaborators: false },
	}),
}))

vi.mock("@/pages/superMagicMobile/pages/shared/topicPageCapabilities", () => ({
	MobileTopicPageKind: { ProjectTopic: "project-topic" },
	getMobileTopicPageCapabilities: () => ({
		resolveBackTarget: () => ({ name: RouteName.SuperWorkspaceProjectState }),
	}),
}))

/** Renders MainHeader on a project route with the current mock store state. */
function renderProjectHeader() {
	return render(<MainHeader showBackButton />)
}

describe("handleProjectTopicBackNavigation", () => {
	const navigate = vi.fn()
	const setSelectedTopic = vi.fn()
	const projectTopicCapabilities = {
		canCreateSiblingTopic: true,
		canSaveAsProject: false,
		resolveBackTarget: (projectId?: string) => ({
			name: RouteName.SuperWorkspaceProjectState,
			params: projectId ? { projectId } : undefined,
		}),
	}

	beforeEach(() => {
		navigate.mockReset()
		setSelectedTopic.mockReset()
	})

	it("clears topic and navigates back with project detail fallback", () => {
		const handled = handleProjectTopicBackNavigation({
			projectId: "project-1",
			projectTopicCapabilities,
			setSelectedTopic,
			navigate,
		})

		expect(handled).toBe(true)
		expect(setSelectedTopic).toHaveBeenCalledWith(null)
		expect(navigate).toHaveBeenCalledWith({
			delta: -1,
			name: RouteName.SuperWorkspaceProjectState,
			params: { projectId: "project-1" },
			viewTransition: false,
		})
	})

	it("does nothing when project id is missing", () => {
		const handled = handleProjectTopicBackNavigation({
			projectId: undefined,
			projectTopicCapabilities,
			setSelectedTopic,
			navigate,
		})

		expect(handled).toBe(false)
		expect(setSelectedTopic).not.toHaveBeenCalled()
		expect(navigate).not.toHaveBeenCalled()
	})
})

describe("MainHeader project topic title", () => {
	beforeEach(() => {
		mockState.routeName = RouteName.SuperWorkspaceProjectTopicState
		mockState.projectStore.selectedProject = {
			id: "project-1",
			project_name: "Summer Campaign 2025",
		}
		mockState.topicStore.selectedTopic = {
			id: "topic-1",
			topic_name: "Kickoff Discussion",
		}
	})

	it("shows topic name as title and project name as subtitle on project topic page", () => {
		renderProjectHeader()

		expect(screen.getByTestId("project-detail-header-root")).toHaveClass("z-50")
		expect(screen.getByTestId("project-detail-header-title")).toHaveTextContent(
			"Kickoff Discussion",
		)
		expect(screen.getByTestId("project-detail-header-subtitle")).toHaveTextContent(
			"Summer Campaign 2025",
		)
	})

	it("shows unnamed topic fallback as title when topic name is missing", () => {
		mockState.topicStore.selectedTopic = { id: "topic-1", topic_name: "" }

		renderProjectHeader()

		expect(screen.getByTestId("project-detail-header-title")).toHaveTextContent(
			"topic.unnamedTopic",
		)
		expect(screen.getByTestId("project-detail-header-subtitle")).toHaveTextContent(
			"Summer Campaign 2025",
		)
	})

	it("uses unnamed project fallback as subtitle when project name is missing", () => {
		mockState.projectStore.selectedProject = { id: "project-1", project_name: "" }

		renderProjectHeader()

		expect(screen.getByTestId("project-detail-header-title")).toHaveTextContent(
			"Kickoff Discussion",
		)
		expect(screen.getByTestId("project-detail-header-subtitle")).toHaveTextContent(
			"project.unnamedProject",
		)
	})

	it("shows only project name on project entry page without subtitle", () => {
		mockState.routeName = RouteName.SuperWorkspaceProjectState

		renderProjectHeader()

		expect(screen.getByTestId("project-detail-header-title")).toHaveTextContent(
			"Summer Campaign 2025",
		)
		expect(screen.queryByTestId("project-detail-header-subtitle")).toBeNull()
	})
})
