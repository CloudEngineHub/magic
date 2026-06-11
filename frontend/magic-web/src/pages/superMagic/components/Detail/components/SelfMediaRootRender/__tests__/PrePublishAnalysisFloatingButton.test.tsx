import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PrePublishAnalysisFloatingButton } from "../components/PrePublishAnalysisFloatingButton"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

describe("PrePublishAnalysisFloatingButton", () => {
	it("renders a prominent pre-publish analysis action", () => {
		const onClick = vi.fn()

		render(<PrePublishAnalysisFloatingButton onClick={onClick} />)

		const button = screen.getByTestId("self-media-floating-pre-publish-analysis")
		expect(button).toHaveTextContent("detail.selfMedia.analysis.action")

		fireEvent.click(button)
		expect(onClick).toHaveBeenCalledTimes(1)
	})
})
