import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ModeItem } from "@/pages/superMagic/pages/Workspace/types"
import PptModeSwitcherCard from "../PptModeSwitcherCard"

vi.mock("react-i18next", () => ({
	Trans: ({ values }: { values: { count: string } }) => <>{values.count}</>,
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../../../ModeAvatar", () => ({
	default: () => <span data-testid="mode-avatar" />,
}))

const useSlidesTemplateStatisticsMock = vi.hoisted(() => vi.fn())

vi.mock("@/pages/superMagic/hooks/useSlidesTemplateTotal", () => ({
	useSlidesTemplateStatistics: useSlidesTemplateStatisticsMock,
}))

const modeItem = {
	mode: {
		name: "PPT 制作专家",
		identifier: "ppt",
		icon_url: "",
	},
} as ModeItem

describe("PptModeSwitcherCard", () => {
	beforeEach(() => {
		useSlidesTemplateStatisticsMock.mockReturnValue({
			templateTotal: 101582,
			templateTotalUsageCount: 7293,
		})
	})

	it("keeps a fixed pill height while the preview expands above it", () => {
		const { rerender } = render(
			<PptModeSwitcherCard modeItem={modeItem} isSelected={false} onSelect={vi.fn()} />,
		)

		const card = screen.getByTestId("ppt-mode-switcher-card")
		expect(card).toHaveClass("h-10")
		expect(card).not.toHaveClass("h-[76px]")
		expect(screen.getByTestId("ppt-mode-switcher-preview")).toHaveClass(
			"bottom-9",
			"scale-[0.78]",
			"opacity-70",
		)

		rerender(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(card).toHaveClass("h-10")
		expect(card).not.toHaveClass("h-[76px]")
		expect(screen.getByTestId("ppt-mode-switcher-trigger")).toHaveClass(
			"h-10",
			"rounded-full",
			"p-[3px]",
			"shadow-none",
		)
	})

	it("does not change layout height on hover", () => {
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected={false} onSelect={vi.fn()} />)

		const trigger = screen.getByTestId("ppt-mode-switcher-trigger")
		fireEvent.mouseEnter(trigger)

		expect(screen.getByTestId("ppt-mode-switcher-card")).toHaveClass("h-10")
		expect(screen.getByTestId("ppt-mode-switcher-preview")).toHaveClass(
			"translate-y-0.5",
			"scale-100",
			"opacity-100",
		)
	})

	it("renders the template cumulative usage count as the delivered count", () => {
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(screen.getByTestId("ppt-mode-switcher-delivered-count")).toHaveTextContent(
			"7,293",
		)
	})

	it("does not render the delivered count before the backend returns the new field", () => {
		useSlidesTemplateStatisticsMock.mockReturnValue({ templateTotal: 101582 })
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(screen.queryByTestId("ppt-mode-switcher-delivered-count")).not.toBeInTheDocument()
	})
})
