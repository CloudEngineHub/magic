import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MobileComposerHeader from "../MobileComposerHeader"

vi.mock("@/pages/superMagic/components/MainInputContainer/stores", () => ({
	sceneStateStore: {
		currentScene: null,
		setCurrentScene: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/components/SelectedSkillBadge", () => ({
	default: () => <div data-testid="selected-scene" />,
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/components/SceneSwitcher", () => ({
	default: () => <div data-testid="scene-switcher" />,
}))

vi.mock("../MobileComposerModeSelector", () => ({
	default: ({ selectorVariant }: { selectorVariant?: string }) => (
		<div data-testid="mobile-mode-selector" data-selector-variant={selectorVariant} />
	),
}))

describe("MobileComposerHeader", () => {
	it("shows the default mobile mode selector", () => {
		render(<MobileComposerHeader />)

		expect(screen.getByTestId("mobile-mode-selector")).toBeInTheDocument()
	})

	it("hides only the mode selector while preserving scene controls", () => {
		render(
			<MobileComposerHeader showModeSelector={false} scenes={[{ id: "scene-1" }] as never} />,
		)

		expect(screen.queryByTestId("mobile-mode-selector")).toBeNull()
		expect(screen.getByTestId("scene-switcher")).toBeInTheDocument()
	})

	it("can show the model selector without the employee selector", () => {
		render(<MobileComposerHeader showModeSelector={false} showModelSelector />)

		expect(screen.getByTestId("mobile-mode-selector")).toHaveAttribute(
			"data-selector-variant",
			"claw",
		)
	})
})
