import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import SidebarContent from "../SidebarContent"

const { mockIsMagicApp, navigateMock, changeBottomTabMock } = vi.hoisted(() => ({
	mockIsMagicApp: vi.fn(),
	navigateMock: vi.fn(),
	changeBottomTabMock: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadMagicFlowLocale: vi.fn(),
	loadFallbackLocale: vi.fn(),
}))

vi.mock("react-router", () => ({
	useLocation: () => ({ pathname: "/mock-route" }),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return mockIsMagicApp()
	},
}))

vi.mock("@/platform/native", () => ({
	getNativePort: () => ({
		navigation: {
			changeBottomTab: changeBottomTabMock,
		},
	}),
}))

vi.mock("@/pages/superMagic/stores/core/workspace", () => ({
	__esModule: true,
	default: {
		workspaces: [],
		selectedWorkspace: null,
	},
}))

vi.mock("@/pages/superMagic/constants", () => ({
	isCollaborationWorkspace: () => false,
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	__esModule: true,
	default: () => navigateMock,
}))

vi.mock("@/routes/constants", () => ({
	RouteName: {
		Super: "Super",
		AudioRecordings: "AudioRecordings",
	},
}))

vi.mock("@/routes/history/helpers", () => ({
	getRoutePath: () => "/recordings",
	routesPathMatch: () => false,
}))

vi.mock("@/pages/superMagic/utils/clawBrand", () => ({
	getClawBrandTranslationValues: () => ({}),
}))

vi.mock("@/pages/superMagic/hooks/useResourceStatusPolling", () => ({
	__esModule: true,
	default: () => undefined,
}))

vi.mock("../hooks/useNavigateToSuperHome", () => ({
	useNavigateToSuperHome: () => ({
		superRouteUrl: "/super",
		handleNavigateToSuperHome: vi.fn(),
	}),
}))

vi.mock("../hooks/useSidebarMarketMenuItems", () => ({
	useSidebarMarketMenuItems: () => [
		{
			titleKey: "sidebar:audioRecordings.title",
			routeName: "AudioRecordings",
			testId: "sidebar-content-audio-recordings-button",
			Icon: () => <span data-testid="mock-audio-icon" />,
		},
	],
}))

vi.mock("../WorkspaceList", () => ({
	WorkspaceList: () => <div data-testid="mock-workspace-list" />,
}))

vi.mock("../CollapsedWorkspaceMenu", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-collapsed-menu" />,
}))

vi.mock("../AppsSubMenu", () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("../ChatsSubMenu", () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/other/Divider", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-divider" />,
}))

vi.mock("@/components/shadcn-ui/sidebar", () => ({
	SidebarGroup: ({ children, ...props }: { children: ReactNode }) => (
		<div {...props}>{children}</div>
	),
	SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarMenuButton: (inputProps: {
		children: ReactNode
		asChild?: boolean
		onClick?: () => void
		isActive?: boolean
	}) => {
		const { children, asChild, onClick, isActive, ...props } = inputProps

		void isActive

		return asChild ? (
			<div {...props}>{children}</div>
		) : (
			<button type="button" onClick={onClick} {...props}>
				{children}
			</button>
		)
	},
}))

/**
 * 使用完整 SidebarContent 组件做行为断言，确保录音入口只改点击分流，不改菜单结构。
 */
function renderSidebarContent() {
	return render(<SidebarContent collapsed={false} />)
}

/**
 * 读取录音入口中的真实 anchor，避免在断言里使用非空断言。
 */
function getAudioRecordingsAnchor() {
	const anchor = screen
		.getByTestId("sidebar-content-audio-recordings-button")
		.querySelector<HTMLAnchorElement>("a")

	if (!anchor) {
		throw new Error("Expected audio recordings anchor to exist")
	}

	return anchor
}

describe("SidebarContent audio recordings entry", () => {
	beforeEach(() => {
		mockIsMagicApp.mockReset()
		mockIsMagicApp.mockReturnValue(false)
		navigateMock.mockReset()
		changeBottomTabMock.mockReset()
	})

	it("keeps desktop route navigation outside Magic App", () => {
		renderSidebarContent()

		fireEvent.click(getAudioRecordingsAnchor())

		expect(navigateMock).toHaveBeenCalledWith({ name: "AudioRecordings" })
		expect(changeBottomTabMock).not.toHaveBeenCalled()
	})

	it("opens the native recording tab inside Magic App instead of navigating to the web page", () => {
		mockIsMagicApp.mockReturnValue(true)

		renderSidebarContent()

		fireEvent.click(getAudioRecordingsAnchor())

		expect(changeBottomTabMock).toHaveBeenCalledWith({
			tab: "ai_recording",
			bottomTabHeight: 0,
		})
		expect(navigateMock).not.toHaveBeenCalled()
	})
})
