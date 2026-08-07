import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RecordingDetailTabStrip } from "../RecordingDetailTabStrip"

const manyTabs = [
	{ key: "summary", label: "Summary Alpha" },
	{ key: "topics", label: "Topics Beta" },
	{ key: "highlights", label: "Highlights Gamma" },
	{ key: "insights", label: "Insights Delta" },
	{ key: "mindmap", label: "Mindmap Epsilon" },
	{ key: "notes", label: "Notes Zeta" },
]

describe("RecordingDetailTabStrip", () => {
	it("renders tab labels without the legacy muted segmented track", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="summary"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-strip")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-tab-strip")).not.toHaveClass("bg-muted")
		expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument()
	})

	it("shows badge only when badgeCount is greater than zero", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "marks", label: "Marks", badgeCount: 3 },
					{ key: "empty", label: "Empty", badgeCount: 0 },
				]}
				activeKey="summary"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-badge-marks")).toHaveTextContent("3")
		expect(screen.queryByTestId("recording-detail-tab-badge-empty")).not.toBeInTheDocument()
	})

	it("calls onChange when a tab is clicked", () => {
		const onChange = vi.fn()

		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="summary"
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Notes" }))
		expect(onChange).toHaveBeenCalledWith("notes")
	})

	it("applies active text color on the selected tab", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="notes"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-notes")).toHaveClass("text-background")
		expect(screen.getByTestId("recording-detail-tab-summary")).toHaveClass(
			"text-muted-foreground",
		)
	})

	it("uses a horizontally scrollable container with a w-max inner row", () => {
		render(
			<RecordingDetailTabStrip
				tabs={manyTabs}
				activeKey="summary"
				onChange={() => undefined}
			/>,
		)

		const scrollContainer = screen.getByTestId("recording-detail-tab-scroll")
		const innerRow = screen.getByTestId("recording-detail-tab-inner")
		const bleedWrapper = scrollContainer.parentElement

		expect(scrollContainer).toHaveClass("overflow-x-auto", "no-scrollbar")
		expect(bleedWrapper).toHaveClass("-mx-4", "overflow-hidden")
		expect(innerRow).toHaveClass("w-max", "flex-nowrap")
		expect(screen.getByTestId("recording-detail-tab-strip")).toHaveClass(
			"min-w-0",
			"overflow-hidden",
			"rounded-t-[22px]",
		)
	})

	describe("overflow edge fades", () => {
		it("shows start and end fades when content overflows and is partially scrolled", () => {
			const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
				HTMLElement.prototype,
				"scrollWidth",
			)
			const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
				HTMLElement.prototype,
				"clientWidth",
			)
			const scrollLeftDescriptor = Object.getOwnPropertyDescriptor(
				HTMLElement.prototype,
				"scrollLeft",
			)

			Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
				configurable: true,
				get() {
					return 640
				},
			})
			Object.defineProperty(HTMLElement.prototype, "clientWidth", {
				configurable: true,
				get() {
					return 240
				},
			})
			Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
				configurable: true,
				get() {
					return 120
				},
				set() {
					// Allow components to update their local scroller while this test pins the observed state.
				},
			})

			render(
				<RecordingDetailTabStrip
					tabs={manyTabs}
					activeKey="summary"
					onChange={() => undefined}
				/>,
			)

			expect(screen.getByTestId("recording-detail-tab-fade-start")).toBeInTheDocument()
			expect(screen.getByTestId("recording-detail-tab-fade-end")).toBeInTheDocument()

			if (scrollWidthDescriptor) {
				Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollWidthDescriptor)
			} else {
				delete (HTMLElement.prototype as Partial<HTMLElement>).scrollWidth
			}
			if (clientWidthDescriptor) {
				Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor)
			} else {
				delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth
			}
			if (scrollLeftDescriptor) {
				Object.defineProperty(HTMLElement.prototype, "scrollLeft", scrollLeftDescriptor)
			} else {
				delete (HTMLElement.prototype as Partial<HTMLElement>).scrollLeft
			}
		})

		it("centers the active tab inside only the local scroll container", () => {
			const { rerender } = render(
				<RecordingDetailTabStrip
					tabs={manyTabs}
					activeKey="summary"
					onChange={() => undefined}
				/>,
			)
			const scrollContainer = screen.getByTestId("recording-detail-tab-scroll")
			const notesTab = screen.getByTestId("recording-detail-tab-notes")
			Object.defineProperties(scrollContainer, {
				scrollWidth: { configurable: true, value: 640 },
				clientWidth: { configurable: true, value: 240 },
				scrollLeft: { configurable: true, writable: true, value: 0 },
			})
			Object.defineProperties(notesTab, {
				offsetLeft: { configurable: true, value: 360 },
				offsetWidth: { configurable: true, value: 80 },
			})

			rerender(
				<RecordingDetailTabStrip
					tabs={manyTabs}
					activeKey="notes"
					onChange={() => undefined}
				/>,
			)

			expect(scrollContainer.scrollLeft).toBe(280)
		})
	})
})
