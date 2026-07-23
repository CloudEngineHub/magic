import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import MicroAppsPage from "../index"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	refresh: vi.fn(),
	useMicroAppsPage: vi.fn(),
	getMicroAppProjectByProjectId: vi.fn(),
	t: (key: string) => key,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: mocks.t,
	}),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("@/components/shadcn-ui/tabs", async () => {
	const React = await import("react")
	const TabsContext = React.createContext<{ onValueChange?: (value: string) => void }>({})

	return {
		Tabs: ({ children, onValueChange, ...props }: any) =>
			React.createElement(TabsContext.Provider, { value: { onValueChange } }, [
				React.createElement("div", { key: "tabs", ...props }, children),
			]),
		TabsList: ({ children, ...props }: any) =>
			React.createElement("div", { ...props }, children),
		TabsTrigger: ({ children, value, ...props }: any) => {
			const context = React.useContext(TabsContext)
			return React.createElement(
				"button",
				{ type: "button", ...props, onClick: () => context.onValueChange?.(value) },
				children,
			)
		},
	}
})

vi.mock("../hooks/useMicroAppsPage", () => ({
	useMicroAppsPage: mocks.useMicroAppsPage,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createMicroAppProject: vi.fn(),
		getMicroAppProjectByProjectId: mocks.getMicroAppProjectByProjectId,
	},
}))

describe("MicroAppsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(window, "open").mockImplementation(() => null)
		mocks.useMicroAppsPage.mockReturnValue({
			workspace: { id: "workspace-1", name: "Micro Apps" },
			projects: [
				{
					id: "project-1",
					project_name: "Draft App",
					workspace_name: "Micro Apps",
				},
			],
			publishedProjects: [
				{
					app_id: "app-2",
					project_id: "project-2",
					project_name: "Published App",
					resource_id: "resource-2",
					share_type: ShareType.Public,
				},
			],
			loading: false,
			error: null,
			refresh: mocks.refresh,
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("renders accessible published micro apps and opens fallback link in a new tab", () => {
		render(<MicroAppsPage />)

		fireEvent.click(screen.getByTestId("micro-apps-tab-published"))

		expect(screen.getByTestId("micro-apps-published-list")).toBeInTheDocument()
		expect(screen.getByText("Published App")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-apps-published-app-2"))

		expect(window.open).toHaveBeenCalledWith(
			`${window.location.origin}/micro-app/app-2`,
			"_blank",
			"noopener,noreferrer",
		)
		expect(mocks.navigate).not.toHaveBeenCalled()
	})

	it("prefers the stable app_id route over a stale api access_url", () => {
		mocks.useMicroAppsPage.mockReturnValue({
			workspace: { id: "workspace-1", name: "Micro Apps" },
			projects: [],
			publishedProjects: [
				{
					app_id: "app-2",
					project_id: "project-2",
					project_name: "Published App",
					resource_id: "resource-2",
					share_type: ShareType.Public,
					access_url: "https://example.com/micro-app/resource-2",
				},
			],
			loading: false,
			error: null,
			refresh: mocks.refresh,
		})

		render(<MicroAppsPage />)

		fireEvent.click(screen.getByTestId("micro-apps-tab-published"))
		fireEvent.click(screen.getByTestId("micro-apps-published-app-2"))

		expect(window.open).toHaveBeenCalledWith(
			`${window.location.origin}/micro-app/app-2`,
			"_blank",
			"noopener,noreferrer",
		)
		expect(mocks.navigate).not.toHaveBeenCalled()
	})
})
