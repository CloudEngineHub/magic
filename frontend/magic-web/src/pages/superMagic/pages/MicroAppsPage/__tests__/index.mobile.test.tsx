import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ShareType } from "@/pages/superMagic/components/Share/types"
import { RouteName } from "@/routes/constants"
import MicroAppsPageMobile from "../index.mobile"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	refresh: vi.fn(),
	useMicroAppsPage: vi.fn(),
	getMicroAppProjectByProjectId: vi.fn(),
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
		getMicroAppProjectByProjectId: mocks.getMicroAppProjectByProjectId,
	},
}))

vi.mock("../components/MicroAppCreatePrompt", () => ({
	default: ({
		onCreated,
		onFocusChange,
	}: {
		onCreated: (projectId: string) => void
		onFocusChange?: (focused: boolean) => void
	}) => (
		<button
			type="button"
			data-testid="mock-mobile-create-prompt"
			onClick={() => onCreated("project-new")}
			onFocus={() => onFocusChange?.(true)}
			onBlur={() => onFocusChange?.(false)}
		>
			create
		</button>
	),
}))

vi.mock("../components/MicroAppFloatingBackdrop", () => ({
	default: ({ active }: { active?: boolean }) => (
		<div data-testid="mock-mobile-floating-backdrop" data-active={active} />
	),
}))

vi.mock("../components/MicroAppCard", () => ({
	default: ({
		title,
		meta,
		onClick,
		testId,
	}: {
		title: string
		meta: string
		onClick: () => void
		testId: string
	}) => (
		<button type="button" data-testid={testId} onClick={onClick}>
			{title}
			<span>{meta}</span>
		</button>
	),
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
		mocks.getMicroAppProjectByProjectId.mockImplementation((projectId: string) =>
			Promise.resolve({ app_id: projectId === "project-new" ? "app-new" : "app-1" }),
		)
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
					app_id: "app-2",
					share_type: ShareType.Public,
					published_at: "2026-07-24T00:00:00Z",
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

	it("opens draft and published micro apps from the mobile list", async () => {
		render(<MicroAppsPageMobile />)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-project-project-1"))
		expect(mocks.getMicroAppProjectByProjectId).toHaveBeenCalledWith("project-1")
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-1" },
				viewTransition: false,
			})
		})

		fireEvent.click(screen.getByTestId("micro-apps-mobile-tab-published"))
		expect(
			screen.getByText(
				`microAppsPage.shareType.public · ${new Date(
					"2026-07-24T00:00:00Z",
				).toLocaleDateString()}`,
			),
		).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("micro-apps-mobile-published-app-2"))
		expect(window.open).toHaveBeenCalledWith(
			`${window.location.origin}/micro-app/app-2`,
			"_blank",
			"noopener,noreferrer",
		)
	})

	it("enters the new micro app after the mobile hero prompt creates it", async () => {
		render(<MicroAppsPageMobile />)

		fireEvent.click(screen.getByTestId("mock-mobile-create-prompt"))

		expect(mocks.getMicroAppProjectByProjectId).toHaveBeenCalledWith("project-new")
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-new" },
				viewTransition: false,
			})
		})
	})

	it("emphasizes the mobile title while the prompt is focused", () => {
		render(<MicroAppsPageMobile />)

		expect(screen.getByTestId("micro-apps-mobile-hero")).toHaveClass("min-h-[70%]")
		const title = screen.getByTestId("micro-app-hero-title")
		const prompt = screen.getByTestId("mock-mobile-create-prompt")
		const backdrop = screen.getByTestId("mock-mobile-floating-backdrop")
		expect(title).toHaveAttribute("data-active", "false")
		expect(backdrop).toHaveAttribute("data-active", "false")

		fireEvent.focus(prompt)
		expect(title).toHaveAttribute("data-active", "true")
		expect(backdrop).toHaveAttribute("data-active", "true")
	})
})
