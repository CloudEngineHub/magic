import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import SidebarFooter from "../SidebarFooter"

const notificationApi = vi.hoisted(() => ({
	listNotifications: vi.fn(),
	getNotificationCounts: vi.fn(),
	getNotificationTemplates: vi.fn(),
	markNotificationRead: vi.fn(),
	acceptNotification: vi.fn(),
	rejectNotification: vi.fn(),
}))

vi.mock("@/apis", () => ({
	NotificationApi: notificationApi,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "footer.inbox" ? "站内信" : key),
		i18n: { language: "zh_CN" },
	}),
}))

vi.mock("../components", () => ({
	ActionButtons: () => <div data-testid="mock-action-buttons" />,
	UserInfoCard: () => <div data-testid="mock-user-info-card" />,
}))

vi.mock("@/components/base", () => ({
	MagicTooltip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/infrastructure/logger", () => ({
	logger: {
		createLogger: () => ({
			error: vi.fn(),
			warn: vi.fn(),
			log: vi.fn(),
			report: vi.fn(),
		}),
	},
}))

describe("SidebarFooter inbox entry", () => {
	afterEach(async () => {
		const { inboxStore } = await import("@/components/business/Inbox/store")
		inboxStore.reset()
		vi.clearAllMocks()
	})

	it("renders the inbox row between actions and the user card", async () => {
		const { inboxStore } = await import("@/components/business/Inbox/store")
		inboxStore.reset()
		inboxStore.systemUnread = 11
		inboxStore.authorizationPending = 3
		notificationApi.getNotificationCounts.mockResolvedValue({
			total: 14,
			system_unread: 11,
			authorization_pending: 3,
		})
		notificationApi.getNotificationTemplates.mockResolvedValue({
			locale: "zh-CN",
			catalog_version: 1,
			templates: {},
		})
		notificationApi.listNotifications.mockResolvedValue({
			items: [],
			page_size: 10,
			next_cursor: null,
			has_more: false,
		})
		render(<SidebarFooter collapsed={false} />)

		expect(screen.getByTestId("inbox-sidebar-entry")).toHaveTextContent("站内信")
		expect(screen.getByTestId("inbox-sidebar-badge")).toHaveTextContent("14")
		fireEvent.click(screen.getByTestId("inbox-sidebar-entry"))
		expect(inboxStore.visible).toBe(true)
	})
})
