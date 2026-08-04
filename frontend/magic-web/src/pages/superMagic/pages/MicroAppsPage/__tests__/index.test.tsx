import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RouteName } from "@/routes/constants"
import MicroAppsPage from "../index"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	setScope: vi.fn(),
	setKeyword: vi.fn(),
	refresh: vi.fn(),
	loadMore: vi.fn(),
	renameApp: vi.fn(),
	deleteApp: vi.fn(),
	useMicroAppsPage: vi.fn(),
	t: vi.fn((key: string) => (key === "microAppsPage.heroTitlePrefix" ? "一句话，" : key)),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: mocks.t }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("../hooks/useMicroAppsPage", () => ({
	useMicroAppsPage: mocks.useMicroAppsPage,
}))

vi.mock("../components/MicroAppCreatePrompt", () => ({
	default: ({
		onCreated,
		onFocusChange,
		keyboardPortRef,
		keyboardConnectorVisible = true,
	}: any) => (
		<>
			{keyboardConnectorVisible ? (
				<span ref={keyboardPortRef} data-testid="micro-apps-keyboard-port" />
			) : null}
			<button
				type="button"
				data-testid="mock-create-prompt"
				onClick={() => onCreated("app-new")}
				onFocus={() => onFocusChange?.(true)}
				onBlur={() => onFocusChange?.(false)}
			>
				create
			</button>
		</>
	),
}))

vi.mock("../components/MicroAppFloatingBackdrop", () => ({
	default: ({ active }: { active?: boolean }) => (
		<div data-testid="mock-floating-backdrop" data-active={active} />
	),
}))

vi.mock("../components/MicroAppCard", () => ({
	default: ({ title, description, coverUrl, statusLabel, onClick, testId }: any) => (
		<button type="button" data-testid={testId} data-cover-url={coverUrl} onClick={onClick}>
			{title}
			<span>{description}</span>
			<span>{statusLabel}</span>
		</button>
	),
}))

vi.mock("@/components/shadcn-ui/tabs", async () => {
	const React = await import("react")
	const TabsContext = React.createContext<{ onValueChange?: (value: string) => void }>({})

	return {
		Tabs: ({ children, onValueChange, ...props }: any) =>
			React.createElement(
				TabsContext.Provider,
				{ value: { onValueChange } },
				React.createElement("div", props, children),
			),
		TabsList: ({ children, ...props }: any) => React.createElement("div", props, children),
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

describe("MicroAppsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.t.mockImplementation((key: string) =>
			key === "microAppsPage.heroTitlePrefix" ? "一句话，" : key,
		)
		mocks.useMicroAppsPage.mockReturnValue({
			workspace: { id: "workspace-1", name: "Micro Apps" },
			apps: [
				{
					app_id: "app-1",
					app_name: "客户跟进助手",
					app_description: "客户跟进与提醒工具",
					creator_id: "user-1",
					cover_url: "https://example.com/cover.png",
					publish_status: "published",
					updated_at: "2026-07-24 10:30:00",
				},
			],
			scope: "all",
			setScope: mocks.setScope,
			keyword: "",
			setKeyword: mocks.setKeyword,
			loading: false,
			loadingMore: false,
			hasMore: true,
			error: null,
			refresh: mocks.refresh,
			loadMore: mocks.loadMore,
			renameApp: mocks.renameApp,
			deleteApp: mocks.deleteApp,
		})
	})

	it("opens an app directly by app_id", async () => {
		render(<MicroAppsPage />)

		expect(screen.getByTestId("micro-apps-keyboard-cable")).toBeInTheDocument()
		expect(screen.getByTestId("micro-apps-keyboard-port")).toBeInTheDocument()
		expect(screen.getByTestId("micro-apps-page")).toHaveAttribute("data-slot", "scroll-area")
		expect(
			screen
				.getByTestId("micro-apps-page")
				.querySelector('[data-slot="scroll-area-viewport"]'),
		).toBeInTheDocument()
		const appCard = screen.getByTestId("micro-apps-app-app-1")
		expect(appCard).toHaveAttribute("data-cover-url", "https://example.com/cover.png")
		expect(screen.getByText("客户跟进与提醒工具")).toBeInTheDocument()
		expect(screen.getByText("microAppsPage.statusPublished")).toBeInTheDocument()
		fireEvent.click(appCard)

		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-1" },
			})
		})
	})

	it("hides the keyboard cable when the translated title has no visible anchor", () => {
		mocks.t.mockImplementation((key: string) =>
			key === "microAppsPage.heroTitlePrefix" ? "Turn one prompt" : key,
		)

		render(<MicroAppsPage />)

		expect(screen.queryByTestId("micro-apps-keyboard-cable")).not.toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-hero-cable-anchor")).not.toBeInTheDocument()
		expect(screen.queryByTestId("micro-apps-keyboard-port")).not.toBeInTheDocument()
	})

	it("changes scope, searches, and loads more", () => {
		render(<MicroAppsPage />)

		fireEvent.click(screen.getByTestId("micro-apps-scope-collaborated"))
		fireEvent.change(screen.getByTestId("micro-apps-search"), {
			target: { value: "客户" },
		})
		fireEvent.click(screen.getByTestId("micro-apps-load-more"))

		expect(mocks.setScope).toHaveBeenCalledWith("collaborated")
		expect(mocks.setKeyword).toHaveBeenCalledWith("客户")
		expect(mocks.loadMore).toHaveBeenCalled()
	})

	it("enters the new app after the creation prompt returns app_id", async () => {
		render(<MicroAppsPage />)

		fireEvent.click(screen.getByTestId("mock-create-prompt"))

		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-new" },
			})
		})
	})
})
