import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import DropIndicator from "../DropIndicator"

describe("DropIndicator", () => {
	it("renders a single visible primary line without a secondary primary rail", () => {
		const { container } = render(<DropIndicator position="top" />)
		const elements = Array.from(container.querySelectorAll("div"))
		const classNames = elements.map((element) => element.className)

		expect(classNames.some((className) => className.includes("bg-primary/20"))).toBe(false)
		expect(classNames.filter((className) => className.includes("bg-primary"))).toHaveLength(1)
	})
})
