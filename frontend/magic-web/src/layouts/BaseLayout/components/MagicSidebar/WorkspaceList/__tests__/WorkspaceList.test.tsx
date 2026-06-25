import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { HTMLAttributes } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	mockSilentRefreshSidebarLoadedCaches,
	mockRefreshResourceStatus,
	mockFetchWorkspaces,
	workspaceStoreMock,
} = vi.hoisted(() => ({
	mockSilentRefreshSidebarLoadedCaches: vi.fn(),
	mockRefreshResourceStatus: vi.fn(),
	mockFetchWorkspaces: vi.fn(),
	workspaceStoreMock: {
		workspaces: [] as Array<{ id: string; name: string; workspace_status?: string }>,
		selectedWorkspace: null as { id: string } | null,
		isWorkspaceListLoading: false,
	},
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/stores/layout", () => ({
	sidebarStore: {
		setActiveWorkspace: vi.fn(),
		setWorkspaceExpanded: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core/workspace", () => ({
	default: workspaceStoreMock,
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		silentRefreshSidebarLoadedCaches: mockSilentRefreshSidebarLoadedCaches,
		workspace: {
			fetchWorkspaces: mockFetchWorkspaces,
		},
	},
}))

vi.mock("@/pages/superMagic/services/statusPollingService", () => ({
	default: {
		refreshResourceStatus: mockRefreshResourceStatus,
	},
}))

vi.mock("../WorkspaceItem", () => ({
	default: ({ workspace }: { workspace: { id: string; name: string } }) => (
		<div data-testid={`workspace-item-${workspace.id}`}>{workspace.name}</div>
	),
}))

vi.mock("../CreateWorkspaceInput", () => ({
	default: () => <div data-testid="create-workspace-input" />,
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: (props: HTMLAttributes<HTMLDivElement> & { viewportClassName?: string }) => {
		const { children, ...restProps } = props
		// Drop the testing-only viewport prop before forwarding to a DOM node.
		delete (restProps as { viewportClassName?: string }).viewportClassName
		return <div {...restProps}>{children}</div>
	},
}))

vi.mock("@/components/shadcn-ui/sidebar", () => ({
	SidebarGroup: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
	SidebarGroupContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
	SidebarGroupLabel: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
	SidebarMenu: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
}))

vi.mock("@/lib/utils", () => ({
	cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
}))

vi.mock("@/utils/testid", () => ({
	toTestIdSegment: (value: string) => value,
}))

/**
 * The sidebar refresh button should only trigger the silent sidebar cache refresh
 * so the UI no longer performs an extra status-only polling request.
 */
describe("WorkspaceList", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		workspaceStoreMock.workspaces = [
			{
				id: "workspace-1",
				name: "Workspace One",
				workspace_status: "running",
			},
		]
		workspaceStoreMock.selectedWorkspace = { id: "workspace-1" }
		workspaceStoreMock.isWorkspaceListLoading = false
		mockSilentRefreshSidebarLoadedCaches.mockResolvedValue(undefined)
		mockRefreshResourceStatus.mockResolvedValue(undefined)
		mockFetchWorkspaces.mockResolvedValue([])
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0)
			return 1
		})
		vi.stubGlobal("cancelAnimationFrame", vi.fn())
	})

	it("refresh button only triggers the silent sidebar cache refresh", async () => {
		const { default: WorkspaceList } = await import("../WorkspaceList")

		render(<WorkspaceList />)

		fireEvent.click(screen.getByTestId("sidebar-workspace-list-refresh"))

		await waitFor(() => {
			expect(mockSilentRefreshSidebarLoadedCaches).toHaveBeenCalledTimes(1)
		})
		expect(mockFetchWorkspaces).not.toHaveBeenCalled()
		expect(mockRefreshResourceStatus).not.toHaveBeenCalled()
	})
})
