import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepIndicator from "../components/SelfMediaInitPanel/steps/StepIndicator"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("StepIndicator visual chrome", () => {
	it("uses translucent state layers instead of hard dividers", () => {
		render(<StepIndicator currentStep={0} onNavigate={vi.fn()} />)

		const header = screen.getByTestId("self-media-init-panel-header")

		expect(header).not.toHaveClass("border-b")
		expect(header).toHaveClass("bg-background/80")
		expect(screen.getByTestId("self-media-init-panel-progress-track")).toHaveClass(
			"bg-[#434c81]/[0.08]",
		)

		const [activeIcon, idleIcon] = screen.getAllByTestId("self-media-init-panel-step-icon")

		expect(activeIcon).not.toHaveClass("border")
		expect(activeIcon).toHaveClass("bg-[#434c81]/[0.13]")
		expect(activeIcon).toHaveClass("text-[#38426f]")
		expect(activeIcon).toHaveClass("transition-transform")
		expect(activeIcon).toHaveClass("group-hover/step:-translate-y-0.5")
		expect(idleIcon).toHaveClass("bg-muted/45")
	})
})
