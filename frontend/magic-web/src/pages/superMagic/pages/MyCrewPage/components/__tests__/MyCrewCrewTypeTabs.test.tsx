import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MyCrewCrewTypeTabs from "../MyCrewCrewTypeTabs"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("MyCrewCrewTypeTabs", () => {
	it("renders only created and hired tabs", () => {
		const onChange = vi.fn()

		render(<MyCrewCrewTypeTabs value="created" onChange={onChange} />)

		expect(screen.getByTestId("my-crew-tab-created")).toHaveTextContent(
			"myCrewPage.crewType.createdByMe",
		)
		expect(screen.getByTestId("my-crew-tab-hired")).toHaveTextContent(
			"myCrewPage.crewType.hiredByMe",
		)
		expect(screen.queryByTestId("my-crew-tab-team-shared")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("my-crew-tab-hired"))

		expect(onChange).toHaveBeenCalledWith("hired")
	})

	it("marks the selected tab", () => {
		render(<MyCrewCrewTypeTabs value="hired" onChange={vi.fn()} />)

		expect(screen.getByTestId("my-crew-tab-created")).toHaveAttribute("aria-selected", "false")
		expect(screen.getByTestId("my-crew-tab-hired")).toHaveAttribute("aria-selected", "true")
	})
})
