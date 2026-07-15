import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import MagicDropdownMobile from "../MagicDropdownMobile"

vi.mock("@/components/shadcn-composed/action-drawer", () => ({
	ActionDrawer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	ActionGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	ActionItem: ({
		label,
		"data-testid": dataTestId,
	}: {
		label?: ReactNode
		"data-testid"?: string
	}) => <button data-testid={dataTestId}>{label}</button>,
}))

describe("MagicDropdownMobile", () => {
	it("forwards menu item test ids to the actionable drawer item", () => {
		render(
			<MagicDropdownMobile
				open
				menu={{
					items: [
						{
							key: "report",
							label: "Report",
							"data-testid": "round-report-menu-item",
						},
					],
				}}
			>
				<button type="button">Open</button>
			</MagicDropdownMobile>,
		)

		expect(screen.getByTestId("round-report-menu-item")).toHaveTextContent("Report")
	})
})
