import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PropsWithChildren } from "react"
import AIEditButton from "../AIEditButton"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/hooks/useHTMLGuideTour", () => ({
	HTMLGuideTourElementId: { AIOptimizationButton: "ai-edit-button" },
}))

vi.mock("../ConditionalTooltip", () => ({
	default: ({ children }: PropsWithChildren) => children,
}))

vi.mock("@/pages/superMagic/components/Detail/components/PPTRender/hooks/useAIEdit", () => ({
	useAIEdit: () => ({
		aiEditItems: [
			{
				key: "factCheck",
				label: "factCheck",
				description: "factCheckDescription",
				icon: null,
				onClick: vi.fn(),
			},
			{
				key: "contentTranslation",
				label: "contentTranslation",
				description: "contentTranslationDescription",
				icon: null,
				onClick: vi.fn(),
			},
			{
				key: "dataCorrection",
				label: "dataCorrection",
				description: "dataCorrectionDescription",
				icon: null,
				onClick: vi.fn(),
			},
			{
				key: "layoutCorrection",
				label: "layoutCorrection",
				description: "layoutCorrectionDescription",
				icon: null,
				onClick: vi.fn(),
			},
		],
	}),
}))

describe("AIEditButton", () => {
	it("runs the primary action from the main button and opens the menu from the arrow", async () => {
		const onPrimaryAction = vi.fn()
		render(<AIEditButton showButtonText maxItems={3} onPrimaryAction={onPrimaryAction} />)

		const [primaryButton, menuButton] = screen.getAllByRole("button", {
			name: "topicFiles.AIOptimization",
		})

		fireEvent.click(primaryButton)
		expect(onPrimaryAction).toHaveBeenCalledTimes(1)
		expect(screen.queryByText("factCheck")).not.toBeInTheDocument()

		fireEvent.keyDown(menuButton, { key: "Enter" })
		const menuItem = await screen.findByText("factCheck")
		expect(menuItem).toBeInTheDocument()
		expect(menuItem.closest('[data-slot="dropdown-menu-content"]')).toHaveAttribute(
			"data-align",
			"end",
		)
		expect(screen.getByText("contentTranslation")).toBeInTheDocument()
		expect(screen.getByText("dataCorrection")).toBeInTheDocument()
		expect(screen.queryByText("layoutCorrection")).not.toBeInTheDocument()
	})
})
