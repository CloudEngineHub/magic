import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ProjectTypeTag from "../ProjectTypeTag"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("ProjectTypeTag", () => {
	it("marks AI canvas projects like the other special project modes", () => {
		render(<ProjectTypeTag projectMode="ai-canvas" />)
		expect(screen.getByTestId("project-type-tag")).toHaveAttribute(
			"aria-label",
			"projectTypeTag.aiCanvas",
		)
	})

	it("renders at the requested size (14px in recent lists)", () => {
		render(<ProjectTypeTag projectMode="ai-canvas" size={14} />)
		const tag = screen.getByTestId("project-type-tag")
		expect(tag.style.width).toBe("14px")
		expect(tag.querySelector("svg")).toHaveAttribute("width", "14")
	})

	it("keeps one line weight for icons drawn on different grids", () => {
		render(<ProjectTypeTag projectMode="magiclaw" size={14} uniformStroke />)
		// The claw is drawn on a 16-unit grid: 1.8 on 24 units equals 1.2 on 16 units.
		expect(screen.getByTestId("project-type-tag").querySelector("path")).toHaveAttribute(
			"stroke-width",
			"1.2",
		)
	})

	it("keeps the plain stroke outside recent lists", () => {
		render(<ProjectTypeTag projectMode="magiclaw" />)
		expect(screen.getByTestId("project-type-tag").querySelector("path")).toHaveAttribute(
			"stroke-width",
			"1.8",
		)
	})

	it("shows nothing for ordinary projects", () => {
		const { container } = render(<ProjectTypeTag projectMode="general" />)
		expect(container).toBeEmptyDOMElement()
	})
})
