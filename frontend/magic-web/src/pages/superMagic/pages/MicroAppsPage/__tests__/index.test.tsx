import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { RouteName } from "@/routes/constants"
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
			data-testid="mock-create-prompt"
			onClick={() => onCreated("new-app")}
			onFocus={() => onFocusChange?.(true)}
			onBlur={() => onFocusChange?.(false)}
		>
			create
		</button>
	),
}))

vi.mock("../components/MicroAppFloatingBackdrop", () => ({
	default: ({ active }: { active?: boolean }) => (
		<div data-testid="mock-floating-backdrop" data-active={active} />
	),
}))

vi.mock("../components/MicroAppCard", () => ({
	default: ({
		title,
		onClick,
		testId,
	}: {
		title: string
		onClick: () => void
		testId: string
	}) => (
		<button type="button" data-testid={testId} onClick={onClick}>
			{title}
		</button>
	),
}))

describe("MicroAppsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(window, "open").mockImplementation(() => null)
		mocks.getMicroAppProjectByProjectId.mockImplementation((projectId: string) =>
			Promise.resolve({ app_id: projectId === "new-app" ? "app-new" : "app-1" }),
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

	it("opens api access_url before falling back to local share route", () => {
		mocks.useMicroAppsPage.mockReturnValue({
			workspace: { id: "workspace-1", name: "Micro Apps" },
			projects: [],
			publishedProjects: [
				{
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
		fireEvent.click(screen.getByTestId("micro-apps-published-project-2"))

		expect(window.open).toHaveBeenCalledWith(
			"https://example.com/micro-app/resource-2",
			"_blank",
			"noopener,noreferrer",
		)
		expect(mocks.navigate).not.toHaveBeenCalled()
	})

	it("enters the new micro app after the hero prompt creates it", async () => {
		render(<MicroAppsPage />)

		fireEvent.click(screen.getByTestId("mock-create-prompt"))

		expect(mocks.getMicroAppProjectByProjectId).toHaveBeenCalledWith("new-app")
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-new" },
			})
		})
	})

	it("renders the desktop page inside a bordered rounded container", () => {
		render(<MicroAppsPage />)

		expect(screen.queryByText("microAppsPage.eyebrow")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-hero-title")).toHaveClass("mx-auto")
		expect(screen.getByText("microAppsPage.heroCapabilityProduct")).toBeInTheDocument()
		expect(screen.getByTestId("mock-create-prompt").parentElement).toHaveClass("mx-auto")
		expect(screen.getByTestId("micro-apps-hero")).toHaveClass("min-h-[70%]")
		expect(screen.getByTestId("micro-apps-page")).toHaveClass(
			"rounded-2xl",
			"border",
			"border-border/70",
		)
	})

	it("emphasizes the title and backdrop while the hero prompt is focused", () => {
		render(<MicroAppsPage />)

		const title = screen.getByTestId("micro-app-hero-title")
		const prompt = screen.getByTestId("mock-create-prompt")
		const backdrop = screen.getByTestId("mock-floating-backdrop")
		expect(title).toHaveAttribute("data-active", "false")
		expect(backdrop).toHaveAttribute("data-active", "false")

		fireEvent.focus(prompt)
		expect(title).toHaveAttribute("data-active", "true")
		expect(backdrop).toHaveAttribute("data-active", "true")

		fireEvent.blur(prompt)
		expect(title).toHaveAttribute("data-active", "false")
		expect(backdrop).toHaveAttribute("data-active", "false")
	})
})
