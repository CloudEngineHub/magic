import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MicroAppHeroTitle from "../MicroAppHeroTitle"

const mocks = vi.hoisted(() => ({
	translations: {} as Record<string, string>,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => mocks.translations[key] ?? key,
	}),
}))

describe("MicroAppHeroTitle", () => {
	beforeEach(() => {
		mocks.translations = {
			"microAppsPage.heroTitle": "一句话，做出好用的微应用",
			"microAppsPage.heroTitlePrefix": "一句话，",
			"microAppsPage.heroTitleBetween": "做出好用的",
			"microAppsPage.heroTitleProduct": "微应用",
			"microAppsPage.heroTitleProductHint": "Micro App",
		}
	})

	it("uses the Chinese product name and keeps the English hint", () => {
		render(<MicroAppHeroTitle />)

		const heading = screen.getByRole("heading", { name: "一句话，做出好用的微应用" })
		expect(within(heading).getByText("微应用")).toBeInTheDocument()
		expect(within(heading).getByText("Micro App")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-hero-cable-anchor")).toHaveTextContent("，")
	})

	it("adds natural spacing between English title fragments", () => {
		mocks.translations = {
			"microAppsPage.heroTitle": "Turn a single prompt into a ready-to-use Micro App",
			"microAppsPage.heroTitlePrefix": "Turn a single prompt",
			"microAppsPage.heroTitleBetween": "into a ready-to-use",
			"microAppsPage.heroTitleProduct": "Micro App",
			"microAppsPage.heroTitleProductHint": "",
		}

		render(<MicroAppHeroTitle />)

		expect(
			screen.getByRole("heading", {
				name: "Turn a single prompt into a ready-to-use Micro App",
			}),
		).toHaveTextContent("Turn a single prompt into a ready-to-use Micro App")
		expect(screen.queryByTestId("micro-app-hero-cable-anchor")).not.toBeInTheDocument()
	})
})
