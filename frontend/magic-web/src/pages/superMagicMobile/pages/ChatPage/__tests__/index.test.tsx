import { forwardRef, type ReactNode } from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { runInAction } from "mobx"
import { describe, expect, it, vi, beforeEach } from "vitest"

import MobileHomePage from "../index"

const mockUseOptionalSuperMobileShellOutlet = vi.fn()
const {
	applyResolvedRoleMock,
	recoverTopicModeMock,
	refreshFeaturedModeListMock,
	isModeValidMock,
	getRawGlobalTopicModeMock,
	roleStoreState,
	selectedContextStores,
	topicModeState,
} = vi.hoisted(() => ({
	applyResolvedRoleMock: vi.fn(),
	recoverTopicModeMock: vi.fn(),
	refreshFeaturedModeListMock: vi.fn(),
	isModeValidMock: vi.fn(),
	getRawGlobalTopicModeMock: vi.fn(),
	roleStoreState: {
		currentRole: "unavailable-agent",
	},
	selectedContextStores: {
		topicStore: null as null | { selectedTopic: unknown },
		projectStore: null as null | { selectedProject: unknown },
	},
	topicModeState: {
		value: "unavailable-agent",
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagicMobile/components/MobileShell", () => ({
	SuperMobileShellRouteLayout: ({ children }: { children: ReactNode }) => (
		<div data-testid="shell">{children}</div>
	),
	useOptionalSuperMobileShellOutlet: () => mockUseOptionalSuperMobileShellOutlet(),
}))

vi.mock("react-router", () => ({
	useLocation: () => ({
		pathname: "/global/mobile-home",
		search: "",
	}),
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
	useMount: () => undefined,
}))

vi.mock("@/routes/history/helpers", () => ({
	routesPathMatch: (name: string, pathname: string) => {
		if (name === "MobileHome") return pathname === "/global/mobile-home"
		if (name === "MobileTabs") return pathname === "/global/mobile-tabs"
		return false
	},
}))

vi.mock("@/routes/constants", () => ({
	RouteName: {
		MobileHome: "MobileHome",
		MobileTabs: "MobileTabs",
	},
}))

vi.mock("@/routes/components/ViewportRouteGuard", () => ({
	MobileOnlyRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("../components/ChatPageHeader", () => ({
	__esModule: true,
	default: ({ onMenuClick }: { onMenuClick: () => void }) => (
		<button type="button" data-testid="mobile-shell-menu-button" onClick={onMenuClick}>
			menu
		</button>
	),
}))

vi.mock("../components/SloganSection", () => ({
	__esModule: true,
	default: () => <div data-testid="slogan-section" />,
}))

vi.mock("../components/MobileInputContainer", () => ({
	__esModule: true,
	default: forwardRef(() => <div data-testid="mobile-input-container" />),
}))

vi.mock("@/pages/mobileTabs/constants", () => ({
	MobileTabParam: {
		Super: "super",
	},
}))

vi.mock("@/pages/superMagic/pages/Workspace/types", () => ({
	TaskStatus: {
		RUNNING: "RUNNING",
	},
}))

vi.mock("@/pages/superMagic/pages/Workspace/TopicMode", () => ({
	TopicMode: {
		General: "general",
	},
}))

vi.mock("@/pages/superMagic/stores/RoleStore", () => ({
	roleStore: {
		get currentRole() {
			return roleStoreState.currentRole
		},
		setCurrentRole: vi.fn(),
		applyResolvedRole: applyResolvedRoleMock,
	},
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/components/editors/constant", () => ({
	MOBILE_LAYOUT_CONFIG: {},
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/constants", () => ({
	INPUT_CONTAINER_MIN_HEIGHT: {
		HomePage: 88,
	},
}))

vi.mock("@/pages/superMagic/stores/core", async () => {
	const { observable } = await import("mobx")
	const topicStore = observable({
		selectedTopic: null as null | { id: string; agent_code?: string },
		setSelectedTopic: vi.fn(),
	})
	const projectStore = observable({
		selectedProject: null as null | { id: string; workspace_id: string },
		setSelectedProject: vi.fn(),
	})
	selectedContextStores.topicStore = topicStore
	selectedContextStores.projectStore = projectStore

	return {
		topicStore,
		projectStore,
		workspaceStore: {
			setSelectedWorkspace: vi.fn(),
		},
	}
})

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		messages: new Map(),
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				user_id: "user-1",
			},
		},
	},
}))

vi.mock("@/pages/superMagic/hooks/useTaskInterrupt", () => ({
	useTaskInterrupt: () => ({
		handleInterrupt: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	useChatWorkspace: () => ({
		chatWorkspace: null,
		createProjectInChatWorkspace: vi.fn(),
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	__esModule: true,
	default: {
		error: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	__esModule: true,
	default: {
		switchChatProject: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/hooks/useAgentCodeModeFromSearch", () => ({
	__esModule: true,
	default: () => undefined,
}))

vi.mock("@/pages/superMagic/hooks/useTopicMode", () => ({
	__esModule: true,
	default: () => ({
		topicMode: topicModeState.value,
		setTopicMode: vi.fn(),
		recoverTopicMode: recoverTopicModeMock,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useFeaturedModeListRefresh", () => ({
	refreshFeaturedModeList: refreshFeaturedModeListMock,
}))

vi.mock("@/pages/superMagic/services/topicStatusSyncService", () => ({
	applyOptimisticTopicRunningState: vi.fn(),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	__esModule: true,
	default: {
		isModeValid: isModeValidMock,
	},
}))

vi.mock("@/services/superMagic/ProjectTopicService", () => ({
	__esModule: true,
	default: {
		getRawGlobalTopicMode: getRawGlobalTopicModeMock,
	},
}))

vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	getFallbackTopicModeIdentifier: () => "summary",
	resolveProjectModeForCreate: (mode?: string | null) => mode || "summary",
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: {
		mobileTabBarVisible: false,
	},
}))

vi.mock("../agentCodeRoutePolicy", () => ({
	shouldClearResolvedAgentCodeFromUrl: () => false,
}))

vi.mock("../homepageModeState", () => ({
	resolveHomepageDisplayTopicMode: ({ topicMode }: { topicMode: string }) => topicMode,
}))

function getSelectedContextStores() {
	const { topicStore, projectStore } = selectedContextStores
	if (!topicStore || !projectStore) {
		throw new Error("Selected context stores are not initialized")
	}
	return { topicStore, projectStore }
}

describe("MobileHomePage", () => {
	beforeEach(() => {
		const { topicStore, projectStore } = getSelectedContextStores()
		vi.clearAllMocks()
		mockUseOptionalSuperMobileShellOutlet.mockReset()
		mockUseOptionalSuperMobileShellOutlet.mockReturnValue({ openSidebar: vi.fn() })
		roleStoreState.currentRole = "unavailable-agent"
		topicModeState.value = "unavailable-agent"
		getRawGlobalTopicModeMock.mockReturnValue("unavailable-agent")
		runInAction(() => {
			topicStore.selectedTopic = null
			projectStore.selectedProject = null
		})
		refreshFeaturedModeListMock.mockResolvedValue([
			{
				mode: { identifier: "first-agent" },
				agent: { is_visible: true },
			},
			{
				mode: { identifier: "summary" },
				agent: { is_visible: true },
			},
			{
				mode: { identifier: "hidden-agent" },
				agent: { is_visible: false },
			},
		])
		isModeValidMock.mockImplementation((mode: string) =>
			["general", "first-agent", "summary", "hidden-agent"].includes(mode),
		)
	})

	it("does not crash when the panel temporarily renders before shell outlet is ready", () => {
		refreshFeaturedModeListMock.mockResolvedValueOnce([])
		mockUseOptionalSuperMobileShellOutlet
			.mockReturnValueOnce({ openSidebar: vi.fn() })
			.mockReturnValueOnce(null)

		render(<MobileHomePage />)

		expect(screen.getByTestId("mobile-shell-menu-button")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-input-container")).toBeInTheDocument()
	})

	it("uses the configured default when the saved employee is unavailable", async () => {
		render(<MobileHomePage />)

		await waitFor(() => {
			expect(recoverTopicModeMock).toHaveBeenCalledWith("summary")
			expect(applyResolvedRoleMock).toHaveBeenCalledWith("summary")
		})

		expect(applyResolvedRoleMock).not.toHaveBeenCalledWith("first-agent")
	})

	it("uses the first employee when the saved and configured defaults are unavailable", async () => {
		isModeValidMock.mockImplementation((mode: string) => mode === "first-agent")

		render(<MobileHomePage />)

		await waitFor(() => {
			expect(recoverTopicModeMock).toHaveBeenCalledWith("first-agent")
			expect(applyResolvedRoleMock).toHaveBeenCalledWith("first-agent")
		})
	})

	it("restores the saved employee when a valid legacy homepage mode is displayed", async () => {
		topicModeState.value = "ppt"
		getRawGlobalTopicModeMock.mockReturnValue("general")
		isModeValidMock.mockImplementation((mode: string) =>
			["general", "ppt", "summary"].includes(mode),
		)

		render(<MobileHomePage />)

		await waitFor(() => {
			expect(recoverTopicModeMock).toHaveBeenCalledWith("general")
			expect(applyResolvedRoleMock).toHaveBeenCalledWith("general")
		})
	})

	it("keeps a hidden employee when it is still available", async () => {
		roleStoreState.currentRole = "hidden-agent"
		topicModeState.value = "hidden-agent"
		getRawGlobalTopicModeMock.mockReturnValue("hidden-agent")
		render(<MobileHomePage />)

		await waitFor(() => {
			expect(refreshFeaturedModeListMock).toHaveBeenCalledTimes(1)
		})

		expect(recoverTopicModeMock).not.toHaveBeenCalled()
		expect(applyResolvedRoleMock).not.toHaveBeenCalled()
	})

	it("restores the saved homepage employee after returning from a topic", async () => {
		const { topicStore, projectStore } = getSelectedContextStores()
		roleStoreState.currentRole = "unavailable-agent"
		getRawGlobalTopicModeMock.mockReturnValue("general")
		runInAction(() => {
			topicStore.selectedTopic = {
				id: "previous-topic",
				agent_code: "unavailable-agent",
			}
			projectStore.selectedProject = {
				id: "previous-project",
				workspace_id: "workspace-1",
			}
		})
		render(<MobileHomePage />)

		expect(refreshFeaturedModeListMock).not.toHaveBeenCalled()
		expect(recoverTopicModeMock).not.toHaveBeenCalled()

		act(() => {
			runInAction(() => {
				topicStore.selectedTopic = null
				projectStore.selectedProject = null
			})
		})

		await waitFor(() => {
			expect(recoverTopicModeMock).toHaveBeenCalledWith("general")
			expect(applyResolvedRoleMock).toHaveBeenCalledWith("general")
		})
		expect(recoverTopicModeMock).not.toHaveBeenCalledWith("summary")
	})
})
