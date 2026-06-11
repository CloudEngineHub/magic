import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepNavigation from "../components/SelfMediaInitPanel/steps/StepNavigation"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("StepNavigation visual chrome", () => {
	it("uses safe-area aware mobile padding and shadcn buttons", () => {
		render(
			<StepNavigation
				currentStep={0}
				canProceed
				hasAnyInitData
				onNext={vi.fn()}
				onPrev={vi.fn()}
				onClear={vi.fn()}
				onNavigate={vi.fn()}
				onBackHome={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("self-media-init-panel-footer").className).toContain(
			"pb-[max(var(--safe-area-inset-bottom),1rem)]",
		)
		expect(screen.getByTestId("self-media-init-panel-footer")).not.toHaveClass("border-t")
		expect(screen.getByTestId("self-media-init-panel-footer")).toHaveClass("bg-background/80")
		expect(screen.getByTestId("self-media-init-panel-back-home-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
		expect(screen.getByTestId("self-media-init-panel-clear-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
	})
})
