import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { MobileShellSidebarToggleButton } from "../MobileShellSidebarToggleButton"

const shellOutletMock = {
	isSidebarOpen: false,
	openSidebar: vi.fn(),
	closeSidebar: vi.fn(),
}

vi.mock("../SuperMobileShellRouteLayout", () => ({
	useOptionalSuperMobileShellOutlet: () => shellOutletMock,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (key === "mobile.shell.menuAria") return "打开菜单"
			if (key === "mobile.shell.closeSidebar") return "关闭侧栏"
			return key
		},
	}),
}))

describe("MobileShellSidebarToggleButton", () => {
	beforeEach(() => {
		shellOutletMock.isSidebarOpen = false
		shellOutletMock.openSidebar.mockReset()
		shellOutletMock.closeSidebar.mockReset()
	})

	it("opens the sidebar and shows the close affordance when the drawer is open", () => {
		const { rerender } = render(<MobileShellSidebarToggleButton />)

		const toggle = screen.getByTestId("mobile-shell-menu-button")
		expect(toggle).toHaveAttribute("aria-label", "打开菜单")

		fireEvent.click(toggle)
		expect(shellOutletMock.openSidebar).toHaveBeenCalledTimes(1)

		shellOutletMock.isSidebarOpen = true
		rerender(<MobileShellSidebarToggleButton />)

		expect(screen.getByTestId("mobile-shell-menu-button")).toHaveAttribute(
			"aria-label",
			"关闭侧栏",
		)
	})

	it("closes the sidebar when the drawer is already open", () => {
		shellOutletMock.isSidebarOpen = true

		render(<MobileShellSidebarToggleButton />)

		fireEvent.click(screen.getByTestId("mobile-shell-menu-button"))

		expect(shellOutletMock.closeSidebar).toHaveBeenCalledTimes(1)
		expect(shellOutletMock.openSidebar).not.toHaveBeenCalled()
	})

	it("allows explicit test id override for rare custom selectors", () => {
		render(<MobileShellSidebarToggleButton testId="shell-menu-toggle" />)

		expect(screen.getByTestId("shell-menu-toggle")).toHaveAttribute("aria-label", "打开菜单")
	})
})
