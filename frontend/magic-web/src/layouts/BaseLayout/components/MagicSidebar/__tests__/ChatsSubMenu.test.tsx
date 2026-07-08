import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import ChatsSubMenu from "../ChatsSubMenu"

const {
	collapseIfNarrowMock,
	reloadMock,
	setSearchValueMock,
	ensureChatWorkspaceMock,
	createProjectInChatWorkspaceMock,
	switchChatProjectMock,
} = vi.hoisted(() => ({
	collapseIfNarrowMock: vi.fn(),
	reloadMock: vi.fn().mockResolvedValue(undefined),
	setSearchValueMock: vi.fn(),
	ensureChatWorkspaceMock: vi.fn().mockResolvedValue({ id: "workspace-mock-beta" }),
	createProjectInChatWorkspaceMock: vi.fn().mockResolvedValue({
		project: { id: "project-mock-created" },
		topic: { id: "topic-mock-created" },
	}),
	switchChatProjectMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("react-router", () => ({
	useLocation: () => ({ pathname: "/mock-super-chat" }),
}))

vi.mock("@/routes/constants", () => ({
	/** Keep route names local to this test so route constants do not pull in the full app route tree. */
	RouteName: {
		SuperChatProjectState: "SuperChatProjectState",
	},
}))

vi.mock("@/routes/history/helpers", () => ({
	/** Force the test route to look like the desktop chat detail route without constructing real route configs. */
	routesPathMatch: () => true,
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

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("ahooks", () => ({
	/** Preserve handler identity in tests without pulling in the real ahooks implementation. */
	useMemoizedFn: <Args extends unknown[], ReturnValue>(fn: (...args: Args) => ReturnValue) => fn,
}))

vi.mock("@/components/base", () => ({
	/** Render trigger and popup together so unit tests can interact with popup actions directly. */
	MagicDropdown: ({
		children,
		popupRender,
	}: {
		children: ReactNode
		popupRender: () => ReactNode
	}) => (
		<div>
			{children}
			{popupRender()}
		</div>
	),
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		...rest
	}: {
		children: ReactNode
		onClick?: () => void
		disabled?: boolean
		[key: string]: unknown
	}) => (
		<button type="button" onClick={onClick} disabled={disabled} {...rest}>
			{children}
		</button>
	),
}))

vi.mock("@/components/shadcn-ui/input", () => ({
	Input: ({
		value,
		onChange,
		...rest
	}: {
		value?: string
		onChange?: (event: { target: { value: string } }) => void
		[key: string]: unknown
	}) => <input value={value} onChange={onChange as never} {...rest} />,
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	/** Keep the list content mounted without Radix scroll wrappers in unit tests. */
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/pages/superMagic/hooks/useAutoLoadMoreSentinel", () => ({
	useAutoLoadMoreSentinel: () => vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	useChatWorkspace: () => ({
		chatWorkspace: { id: "workspace-mock-alpha" },
		createProjectInChatWorkspace: createProjectInChatWorkspaceMock,
		ensureChatWorkspace: ensureChatWorkspaceMock,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useDesktopChatProjectActions", () => ({
	useDesktopChatProjectActions: () => ({
		projectActions: [
			{ key: "pinProject", label: "Pin", onClick: vi.fn() },
			{ key: "rename", label: "Rename", onClick: vi.fn() },
			{ key: "saveAsProject", label: "SaveAsProject", onClick: vi.fn() },
			{ key: "delete", label: "Delete", onClick: vi.fn() },
		],
		projectActionComponents: null,
		updateCurrentActionItem: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		switchChatProject: switchChatProjectMock,
	},
}))

vi.mock("@/pages/superMagic/stores", () => ({
	roleStore: {
		currentRole: null,
	},
}))

vi.mock("@/stores/layout", () => ({
	sidebarStore: {
		collapseIfNarrow: collapseIfNarrowMock,
	},
}))

vi.mock("@/pages/superMagicMobile/pages/ChatsPage/hooks/useChatConversationList", () => ({
	/** Supply a stable fictional chat list so the behavior test stays deterministic. */
	useChatConversationList: () => ({
		items: [
			{
				id: "project-mock-existing",
				title: "Mock conversation entry",
				timeLabel: "just now",
				isPinned: false,
				isRunning: false,
				project: { id: "project-mock-existing" },
			},
		],
		isInitialChatListLoading: false,
		isLoadingMore: false,
		searchValue: "",
		setSearchValue: setSearchValueMock,
		isEmpty: false,
		hasMore: false,
		loadMore: vi.fn(),
		reload: reloadMock,
		optimisticUpdatePin: vi.fn(),
	}),
}))

vi.mock("../ChatConversationSubMenuRow", () => ({
	/** Reduce the row to a simple button so this test focuses on ChatsSubMenu side effects. */
	default: ({
		item,
		onOpen,
	}: {
		item: { id: string; title: string }
		onOpen: (item: { id: string; title: string }) => void
	}) => (
		<button type="button" data-testid={`mock-chat-row-${item.id}`} onClick={() => onOpen(item)}>
			{item.title}
		</button>
	),
}))

/** Render ChatsSubMenu with a minimal trigger so tests can focus on submenu actions. */
function renderChatsSubMenu() {
	return render(
		<ChatsSubMenu>
			<button type="button">Open chats</button>
		</ChatsSubMenu>,
	)
}

describe("ChatsSubMenu", () => {
	beforeEach(() => {
		collapseIfNarrowMock.mockClear()
		reloadMock.mockClear()
		setSearchValueMock.mockClear()
		ensureChatWorkspaceMock.mockClear()
		createProjectInChatWorkspaceMock.mockClear()
		switchChatProjectMock.mockClear()
	})

	it("switches an existing chat without collapsing the desktop sidebar", async () => {
		renderChatsSubMenu()

		fireEvent.click(screen.getByTestId("mock-chat-row-project-mock-existing"))

		await waitFor(() => {
			expect(switchChatProjectMock).toHaveBeenCalledWith(
				{ id: "project-mock-existing" },
				null,
				{ chatWorkspace: { id: "workspace-mock-alpha" } },
			)
		})
		expect(collapseIfNarrowMock).not.toHaveBeenCalled()
	})

	it("creates a new chat without collapsing the desktop sidebar", async () => {
		renderChatsSubMenu()

		fireEvent.click(screen.getByTestId("sidebar-chats-submenu-new-chat-button"))

		await waitFor(() => {
			expect(createProjectInChatWorkspaceMock).toHaveBeenCalled()
			expect(reloadMock).toHaveBeenCalledWith({ silent: true })
			expect(switchChatProjectMock).toHaveBeenCalledWith(
				{ id: "project-mock-created" },
				{ id: "topic-mock-created" },
				{ chatWorkspace: { id: "workspace-mock-alpha" } },
			)
		})
		expect(collapseIfNarrowMock).not.toHaveBeenCalled()
	})
})
