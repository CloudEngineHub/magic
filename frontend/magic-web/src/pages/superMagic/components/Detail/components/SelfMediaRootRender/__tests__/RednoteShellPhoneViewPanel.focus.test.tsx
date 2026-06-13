import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RednoteShellPhoneViewPanel } from "../platforms/rednote/RednoteShellPhoneViewPanel"
import type { SelfMediaView } from "../types"

let mockView: SelfMediaView = "detail"

vi.mock("../stores", () => ({
	useSelfMediaStore: () => ({
		loading: false,
		error: null,
		view: mockView,
		activeCardIndex: 0,
		activePost: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
			},
			cards: [{ fileId: "card-1" }],
		},
		setActiveCardIndex: () => undefined,
		setView: () => undefined,
	}),
}))

vi.mock("../components/PhoneShell", () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="mock-phone-shell">{children}</div>
	),
}))

vi.mock("../components/CardActionStrip", () => ({
	CardActionStrip: () => <div data-testid="mock-card-action-strip" />,
}))

vi.mock("../platforms/rednote/feed", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-rednote-feed" />,
}))

vi.mock("../platforms/rednote/detail", () => ({
	RednoteDetailView: ({
		onPreviewFocus,
	}: {
		onPreviewFocus?: (event?: React.PointerEvent<HTMLElement>) => void
	}) => (
		<button
			type="button"
			data-testid="mock-rednote-detail-preview"
			onPointerDown={(event) => onPreviewFocus?.(event)}
		>
			preview
		</button>
	),
	RednoteFooter: () => <div data-testid="mock-rednote-footer" />,
}))

vi.mock("../platforms/rednote/RednoteShellContentGate", () => ({
	RednoteShellContentGate: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="mock-rednote-content-gate">{children}</div>
	),
}))

function FocusHarness({ view = "detail" }: { view?: SelfMediaView }) {
	const [phoneFocused, setPhoneFocused] = useState(false)
	const isDetailView = view === "detail"

	return (
		<div data-testid="mock-shell-workspace" onPointerDown={() => setPhoneFocused(false)}>
			<RednoteShellPhoneViewPanel
				visible
				scale={1}
				shouldRenderFeed={view === "feed"}
				shouldRenderDetail={isDetailView}
				shouldShowFooter={!isDetailView}
				cardRefs={{ current: [] }}
				footerLabels={{
					home: "Home",
					shopping: "Shopping",
					publish: "Publish",
					messages: "Messages",
					me: "Me",
				}}
				onBackHome={vi.fn()}
				onSelectFeedPost={vi.fn()}
				onChangeDetailCard={vi.fn()}
				phoneFocused={phoneFocused}
				onPhoneFocus={() => setPhoneFocused(true)}
			/>
		</div>
	)
}

function firePointerDownWithClientPoint(
	element: HTMLElement,
	{ clientX, clientY }: { clientX: number; clientY: number },
) {
	fireEvent(
		element,
		new MouseEvent("pointerdown", {
			bubbles: true,
			cancelable: true,
			clientX,
			clientY,
		}),
	)
}

describe("RednoteShellPhoneViewPanel focus interaction", () => {
	afterEach(() => {
		mockView = "detail"
		vi.restoreAllMocks()
	})

	it("zooms the phone after internal pointer down and collapses after outside pointer down", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			function mockRect() {
				if ((this as HTMLElement).classList.contains("self-media-phone-focus-cluster")) {
					return {
						x: 100,
						y: 200,
						left: 100,
						top: 200,
						width: 400,
						height: 800,
						right: 500,
						bottom: 1000,
						toJSON: () => ({}),
					} as DOMRect
				}
				return {
					x: 0,
					y: 0,
					left: 0,
					top: 0,
					width: 0,
					height: 0,
					right: 0,
					bottom: 0,
					toJSON: () => ({}),
				} as DOMRect
			},
		)
		const { container } = render(<FocusHarness />)

		const panel = screen.getByTestId("rednote-phone-view-panel")
		expect(panel).toHaveAttribute("data-focused", "false")
		const focusStyles = container.querySelector("style")?.textContent ?? ""
		expect(focusStyles).toContain("--phone-focus-origin-x")
		expect(focusStyles).toContain("transform-origin: var(--phone-focus-origin-x")
		expect(focusStyles).toContain("scale(1.24)")

		firePointerDownWithClientPoint(screen.getByTestId("rednote-phone-focus-surface"), {
			clientX: 300,
			clientY: 520,
		})
		expect(panel).toHaveAttribute("data-focused", "true")
		expect(panel).toHaveAttribute("data-focus-x", "50.00")
		expect(panel).toHaveAttribute("data-focus-y", "40.00")

		firePointerDownWithClientPoint(screen.getByTestId("mock-rednote-detail-preview"), {
			clientX: 460,
			clientY: 840,
		})
		expect(panel).toHaveAttribute("data-focused", "true")
		expect(panel).toHaveAttribute("data-focus-x", "50.00")
		expect(panel).toHaveAttribute("data-focus-y", "40.00")

		fireEvent.pointerDown(screen.getByTestId("mock-shell-workspace"))
		expect(panel).toHaveAttribute("data-focused", "false")

		firePointerDownWithClientPoint(screen.getByTestId("mock-rednote-detail-preview"), {
			clientX: 460,
			clientY: 840,
		})
		expect(panel).toHaveAttribute("data-focused", "true")
		expect(panel).toHaveAttribute("data-focus-x", "90.00")
		expect(panel).toHaveAttribute("data-focus-y", "80.00")
	})

	it("does not zoom the phone outside the detail note view", () => {
		mockView = "feed"
		render(<FocusHarness view="feed" />)

		const panel = screen.getByTestId("rednote-phone-view-panel")
		expect(panel).toHaveAttribute("data-focused", "false")

		firePointerDownWithClientPoint(screen.getByTestId("rednote-phone-focus-surface"), {
			clientX: 300,
			clientY: 520,
		})

		expect(panel).toHaveAttribute("data-focused", "false")
		expect(panel).toHaveAttribute("data-focus-x", "50.00")
		expect(panel).toHaveAttribute("data-focus-y", "38.00")
	})
})
