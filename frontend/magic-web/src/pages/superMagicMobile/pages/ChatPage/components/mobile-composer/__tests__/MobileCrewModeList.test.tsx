import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CrewItem } from "@/pages/superMagic/pages/Workspace/types"
import MobileCrewModeList from "../MobileCrewModeList"

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "modeToggle.hiddenCrew" ? "Hidden Crew" : key),
	}),
}))

vi.mock("@/pages/superMagic/components/ModeAvatar", () => ({
	default: ({ mode }: { mode: { identifier: string } }) => (
		<div data-testid={`mode-avatar-${mode.identifier}`} />
	),
}))

vi.mock("@/pages/superMagicMobile/components/DataEmptyState", () => ({
	DataEmptyState: () => <div data-testid="crew-empty-state" />,
}))

function createCrew(identifier: string, isVisible: boolean): CrewItem {
	return {
		agent: { is_visible: isVisible },
		mode: {
			identifier,
			name: identifier,
		},
	} as CrewItem
}

describe("MobileCrewModeList", () => {
	const visibleCrew = createCrew("visible-mode", true)
	const hiddenCrew = createCrew("hidden-mode", false)
	const scrollToMock = vi.fn()
	const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")

	beforeEach(() => {
		vi.useFakeTimers()
		scrollToMock.mockReset()
		Object.defineProperty(HTMLElement.prototype, "scrollTo", {
			configurable: true,
			value: scrollToMock,
		})
	})

	afterEach(() => {
		vi.useRealTimers()
		if (originalScrollTo) {
			Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo)
		} else {
			Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
		}
	})

	it("keeps visible and hidden crews in independent scroll areas", () => {
		const onSelectCrew = vi.fn()
		render(
			<MobileCrewModeList
				open
				modes={[visibleCrew, hiddenCrew]}
				selectedModeIdentifier="visible-mode"
				onSelectCrew={onSelectCrew}
			/>,
		)

		const visibleList = screen.getByTestId("mobile-composer-mode-selector-list")
		const hiddenSection = screen.getByTestId("mobile-composer-mode-selector-hidden-section")
		const hiddenTrigger = screen.getByTestId("mobile-composer-mode-selector-hidden-trigger")

		expect(visibleList).not.toContainElement(hiddenSection)
		expect(hiddenTrigger).toHaveAttribute("aria-expanded", "false")
		expect(screen.queryByTestId("mobile-composer-mode-selector-hidden-list")).toBeNull()

		fireEvent.click(hiddenTrigger)

		const hiddenList = screen.getByTestId("mobile-composer-mode-selector-hidden-list")
		expect(hiddenList).toHaveClass("max-h-[156px]", "overflow-y-auto", "scrollbar-y-thin")
		expect(visibleList).not.toContainElement(hiddenList)

		fireEvent.click(screen.getByRole("button", { name: "hidden-mode" }))
		expect(onSelectCrew).toHaveBeenCalledWith(hiddenCrew)
	})

	it("does not render the hidden section when there is no hidden crew", () => {
		render(
			<MobileCrewModeList
				open
				modes={[visibleCrew]}
				selectedModeIdentifier="visible-mode"
				onSelectCrew={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId("mobile-composer-mode-selector-hidden-section")).toBeNull()
	})

	it("keeps the hidden section available when every crew is hidden", () => {
		render(
			<MobileCrewModeList
				open
				modes={[hiddenCrew]}
				selectedModeIdentifier={null}
				onSelectCrew={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId("crew-empty-state")).toBeNull()
		fireEvent.click(screen.getByTestId("mobile-composer-mode-selector-hidden-trigger"))
		expect(screen.getByRole("button", { name: "hidden-mode" })).toBeInTheDocument()
	})

	it("automatically expands and scrolls to the selected hidden crew", () => {
		render(
			<MobileCrewModeList
				open
				modes={[visibleCrew, hiddenCrew]}
				selectedModeIdentifier="hidden-mode"
				onSelectCrew={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-composer-mode-selector-hidden-trigger")).toHaveAttribute(
			"aria-expanded",
			"true",
		)
		expect(screen.getByTestId("mobile-composer-mode-selector-hidden-list")).toBeInTheDocument()

		act(() => {
			vi.runAllTimers()
		})

		expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
	})

	it("does not reset the visible list scroll position when hidden crews are expanded", () => {
		render(
			<MobileCrewModeList
				open
				modes={[visibleCrew, hiddenCrew]}
				selectedModeIdentifier="visible-mode"
				onSelectCrew={vi.fn()}
			/>,
		)

		act(() => {
			vi.runAllTimers()
		})

		const visibleList = screen.getByTestId("mobile-composer-mode-selector-list")
		visibleList.scrollTop = 120
		scrollToMock.mockClear()

		fireEvent.click(screen.getByTestId("mobile-composer-mode-selector-hidden-trigger"))

		expect(visibleList.scrollTop).toBe(120)
		expect(scrollToMock).not.toHaveBeenCalled()
	})
})
