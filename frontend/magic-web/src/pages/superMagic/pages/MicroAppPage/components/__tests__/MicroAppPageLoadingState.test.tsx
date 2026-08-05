import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppPageLoadingState from "../MicroAppPageLoadingState"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("MicroAppPageLoadingState", () => {
	it("shows the micro app loading illustration and context", () => {
		render(<MicroAppPageLoadingState testId="route-loading" />)

		expect(screen.getByTestId("route-loading-illustration")).toHaveAttribute(
			"data-state",
			"loading",
		)
		expect(screen.getByText("microAppPage.loading.title")).toBeInTheDocument()
		expect(screen.getByText("microAppPage.loading.description")).toBeInTheDocument()
	})

	it("uses the mobile composition", () => {
		render(<MicroAppPageLoadingState mobile />)

		expect(screen.getByTestId("micro-app-page-loading")).toHaveAttribute("data-mobile", "true")
	})
})
