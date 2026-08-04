import { createRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import EditorPromptCarousel, { type EditorPromptCarouselHandle } from "../EditorPromptCarousel"

const mocks = vi.hoisted(() => ({
	reduceMotion: false,
}))

vi.mock("framer-motion", () => ({
	useReducedMotion: () => mocks.reduceMotion,
}))

describe("EditorPromptCarousel", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		mocks.reduceMotion = false
		vi.spyOn(Math, "random").mockReturnValue(0)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("starts from a random prompt on mount", () => {
		vi.mocked(Math.random).mockReturnValue(0.6)

		render(
			<EditorPromptCarousel
				config={{ examples: ["甲", "乙", "丙"], typingIntervalMs: 10 }}
				enabled
				onAccept={() => true}
			/>,
		)

		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("乙")).toBeInTheDocument()
	})

	it("types a prompt, then exposes the clickable Tab action", () => {
		const onAccept = vi.fn(() => true)
		render(
			<EditorPromptCarousel
				config={{
					examples: ["案例一", "案例二"],
					typingIntervalMs: 10,
					holdDurationMs: 30,
					fadeDurationMs: 5,
					tabLabel: "Tab",
					acceptLabel: "接受",
					navigationLabel: "切换案例",
					applyAriaLabel: "应用案例",
				}}
				enabled
				isFocused
				onAccept={onAccept}
			/>,
		)

		expect(screen.getByTestId("editor-prompt-carousel")).toHaveTextContent("Tab")
		expect(screen.queryByText("案例一")).not.toBeInTheDocument()

		act(() => vi.advanceTimersByTime(30))

		expect(screen.getByText("案例一")).toBeInTheDocument()
		expect(screen.getByText("↑↓")).toBeInTheDocument()
		expect(screen.getByText("切换案例")).toBeInTheDocument()
		expect(screen.getByText("接受")).toBeInTheDocument()
		const applyButton = screen.getByRole("button", { name: "应用案例" })
		expect(applyButton.parentElement?.previousElementSibling).toHaveTextContent("案例一")
		expect(applyButton.parentElement).toHaveClass("-translate-y-px")
		expect(screen.getByText("切换案例").parentElement).toHaveClass("mt-1")
		fireEvent.click(applyButton)
		expect(onAccept).toHaveBeenCalledOnce()
	})

	it("shows navigation guidance on focus before the prompt is complete", () => {
		const config = {
			examples: ["案例一", "案例二"],
			typingIntervalMs: 10,
			navigationLabel: "切换案例",
			applyAriaLabel: "应用案例",
		}
		const { rerender } = render(
			<EditorPromptCarousel
				config={config}
				enabled
				isFocused={false}
				onAccept={() => true}
			/>,
		)

		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("切换案例").parentElement).toHaveClass("opacity-0")
		expect(screen.getByText("Tab").parentElement).toHaveClass("opacity-0")

		rerender(<EditorPromptCarousel config={config} enabled isFocused onAccept={() => true} />)
		expect(screen.getByText("切换案例").parentElement).toHaveClass("opacity-100")
		expect(screen.getByText("Tab").parentElement).toHaveClass("opacity-0")

		act(() => vi.advanceTimersByTime(20))
		expect(screen.getByRole("button", { name: "应用案例" }).parentElement).toHaveClass(
			"opacity-100",
		)
	})

	it("hides the prompt during IME composition without resetting the carousel", () => {
		const config = {
			examples: ["案例一"],
			typingIntervalMs: 10,
			applyAriaLabel: "应用案例",
		}
		const { rerender } = render(
			<EditorPromptCarousel config={config} enabled visible={false} onAccept={() => true} />,
		)

		expect(screen.queryByTestId("editor-prompt-carousel")).not.toBeInTheDocument()
		act(() => vi.advanceTimersByTime(30))

		rerender(<EditorPromptCarousel config={config} enabled visible onAccept={() => true} />)
		expect(screen.getByText("案例一")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "应用案例" })).toBeInTheDocument()
	})

	it("rotates to the next prompt after the hold and fade durations", () => {
		render(
			<EditorPromptCarousel
				config={{
					examples: ["甲", "乙"],
					typingIntervalMs: 10,
					holdDurationMs: 30,
					fadeDurationMs: 5,
				}}
				enabled
				onAccept={() => true}
			/>,
		)

		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("甲")).toBeInTheDocument()

		act(() => vi.advanceTimersByTime(45))
		expect(screen.getByText("乙")).toBeInTheDocument()
	})

	it("shows the full prompt immediately when reduced motion is requested", () => {
		mocks.reduceMotion = true
		const onAccept = vi.fn(() => true)
		render(
			<EditorPromptCarousel
				config={{ examples: ["完整案例"], applyAriaLabel: "应用案例" }}
				enabled
				onAccept={onAccept}
			/>,
		)

		expect(screen.getByText("完整案例")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "应用案例" }))
		expect(onAccept).toHaveBeenCalledOnce()
	})

	it("switches prompts with the imperative previous and next actions", () => {
		const ref = createRef<EditorPromptCarouselHandle>()
		render(
			<EditorPromptCarousel
				ref={ref}
				config={{ examples: ["甲", "乙"], typingIntervalMs: 10 }}
				enabled
				onAccept={() => true}
			/>,
		)

		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("甲")).toBeInTheDocument()

		act(() => {
			expect(ref.current?.showNextPrompt()).toBe(true)
		})
		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("乙")).toBeInTheDocument()

		act(() => {
			expect(ref.current?.showPreviousPrompt()).toBe(true)
		})
		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("甲")).toBeInTheDocument()
	})

	it("hides while disabled and advances when the editor becomes empty again", () => {
		const config = { examples: ["甲", "乙"], typingIntervalMs: 10 }
		const { rerender } = render(
			<EditorPromptCarousel config={config} enabled onAccept={() => true} />,
		)

		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("甲")).toBeInTheDocument()

		rerender(<EditorPromptCarousel config={config} enabled={false} onAccept={() => true} />)
		expect(screen.queryByText("甲")).not.toBeInTheDocument()

		rerender(<EditorPromptCarousel config={config} enabled onAccept={() => true} />)
		act(() => vi.advanceTimersByTime(10))
		expect(screen.getByText("乙")).toBeInTheDocument()
	})
})
