import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PPTPresenterConsoleControls from "../PPTPresenterConsoleControls"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("PPTPresenterConsoleControls", () => {
	it("exposes local navigation and exit actions", () => {
		const onPrevSlide = vi.fn()
		const onNextSlide = vi.fn()
		const onExit = vi.fn()

		render(
			<PPTPresenterConsoleControls
				activeIndex={1}
				totalSlides={4}
				isTransitioning={false}
				screens={[]}
				selectedScreen={null}
				onPrevSlide={onPrevSlide}
				onNextSlide={onNextSlide}
				onJumpToPage={vi.fn()}
				onSelectScreen={vi.fn()}
				onExit={onExit}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-presenter-console-prev-button"))
		fireEvent.click(screen.getByTestId("ppt-presenter-console-next-button"))
		fireEvent.click(screen.getByTestId("ppt-presenter-console-exit-button"))

		expect(onPrevSlide).toHaveBeenCalledTimes(1)
		expect(onNextSlide).toHaveBeenCalledTimes(1)
		expect(onExit).toHaveBeenCalledTimes(1)
	})

	it("jumps to a valid page from the indicator", () => {
		const onJumpToPage = vi.fn()

		render(
			<PPTPresenterConsoleControls
				activeIndex={0}
				totalSlides={4}
				isTransitioning={false}
				screens={[]}
				selectedScreen={null}
				onPrevSlide={vi.fn()}
				onNextSlide={vi.fn()}
				onJumpToPage={onJumpToPage}
				onSelectScreen={vi.fn()}
				onExit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-presenter-console-page-indicator"))
		fireEvent.change(screen.getByTestId("ppt-presenter-console-page-input"), {
			target: { value: "3" },
		})
		fireEvent.keyDown(screen.getByTestId("ppt-presenter-console-page-input"), { key: "Enter" })

		expect(onJumpToPage).toHaveBeenCalledWith(2)
	})
})
