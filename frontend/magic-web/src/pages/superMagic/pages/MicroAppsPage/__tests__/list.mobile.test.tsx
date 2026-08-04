import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RouteName } from "@/routes/constants"
import MicroAppsListPageMobile from "../list.mobile"

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	setScope: vi.fn(),
	setKeyword: vi.fn(),
	refresh: vi.fn(),
	loadMore: vi.fn(),
	renameApp: vi.fn(),
	deleteApp: vi.fn(),
	useMicroAppsPage: vi.fn(),
	t: (key: string) => key,
}))

interface MockMicroAppCardProps {
	title: string
	description?: string
	meta?: string
	coverUrl?: string
	statusLabel?: string
	onClick: () => void
	testId: string
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: mocks.t }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => mocks.navigate,
}))

vi.mock("../hooks/useMicroAppsPage", () => ({
	useMicroAppsPage: mocks.useMicroAppsPage,
}))

vi.mock("../components/MicroAppCard", () => ({
	default: ({
		title,
		description,
		meta,
		coverUrl,
		statusLabel,
		onClick,
		testId,
	}: MockMicroAppCardProps) => (
		<button type="button" data-testid={testId} data-cover-url={coverUrl} onClick={onClick}>
			{title}
			<span>{description}</span>
			<span>{meta}</span>
			<span>{statusLabel}</span>
		</button>
	),
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

describe("MicroAppsListPageMobile", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.useMicroAppsPage.mockReturnValue({
			workspace: { id: "workspace-1", name: "Micro Apps" },
			apps: [
				{
					app_id: "app-1",
					app_name: "客户跟进助手",
					app_description: "客户跟进与提醒工具",
					creator_id: "user-1",
					cover_url: "",
					publish_status: "unpublished",
					updated_at: null,
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
		render(<MicroAppsListPageMobile />)

		expect(screen.getByTestId("micro-apps-list-scroll-area")).toHaveAttribute(
			"data-slot",
			"scroll-area",
		)
		const appCard = screen.getByTestId("micro-apps-mobile-app-app-1")
		expect(screen.getByText("客户跟进与提醒工具")).toBeInTheDocument()
		expect(screen.getByText("microAppsPage.statusUnpublished")).toBeInTheDocument()
		fireEvent.click(appCard)

		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				name: RouteName.MicroApp,
				params: { appId: "app-1" },
				viewTransition: false,
			})
		})
	})

	it("changes scope, searches, and loads more", () => {
		render(<MicroAppsListPageMobile />)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-scope-collaborated"))
		fireEvent.change(screen.getByTestId("micro-apps-mobile-search"), {
			target: { value: "客户" },
		})
		fireEvent.click(screen.getByTestId("micro-apps-mobile-load-more"))

		expect(mocks.setScope).toHaveBeenCalledWith("collaborated")
		expect(mocks.setKeyword).toHaveBeenCalledWith("客户")
		expect(mocks.loadMore).toHaveBeenCalled()
	})

	it("returns to the creation page through history with a route fallback", () => {
		render(<MicroAppsListPageMobile />)

		fireEvent.click(screen.getByTestId("micro-apps-mobile-list-back"))

		expect(mocks.navigate).toHaveBeenCalledWith({
			delta: -1,
			viewTransition: { type: "slide", direction: "right" },
		})
	})
})
