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
				subtitle: "Post subtitle",
				tags: { core: ["AI"], mid: ["PPT"] },
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

	it("edits title, subtitle, and tags in place and syncs each field", async () => {
		const onUpdatePostMeta = vi.fn().mockResolvedValue(true)
		render(
			<RednoteDetailView
				cardRefs={{ current: [] }}
				onBackHome={vi.fn()}
				backLabel="Back"
				onChangeCard={vi.fn()}
				allowEdit
				onUpdatePostMeta={onUpdatePostMeta}
			/>,
		)

		const titleDisplay = screen.getByTestId("red-detail-title-display")
		expect(titleDisplay).toHaveClass(
			"whitespace-normal",
			"break-words",
			"text-[16px]",
			"font-semibold",
			"leading-6",
		)
		fireEvent.click(screen.getByTestId("red-detail-edit-title-button"))
		const titleInput = screen.getByTestId("red-detail-title-input")
		expect(titleInput.tagName).toBe("DIV")
		expect(titleInput).toHaveAttribute("role", "textbox")
		expect(titleInput).toHaveAttribute("aria-multiline", "false")
		expect(titleInput).toHaveClass(
			"whitespace-normal",
			"break-words",
			"text-[16px]",
			"font-semibold",
			"leading-6",
		)
		expect(titleInput.nextElementSibling).toHaveClass("h-6", "w-6", "shrink-0")
		fireEvent.input(titleInput, { target: { textContent: "Updated title" } })
		fireEvent.blur(titleInput)
		await waitFor(() => expect(onUpdatePostMeta).toHaveBeenCalledTimes(1))

		fireEvent.click(screen.getByTestId("red-detail-edit-subtitle-button"))
		const subtitleInput = screen.getByTestId("red-detail-subtitle-input")
		expect(subtitleInput.tagName).toBe("TEXTAREA")
		fireEvent.change(subtitleInput, { target: { value: "Updated subtitle" } })
		fireEvent.blur(subtitleInput)
		await waitFor(() => expect(onUpdatePostMeta).toHaveBeenCalledTimes(2))

		fireEvent.click(screen.getByTestId("red-detail-edit-tags-button"))
		fireEvent.click(screen.getByTestId("red-detail-add-tag-button"))
		const newTagInput = screen.getByTestId("red-detail-new-tag-input")
		fireEvent.change(newTagInput, { target: { value: "#New" } })
		fireEvent.keyDown(newTagInput, { key: "Enter" })
		await waitFor(() => expect(onUpdatePostMeta).toHaveBeenCalledTimes(3))
		await waitFor(() =>
			expect(screen.getByTestId("red-detail-delete-tag-PPT")).not.toBeDisabled(),
		)
		fireEvent.click(screen.getByTestId("red-detail-delete-tag-PPT"))

		await waitFor(() => {
			expect(onUpdatePostMeta).toHaveBeenNthCalledWith(1, { title: "Updated title" })
			expect(onUpdatePostMeta).toHaveBeenNthCalledWith(2, { subtitle: "Updated subtitle" })
			expect(onUpdatePostMeta).toHaveBeenNthCalledWith(3, {
				tags: { core: ["AI", "New"], mid: ["PPT"], longtail: [], trend: [] },
			})
			expect(onUpdatePostMeta).toHaveBeenNthCalledWith(4, {
				tags: { core: ["AI", "New"], mid: [], longtail: [], trend: [] },
			})
		})
		await waitFor(() => expect(screen.getByTestId("red-detail-edit-tag-AI")).not.toBeDisabled())
		fireEvent.click(screen.getByTestId("red-detail-edit-tag-AI"))
		const tagInput = screen.getByTestId("red-detail-tag-input-AI")
		fireEvent.change(tagInput, { target: { value: "AI工具" } })
		fireEvent.blur(tagInput)
		await waitFor(() => {
			expect(onUpdatePostMeta).toHaveBeenNthCalledWith(5, {
				tags: { core: ["AI工具", "New"], mid: [], longtail: [], trend: [] },
			})
		})
	})

	it("keeps title content single-line while allowing visual wrapping", async () => {
		const onUpdatePostMeta = vi.fn().mockResolvedValue(true)
		render(
			<RednoteDetailView
				cardRefs={{ current: [] }}
				onBackHome={vi.fn()}
				backLabel="Back"
				onChangeCard={vi.fn()}
				allowEdit
				onUpdatePostMeta={onUpdatePostMeta}
			/>,
		)

		fireEvent.click(screen.getByTestId("red-detail-edit-title-button"))
		const titleInput = screen.getByTestId("red-detail-title-input")
		const range = document.createRange()
		range.selectNodeContents(titleInput)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
		fireEvent.paste(titleInput, {
			clipboardData: { getData: () => "First line\nSecond line" },
		})

		expect(titleInput).toHaveTextContent("First line Second line")
		fireEvent.keyDown(titleInput, { key: "Enter" })
		await waitFor(() => {
			expect(onUpdatePostMeta).toHaveBeenCalledWith({
				title: "First line Second line",
			})
		})
	})

	it("shows a visible saving state while metadata is being persisted", async () => {
		let resolveSave: (value: boolean) => void = () => undefined
		const savePromise = new Promise<boolean>((resolve) => {
			resolveSave = resolve
		})
		const onUpdatePostMeta = vi.fn().mockReturnValue(savePromise)
		render(
			<RednoteDetailView
				cardRefs={{ current: [] }}
				onBackHome={vi.fn()}
				backLabel="Back"
				onChangeCard={vi.fn()}
				allowEdit
				onUpdatePostMeta={onUpdatePostMeta}
			/>,
		)

		fireEvent.click(screen.getByTestId("red-detail-edit-subtitle-button"))
		const subtitleInput = screen.getByTestId("red-detail-subtitle-input")
		fireEvent.change(subtitleInput, { target: { value: "Saving subtitle" } })
		fireEvent.blur(subtitleInput)

		await waitFor(() => {
			expect(screen.getByTestId("red-detail-meta-editor")).toHaveAttribute(
				"aria-busy",
				"true",
			)
			expect(screen.getByTestId("red-detail-meta-save-status")).toBeInTheDocument()
		})
		resolveSave(true)
		await waitFor(() => {
			expect(screen.getByTestId("red-detail-meta-editor")).toHaveAttribute(
				"aria-busy",
				"false",
			)
		})
	})
})
