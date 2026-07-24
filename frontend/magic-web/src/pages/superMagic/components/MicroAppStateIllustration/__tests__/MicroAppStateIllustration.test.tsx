import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MicroAppBuildingIllustration, MicroAppStateIllustration } from "../index"

describe("MicroAppStateIllustration", () => {
	it.each([
		"empty",
		"building",
		"confirm",
		"search-empty",
		"retry",
		"permission",
		"published",
		"database-empty",
	] as const)("renders the %s scene", (state) => {
		render(<MicroAppStateIllustration state={state} animated={false} />)

		expect(screen.getByTestId(`micro-app-state-${state}`)).toHaveAttribute("data-state", state)
	})

	it("supports an accessible label for meaningful illustrations", () => {
		render(<MicroAppBuildingIllustration label="正在制作微应用" animated={false} />)

		expect(screen.getByRole("img", { name: "正在制作微应用" })).toBeInTheDocument()
	})

	it("keeps the building progress chart continuously visible while animated", () => {
		render(<MicroAppBuildingIllustration animated />)
		const chart = screen.getByTestId("micro-app-building-progress-chart")
		const progressLine = screen.getByTestId("micro-app-building-progress-line")
		const progressHighlight = screen.getByTestId("micro-app-building-progress-highlight")

		expect(chart).toHaveAttribute("width", "144")
		expect(progressLine).toBeInTheDocument()
		expect(progressHighlight).toHaveAttribute("stroke-dasharray", "0.22 0.78")
	})
})
