import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HTMLAttributes, ReactNode } from "react"
import {
	getSlidesTemplateBadgeTargetWidth,
	shouldUseCompactSlidesTemplateBadge,
	SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL,
	SlidesTemplateCountBadge,
} from "../SlidesTemplateCountBadge"

const reducedMotionMock = vi.hoisted(() => ({ value: false }))

interface MotionSpanMockProps extends HTMLAttributes<HTMLSpanElement> {
	animate?: unknown
	custom?: unknown
	exit?: unknown
	initial?: unknown
	transition?: { duration?: number }
	variants?: unknown
}

vi.mock("framer-motion", async () => {
	const { forwardRef } = await import("react")

	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => children,
		motion: {
			span: forwardRef<HTMLSpanElement, MotionSpanMockProps>(
				(
					{
						animate: _animate,
						custom: _custom,
						exit: _exit,
						initial: _initial,
						transition,
						variants: _variants,
						...props
					},
					ref,
				) => {
					const motionWidth =
						typeof _animate === "object" &&
						_animate !== null &&
						"width" in _animate &&
						typeof _animate.width === "number"
							? _animate.width
							: undefined
					void _custom
					void _exit
					void _initial
					void _variants

					return (
						<span
							ref={ref}
							data-motion-duration={transition?.duration}
							data-motion-width={motionWidth}
							{...props}
						/>
					)
				},
			),
		},
		useReducedMotion: () => reducedMotionMock.value,
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { value?: string }) => {
			if (key === "slidesTemplates.compactCount") return `${options?.value} 套`
			if (key === "slidesTemplates.todayAddedCount") return `今日新增 ${options?.value} 套`
			return `模板总数 ${options?.value} 套`
		},
	}),
}))

vi.mock("@/pages/superMagic/components/AnimatedNumberText", () => ({
	AnimatedNumberText: ({ value }: { value: number }) => <>{value.toLocaleString("en-US")}</>,
}))

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

beforeEach(() => {
	reducedMotionMock.value = false
})

function getActiveContent() {
	return screen.getByTestId("slides-template-count-value")
}

describe("SlidesTemplateCountBadge", () => {
	it("continuously rotates between today's growth and the template total", () => {
		vi.useFakeTimers()
		render(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={512}
				testId="slides-template-count"
			/>,
		)

		expect(getActiveContent()).toHaveTextContent("今日新增512套")
		expect(getActiveContent().querySelector("[data-slides-template-badge-text]")).toHaveClass(
			"inline-flex",
			"items-center",
			"leading-none",
		)

		act(() => vi.advanceTimersByTime(SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL))
		expect(getActiveContent()).toHaveTextContent("模板总数144,369套")

		act(() => vi.advanceTimersByTime(SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL))
		expect(getActiveContent()).toHaveTextContent("今日新增512套")
	})

	it("restarts the dwell time when statistics change", () => {
		vi.useFakeTimers()
		const { rerender } = render(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={512}
				testId="slides-template-count"
			/>,
		)

		act(() => vi.advanceTimersByTime(2500))
		rerender(
			<SlidesTemplateCountBadge
				count={144370}
				todayAdded={513}
				testId="slides-template-count"
			/>,
		)
		act(() => vi.advanceTimersByTime(500))
		expect(getActiveContent()).toHaveTextContent("今日新增513套")

		act(() => vi.advanceTimersByTime(2500))
		expect(getActiveContent()).toHaveTextContent("模板总数144,370套")
	})

	it("treats zero as valid today's growth", () => {
		render(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={0}
				testId="slides-template-count"
			/>,
		)

		expect(getActiveContent()).toHaveTextContent("今日新增0套")
	})

	it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"shows only the total when today's growth is invalid: %s",
		(todayAdded) => {
			vi.useFakeTimers()
			render(
				<SlidesTemplateCountBadge
					count={144369}
					todayAdded={todayAdded}
					testId="slides-template-count"
				/>,
			)

			expect(getActiveContent()).toHaveTextContent("模板总数144,369套")
			act(() => vi.advanceTimersByTime(SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL * 2))
			expect(getActiveContent()).toHaveTextContent("模板总数144,369套")
		},
	)

	it("immediately falls back to the total when a later response becomes invalid", () => {
		const { rerender } = render(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={512}
				testId="slides-template-count"
			/>,
		)

		rerender(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={-1}
				testId="slides-template-count"
			/>,
		)

		expect(getActiveContent()).toHaveTextContent("模板总数144,369套")
	})

	it("disables motion durations when reduced motion is preferred", () => {
		reducedMotionMock.value = true
		render(
			<SlidesTemplateCountBadge
				count={144369}
				todayAdded={512}
				testId="slides-template-count"
			/>,
		)

		expect(screen.getByTestId("slides-template-count")).toHaveAttribute(
			"data-motion-duration",
			"0",
		)
		expect(getActiveContent()).toHaveAttribute("data-motion-duration", "0")
	})

	it("keeps the badge text and applies ellipsis styles when the row is narrow", () => {
		vi.stubGlobal(
			"ResizeObserver",
			vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })),
		)
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0)
			return 1
		})
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			columnGap: "8px",
			gap: "8px",
		} as CSSStyleDeclaration)
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function () {
			return this.hasAttribute("data-slides-template-row") ? 182 : 0
		})
		vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function () {
			return this.hasAttribute("data-slides-template-label") ? 48 : 0
		})
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
			const width = this.hasAttribute("data-slides-template-icon")
				? 16
				: this.getAttribute("aria-hidden") === "true"
					? this.getAttribute("data-slides-template-badge-measure") === "compact"
						? 80
						: 104
					: 0
			return {
				bottom: 0,
				height: 0,
				left: 0,
				right: width,
				top: 0,
				width,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			}
		})

		render(
			<div data-slides-template-row>
				<span data-slides-template-icon />
				<span data-slides-template-label>AI PPT</span>
				<SlidesTemplateCountBadge count={144369} testId="slides-template-count" />
			</div>,
		)

		expect(getActiveContent()).toHaveTextContent("144,369 套")
		expect(getActiveContent()).not.toHaveTextContent("模板总数")
		expect(screen.getByTestId("slides-template-count")).toHaveAttribute(
			"data-motion-width",
			"80",
		)
		expect(getActiveContent().querySelector("[data-slides-template-badge-text]")).toHaveClass(
			"min-w-0",
			"overflow-hidden",
			"text-ellipsis",
			"whitespace-nowrap",
		)
		expect(
			getActiveContent().querySelector("[data-slides-template-badge-compact]")?.textContent,
		).toBe("144,369 套")
	})

	it("clamps the badge width to the remaining row space", () => {
		expect(
			shouldUseCompactSlidesTemplateBadge({
				availableWidth: 184,
				iconWidth: 16,
				titleWidth: 48,
				contentWidth: 104,
				gap: 8,
			}),
		).toBe(false)
		expect(
			shouldUseCompactSlidesTemplateBadge({
				availableWidth: 182,
				iconWidth: 16,
				titleWidth: 48,
				contentWidth: 104,
				gap: 8,
			}),
		).toBe(true)
		expect(
			getSlidesTemplateBadgeTargetWidth({
				availableWidth: 182,
				iconWidth: 16,
				contentWidth: 80,
				gap: 8,
				compact: true,
			}),
		).toBe(80)
	})
})
