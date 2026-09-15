import { Suspense } from "react"
import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BaseLayoutShell } from "../BaseLayout"

const { useIsMobileMock, widgetContextMock } = vi.hoisted(() => ({
	useIsMobileMock: vi.fn(() => false),
	widgetContextMock: {
		current: {
			embedContext: null,
			config: {},
		} as {
			embedContext: { instanceId: string; hostOrigin: string } | null
			config: { layout?: "desktop" | "mobile" }
		},
	},
}))

vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: useIsMobileMock }))
vi.mock("@/providers/MagicWidgetProvider", () => ({
	MagicWidgetProvider: ({ children }: { children: ReactNode }) => children,
	useMagicWidgetConfig: () => widgetContextMock.current,
}))
vi.mock("../BaseLayoutPc", () => ({
	default: () => <div data-testid="mock-desktop-shell" />,
}))
vi.mock("@/layouts/BaseLayoutMobile", () => ({
	default: () => <div data-testid="mock-mobile-shell" />,
}))
vi.mock("@/stores/recordingSummary", () => ({
	__esModule: true,
	default: { isFloatPanelLoaded: false, isVisible: false },
}))
vi.mock("../components/Sketch", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-layout-sketch" />,
}))

/** Renders the lazy shell selector with a stable loading boundary. */
function renderShell() {
	return render(
		<Suspense fallback={<div data-testid="mock-shell-loading" />}>
			<BaseLayoutShell />
		</Suspense>,
	)
}

describe("BaseLayoutShell", () => {
	beforeEach(() => {
		useIsMobileMock.mockClear()
		useIsMobileMock.mockReturnValue(false)
		widgetContextMock.current = { embedContext: null, config: {} }
	})

	it("does not subscribe to viewport changes when Widget pins desktop layout", async () => {
		widgetContextMock.current = {
			embedContext: {
				instanceId: "widget-mock-desktop-shell",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { layout: "desktop" },
		}

		renderShell()

		expect(await screen.findByTestId("mock-desktop-shell")).toBeInTheDocument()
		expect(useIsMobileMock).not.toHaveBeenCalled()
	})

	it("does not subscribe to viewport changes when Widget pins mobile layout", async () => {
		widgetContextMock.current = {
			embedContext: {
				instanceId: "widget-mock-mobile-shell",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { layout: "mobile" },
		}

		renderShell()

		expect(await screen.findByTestId("mock-mobile-shell")).toBeInTheDocument()
		expect(useIsMobileMock).not.toHaveBeenCalled()
	})

	it("keeps viewport detection for pages without an explicit Widget layout", async () => {
		useIsMobileMock.mockReturnValue(true)

		renderShell()

		expect(await screen.findByTestId("mock-mobile-shell")).toBeInTheDocument()
		expect(useIsMobileMock).toHaveBeenCalled()
	})
})
