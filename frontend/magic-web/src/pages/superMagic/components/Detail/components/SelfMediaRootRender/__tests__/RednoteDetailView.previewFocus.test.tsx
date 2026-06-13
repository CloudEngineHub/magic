import type { ForwardedRef } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RednoteDetailView } from "../platforms/rednote/detail"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: { count?: number }) =>
			key === "detail.selfMedia.platform.rednote.commentsTotal"
				? `${params?.count ?? 0} comments`
				: key,
	}),
}))

vi.mock("../stores", () => ({
	useSelfMediaStore: () => ({
		activeCardIndex: 0,
		activePostIndex: 0,
		activePost: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
			},
			cards: [{ fileId: "card-1" }, { fileId: "card-2" }],
		},
	}),
}))

vi.mock("../components/CardFrame", async () => {
	const react = await import("react")
	const MockCardFrame = react.forwardRef(function MockCardFrame(
		_props: Record<string, unknown>,
		ref: ForwardedRef<{
			capture: () => Promise<string>
			getIframeElement: () => HTMLIFrameElement | null
		}>,
	) {
		react.useImperativeHandle(ref, () => ({
			capture: async () => "",
			getIframeElement: () => null,
		}))
		return <div data-testid="mock-card-frame" />
	})

	return {
		__esModule: true,
		default: MockCardFrame,
		invalidateCardFrameSourceCache: vi.fn(),
	}
})

vi.mock("../components/CardActionStrip", () => ({
	CardActionStrip: () => <div data-testid="mock-card-action-strip" />,
}))

describe("RednoteDetailView preview focus", () => {
	it("renders the detail header with white background and no border", () => {
		render(
			<RednoteDetailView
				cardRefs={{ current: [] }}
				onBackHome={vi.fn()}
				backLabel="Back"
				onChangeCard={vi.fn()}
			/>,
		)

		const header = screen.getByTestId("red-detail-header")
		expect(header).toHaveClass("bg-white")
		expect(header).not.toHaveClass("border-b")
	})

	it("changes card on next click before triggering preview focus", async () => {
		const onChangeCard = vi.fn()
		const onPreviewFocus = vi.fn()

		render(
			<RednoteDetailView
				cardRefs={{ current: [] }}
				onBackHome={vi.fn()}
				backLabel="Back"
				onChangeCard={onChangeCard}
				onPreviewFocus={onPreviewFocus}
			/>,
		)

		const nextButton = screen.getByTestId("red-detail-next-button")
		fireEvent.pointerDown(nextButton)

		expect(onPreviewFocus).not.toHaveBeenCalled()
		expect(onChangeCard).not.toHaveBeenCalled()

		fireEvent(
			nextButton,
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				clientX: 321,
				clientY: 222,
			}),
		)

		expect(onPreviewFocus).toHaveBeenCalledTimes(1)
		const focusEvent = onPreviewFocus.mock.calls[0]?.[0]
		expect(focusEvent.clientX).toBe(321)
		expect(focusEvent.clientY).toBe(222)
		await waitFor(() => {
			expect(onChangeCard).toHaveBeenCalledWith(1)
		})
	})
})
