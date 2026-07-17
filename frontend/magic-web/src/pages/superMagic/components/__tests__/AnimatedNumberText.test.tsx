import { render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { AnimatedNumberText } from "../AnimatedNumberText"

const motionMock = vi.hoisted(() => ({
	prefersReducedMotion: false,
}))

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
	useReducedMotion: () => motionMock.prefersReducedMotion,
	motion: {
		span: ({
			children,
			initial: _initial,
			animate: _animate,
			exit: _exit,
			transition: _transition,
			...props
		}: ComponentProps<"span"> & {
			initial?: unknown
			animate?: unknown
			exit?: unknown
			transition?: unknown
		}) => {
			void _initial
			void _animate
			void _exit
			void _transition
			return <span {...props}>{children}</span>
		},
	},
}))

describe("AnimatedNumberText", () => {
	it("renders the first formatted value without losing any digits", () => {
		const { container } = render(<AnimatedNumberText value={7293} />)

		expect(container).toHaveTextContent("7,293")
		expect(container.querySelectorAll("[class*='perspective']")).toHaveLength(5)
	})

	it("keeps the complete centered number after an update", () => {
		const { container, rerender } = render(<AnimatedNumberText value={5432} isEmphasized />)

		rerender(<AnimatedNumberText value={5433} isEmphasized />)

		expect(container).toHaveTextContent("5,433")
		expect(container.firstElementChild).toHaveClass("origin-center")
		expect(screen.getAllByText("3")).toHaveLength(2)
	})

	it("shows the final value directly when reduced motion is enabled", () => {
		motionMock.prefersReducedMotion = true

		const { container, rerender } = render(<AnimatedNumberText value={100} isEmphasized />)
		rerender(<AnimatedNumberText value={200} isEmphasized />)

		expect(container).toHaveTextContent("200")
		expect(container.querySelectorAll("[class*='perspective']")).toHaveLength(3)

		motionMock.prefersReducedMotion = false
	})
})
