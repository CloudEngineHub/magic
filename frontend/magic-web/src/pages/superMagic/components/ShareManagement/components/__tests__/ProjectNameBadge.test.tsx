import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ProjectNameBadge from "../ProjectNameBadge"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: { switchProjectById: vi.fn() },
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: { selectedProject: null },
}))

describe("ProjectNameBadge", () => {
	it("truncates long project names without forcing the row to overflow", () => {
		const projectName = "A very long shared project name that must stay within the dialog row"

		render(<ProjectNameBadge projectId="project-1" projectName={projectName} />)

		const name = screen.getByText(projectName)
		const badge = name.closest('[data-slot="badge"]')

		expect(name).toHaveClass("truncate")
		expect(name).toHaveAttribute("title", projectName)
		expect(badge).toHaveClass("min-w-0", "max-w-[200px]", "shrink")
		expect(badge).not.toHaveClass("shrink-0")
	})
})
