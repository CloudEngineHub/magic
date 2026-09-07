import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GapTick } from "../GapTick"

describe("GapTick", () => {
	it("renders a vertical hairline for the column axis", () => {
		render(<GapTick axis="column" />)
		expect(document.querySelector("[data-gap-tick='column']")).toBeTruthy()
		expect(document.querySelector("[data-gap-tick='column'] svg")).toBeNull()
	})
})
