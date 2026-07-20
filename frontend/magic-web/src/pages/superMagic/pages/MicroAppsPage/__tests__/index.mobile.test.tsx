import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ShareType } from "@/pages/superMagic/components/Share/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { RouteName } from "@/routes/constants"
import MicroAppsPageMobile from "../index.mobile"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	refresh: vi.fn(),
	useMicroAppsPage: vi.fn(),
	createProject: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("../hooks/useMicroAppsPage", () => ({
	useMicroAppsPage: mocks.useMicroAppsPage,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createProject: mocks.createProject,
	},
}))

vi.mock("@/pages/superMagicMobile/components/MobileShell", () => ({
	MobileShellSidebarToggleButton: () => <button type="button">menu</button>,
}))

vi.mock("@/components/shadcn-ui/tabs", async () => {
	const React = await import("react")
	const TabsContext = React.createContext<{ onValueChange?: (value: string) => void }>({})

	return {
		Tabs: ({
			children,
			onValueChange,
			...props
		}: PropsWithChildren<
			HTMLAttributes<HTMLDivElement> & { onValueChange?: (value: string) => void }
		>) => (
			<TabsContext.Provider value={{ onValueChange }}>
				<div {...props}>{children}</div>
			</TabsContext.Provider>
		),
		TabsList: ({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
			<div {...props}>{children}</div>
		),
		TabsTrigger: ({
			children,
			value,
			...props
		}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>) => {
			const context = React.useContext(TabsContext)
			return (
				<button type="button" {...props} onClick={() => context.onValueChange?.(value)}>
					{children}
				</button>
			)
		},
	}
})

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe("MicroAppsPageMobile", () => {
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

	it("opens draft and published micro apps from the mobile list", () => {
		render(<MicroAppsPageMobile />)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-project-project-1"))
		expect(mocks.navigate).toHaveBeenCalledWith({
			name: RouteName.MicroApp,
			params: { projectId: "project-1" },
			viewTransition: false,
		})

		fireEvent.click(screen.getByTestId("micro-apps-mobile-tab-published"))
		fireEvent.click(screen.getByTestId("micro-apps-mobile-published-resource-2"))
		expect(window.open).toHaveBeenCalledWith(
			`${window.location.origin}/micro-app/resource-2`,
			"_blank",
			"noopener,noreferrer",
		)
	})

	it("creates a micro app project from the mobile header", async () => {
		mocks.createProject.mockResolvedValue({ project: { id: "project-new" } })
		render(<MicroAppsPageMobile />)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-create"))

		expect(mocks.createProject).toHaveBeenCalledWith({
			workspace_id: "workspace-1",
			project_name: "",
			project_description: "",
			project_mode: TopicMode.MicroApp,
		})
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { projectId: "project-new" },
				viewTransition: false,
			})
		})
	})
})
