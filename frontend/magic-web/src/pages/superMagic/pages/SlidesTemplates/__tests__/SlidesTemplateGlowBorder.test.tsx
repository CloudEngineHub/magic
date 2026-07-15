import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import SlidesTemplateGlowBorder from "../SlidesTemplateGlowBorder"

describe("SlidesTemplateGlowBorder", () => {
	it("keeps the emphasized frame equally inset on all four sides", () => {
		render(<SlidesTemplateGlowBorder emphasized />)

		const glowBorder = screen.getByTestId("slides-template-glow-border")
		const frames = glowBorder.querySelectorAll("rect")

		expect(frames).toHaveLength(3)
		frames.forEach((frame) => {
			expect(frame).toHaveAttribute("x", "2.5")
			expect(frame).toHaveAttribute("y", "2.5")
			expect(frame).toHaveAttribute("width", "calc(100% - 5px)")
			expect(frame).toHaveAttribute("height", "calc(100% - 5px)")
		})
	})
})
