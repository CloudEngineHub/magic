import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ProjectTypeTag from "../ProjectTypeTag"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("ProjectTypeTag", () => {
	it("renders the AI research tag for persona_research projects", () => {
		render(<ProjectTypeTag projectMode="persona_research" />)

		expect(screen.getByTestId("project-type-tag").getAttribute("aria-label")).toBe(
			"projectTypeTag.personaResearch",
		)
	})

	it("renders nothing for ordinary projects", () => {
		render(<ProjectTypeTag projectMode="general" />)

		expect(screen.queryByTestId("project-type-tag")).toBeNull()
	})
})
