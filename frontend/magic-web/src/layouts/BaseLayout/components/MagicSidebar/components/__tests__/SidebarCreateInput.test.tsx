import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SidebarCreateInput from "../SidebarCreateInput"

const { mockShouldSuppressAutoFocus } = vi.hoisted(() => ({
	mockShouldSuppressAutoFocus: vi.fn(),
}))

vi.mock("@/utils/inputFocusPolicy", () => ({
	shouldSuppressInputAutoFocusInMagicApp: mockShouldSuppressAutoFocus,
}))

/**
 * Render the sidebar creation input with stable fake handlers for focus-policy assertions.
 */
function renderSidebarCreateInput() {
	return render(
		<SidebarCreateInput
			value=""
			placeholder="Create workspace"
			inputTestId="sidebar-create-input"
			submitButtonTestId="sidebar-create-submit"
			cancelButtonTestId="sidebar-create-cancel"
			submitButtonAriaLabel="Confirm"
			cancelButtonAriaLabel="Cancel"
			onValueChange={vi.fn()}
			onSubmit={vi.fn()}
			onCancel={vi.fn()}
		/>,
	)
}

describe("SidebarCreateInput auto focus policy", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		mockShouldSuppressAutoFocus.mockReset()
		mockShouldSuppressAutoFocus.mockReturnValue(false)
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	it("keeps desktop browser auto focus and selection", () => {
		renderSidebarCreateInput()

		const input = screen.getByTestId("sidebar-create-input")

		act(() => {
			vi.advanceTimersByTime(50)
		})

		expect(document.activeElement).toBe(input)
	})

	it("suppresses programmatic focus inside Magic App WebView", () => {
		mockShouldSuppressAutoFocus.mockReturnValue(true)

		renderSidebarCreateInput()

		const input = screen.getByTestId("sidebar-create-input")

		act(() => {
			vi.advanceTimersByTime(50)
		})

		expect(document.activeElement).not.toBe(input)
	})
})
