import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ToolIconBadge from "../ToolIconBadge"

describe("ToolIconBadge fallback icon", () => {
	it("renders visible fallback paths without shared clip-path ids", () => {
		const { container } = render(
			<>
				<ToolIconBadge toolName="unknown_tool_a" />
				<ToolIconBadge toolName="unknown_tool_b" />
			</>,
		)

		const svgs = Array.from(container.querySelectorAll("svg"))
		expect(svgs).toHaveLength(2)
		expect(container.querySelectorAll("[id]")).toHaveLength(0)
		expect(container.querySelectorAll("[clip-path]")).toHaveLength(0)
		expect(svgs.every((svg) => svg.querySelectorAll('path[fill="white"]').length > 0)).toBe(
			true,
		)
	})
})
