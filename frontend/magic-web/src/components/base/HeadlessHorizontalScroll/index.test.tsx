import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import HeadlessHorizontalScroll from "./index"

function makeScrollable(element: HTMLElement) {
	Object.defineProperties(element, {
		clientWidth: { configurable: true, value: 200 },
		scrollWidth: { configurable: true, value: 600 },
	})
}

function firePointerEvent(
	element: HTMLElement,
	type: "pointerdown" | "pointermove" | "pointerup",
	init: MouseEventInit & { pointerId: number },
) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
	Object.defineProperty(event, "pointerId", { value: init.pointerId })
	fireEvent(element, event)
}

describe("HeadlessHorizontalScroll", () => {
	it("scrolls horizontally while the pointer is held and dragged", () => {
		render(
			<HeadlessHorizontalScroll scrollContainerProps={{ "data-testid": "scroller" }}>
				<div>Content</div>
			</HeadlessHorizontalScroll>,
		)
		const scroller = screen.getByTestId("scroller")
		makeScrollable(scroller)

		firePointerEvent(scroller, "pointerdown", {
			pointerId: 1,
			button: 0,
			clientX: 120,
			clientY: 20,
		})
		firePointerEvent(scroller, "pointermove", { pointerId: 1, clientX: 70, clientY: 22 })

		expect(scroller.scrollLeft).toBe(50)
		expect(scroller).toHaveClass("cursor-grabbing")

		firePointerEvent(scroller, "pointerup", { pointerId: 1 })
		expect(scroller).not.toHaveClass("cursor-grabbing")
	})

	it("keeps a click when the pointer does not become a horizontal drag", () => {
		const handleClick = vi.fn()
		render(
			<HeadlessHorizontalScroll scrollContainerProps={{ "data-testid": "scroller" }}>
				<button type="button" onClick={handleClick}>
					Item
				</button>
			</HeadlessHorizontalScroll>,
		)
		const scroller = screen.getByTestId("scroller")
		const item = screen.getByRole("button", { name: "Item" })
		const setPointerCapture = vi.fn()
		Object.defineProperty(scroller, "setPointerCapture", { value: setPointerCapture })
		makeScrollable(scroller)

		firePointerEvent(item, "pointerdown", {
			pointerId: 1,
			button: 0,
			clientX: 120,
			clientY: 20,
		})
		firePointerEvent(item, "pointerup", {
			pointerId: 1,
			clientX: 120,
			clientY: 20,
		})
		fireEvent.click(item)

		expect(setPointerCapture).not.toHaveBeenCalled()
		expect(handleClick).toHaveBeenCalledOnce()
	})

	it("suppresses the item click produced after dragging", () => {
		const handleClick = vi.fn()
		render(
			<HeadlessHorizontalScroll scrollContainerProps={{ "data-testid": "scroller" }}>
				<button type="button" onClick={handleClick}>
					Item
				</button>
			</HeadlessHorizontalScroll>,
		)
		const scroller = screen.getByTestId("scroller")
		const item = screen.getByRole("button", { name: "Item" })
		makeScrollable(scroller)

		firePointerEvent(item, "pointerdown", {
			pointerId: 1,
			button: 0,
			clientX: 120,
			clientY: 20,
		})
		firePointerEvent(item, "pointermove", { pointerId: 1, clientX: 70, clientY: 22 })
		firePointerEvent(item, "pointerup", { pointerId: 1, clientX: 70, clientY: 22 })
		fireEvent.click(item)

		expect(handleClick).not.toHaveBeenCalled()
	})

	it("no longer maps vertical wheel movement to horizontal scrolling", () => {
		render(
			<HeadlessHorizontalScroll scrollContainerProps={{ "data-testid": "scroller" }}>
				<div>Content</div>
			</HeadlessHorizontalScroll>,
		)
		const scroller = screen.getByTestId("scroller")
		makeScrollable(scroller)

		fireEvent.wheel(scroller, { deltaY: 80 })

		expect(scroller.scrollLeft).toBe(0)
	})
})
