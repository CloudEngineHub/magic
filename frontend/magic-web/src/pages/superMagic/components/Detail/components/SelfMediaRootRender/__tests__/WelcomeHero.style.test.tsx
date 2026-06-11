import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
	}),
}))

import { WelcomeHero } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/WelcomeHero"

describe("WelcomeHero style", () => {
	it("uses translucent layered surfaces without hard feature borders", () => {
		render(<WelcomeHero />)

		const hero = screen.getByTestId("self-media-welcome-hero")

		expect(hero).toHaveClass("rounded-lg")
		expect(hero).toHaveClass("bg-[#434c81]/[0.055]")
		expect(hero.querySelector("[data-testid='self-media-welcome-sketch-grid']")).toBeNull()
		expect(screen.getAllByTestId("self-media-welcome-feature")).toHaveLength(3)
		for (const feature of screen.getAllByTestId("self-media-welcome-feature")) {
			expect(feature).toHaveClass("rounded-lg")
			expect(feature).toHaveClass("bg-background/65")
			expect(feature).toHaveClass("transition-transform")
			expect(feature).toHaveClass("hover:-translate-y-0.5")
			expect(feature).not.toHaveClass("border-l-2")
		}
		expect(screen.getByTestId("self-media-welcome-preview")).toHaveClass("bg-background/55")
		expect(screen.getByTestId("self-media-welcome-preview")).toHaveClass(
			"hover:-translate-y-0.5",
		)
		expect(screen.getByTestId("self-media-welcome-badge")).toHaveClass("text-[#3c456f]")
	})
})
