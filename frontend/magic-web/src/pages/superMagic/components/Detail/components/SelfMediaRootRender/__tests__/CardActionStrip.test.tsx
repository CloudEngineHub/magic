import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CardActionStrip } from "../components/CardActionStrip"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children, side }: { children: React.ReactNode; side?: string }) => (
		<div data-side={side}>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../components/CardVersionHistoryButton", () => ({
	CardVersionHistoryButton: ({ className }: { className?: string }) => (
		<button type="button" className={className} data-testid="mock-version-history" />
	),
}))

describe("CardActionStrip", () => {
	it("uses the refreshed self-media floating tool style", () => {
		render(
			<CardActionStrip
				testId="card-actions"
				onAddToCurrentChat={vi.fn()}
				onGoToEdit={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		)

		const strip = screen.getByTestId("card-actions")
		expect(strip).toHaveClass(
			"rounded-[18px]",
			"border-white/80",
			"bg-white/85",
			"backdrop-blur-xl",
		)

		const addButton = screen.getByTestId("card-action-add-current")
		expect(addButton).toHaveClass(
			"h-9",
			"w-9",
			"rounded-[14px]",
			"hover:bg-[#18181b]",
			"hover:text-[#ffd637]",
		)
	})

	it("keeps article-specific tooltip copy while reusing the shared strip", () => {
		const onRefresh = vi.fn()
		render(
			<CardActionStrip
				testId="wechat-article-floating-actions"
				testIdPrefix="wechat-article-action"
				tooltipSide="left"
				onRefresh={onRefresh}
				labels={{ refresh: "刷新文章" }}
			/>,
		)

		expect(screen.getByTestId("wechat-article-floating-actions")).toBeInTheDocument()
		expect(screen.getByText("刷新文章")).toHaveAttribute("data-side", "left")

		fireEvent.click(screen.getByTestId("wechat-article-action-refresh"))
		expect(onRefresh).toHaveBeenCalledTimes(1)
	})
})
