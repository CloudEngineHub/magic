import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CrewConversationPage from "../index"

const { useIsMobileMock } = vi.hoisted(() => ({
	useIsMobileMock: vi.fn(() => true),
}))

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }))
vi.mock("react-router-dom", () => ({
	useLocation: () => ({ search: "?organizationCode=mock-organization" }),
	useParams: () => ({ code: "crew-mock-explicit-layout", clusterCode: "cluster-mock" }),
}))
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: useIsMobileMock }))
vi.mock("@/providers/MagicWidgetProvider", () => ({
	useMagicWidgetConfig: () => ({
		embedContext: {
			instanceId: "widget-mock-explicit-layout",
			hostOrigin: "https://widget-host.example.invalid",
		},
		config: { layout: "desktop" },
	}),
}))
vi.mock("../hooks/useCrewConversationOrganizationGuard", () => ({
	useCrewConversationOrganizationGuard: () => ({ isReady: true, status: "ready" }),
}))
vi.mock("../context", () => ({
	CrewConversationStoreProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("../index.desktop", () => ({
	default: () => <div data-testid="mock-crew-desktop" />,
}))
vi.mock("../index.mobile", () => ({
	default: () => <div data-testid="mock-crew-mobile" />,
}))
vi.mock("../components/CrewStateView", () => ({
	default: () => <div data-testid="mock-crew-state" />,
}))
vi.mock("@/routes/helpers", () => ({ defaultClusterCode: "cluster-default-mock" }))

describe("CrewConversationPage explicit layout", () => {
	beforeEach(() => {
		useIsMobileMock.mockClear()
	})

	it("renders the configured layout without subscribing to viewport changes", async () => {
		render(<CrewConversationPage />)

		expect(await screen.findByTestId("mock-crew-desktop")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-crew-mobile")).not.toBeInTheDocument()
		expect(useIsMobileMock).not.toHaveBeenCalled()
	})
})
