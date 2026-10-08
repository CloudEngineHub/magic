import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MagicDropdownDesktop from "@/components/base/MagicDropdown/MagicDropdownDesktop"
import { TopicHistoryTrigger } from "../TopicHistoryTrigger"

vi.mock("@/components/base", async () => {
	const { default: MagicTooltip } = await import("@/components/base/MagicTooltip")
	return { MagicTooltip }
})

describe("TopicHistoryTrigger", () => {
	it("forwards dropdown trigger events when the tooltip is enabled", () => {
		const handleOpenChange = vi.fn()
		render(
			<TopicHistoryTrigger
				mode="dropdown"
				isActive={false}
				tooltipTitle="History topics"
				renderDropdown={(trigger) => (
					<MagicDropdownDesktop
						trigger={["click"]}
						onOpenChange={handleOpenChange}
						popupRender={() => <div>History</div>}
					>
						{trigger}
					</MagicDropdownDesktop>
				)}
			/>,
		)

		const button = screen.getByTestId("message-header-history-button")
		expect(button).toHaveAttribute("data-slot", "dropdown-menu-trigger")

		fireEvent.keyDown(button, { key: "Enter", code: "Enter" })
		expect(handleOpenChange).toHaveBeenCalledWith(true)
	})
})
