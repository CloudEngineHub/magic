import { forwardRef, useEffect, useImperativeHandle } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CardFrameRef } from "../components/CardFrame"

const mockUseCoverImageUrl = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (!options) return key
			const params = Object.entries(options)
				.map(([k, v]) => `${k}=${v}`)
				.join(",")
			return `${key}|${params}`
		},
	}),
}))

vi.mock("../platforms/wechat-official-accounts/useCoverImageUrl", () => ({
	useCoverImageUrl: mockUseCoverImageUrl,
}))

vi.mock("../components/CardFrame", () => ({
	__esModule: true,
	default: forwardRef<CardFrameRef, { cardId: string; onLoaded?: () => void }>(
		function MockCardFrame({ cardId, onLoaded }, ref) {
			useImperativeHandle(
				ref,
				() => ({
					capture: vi.fn(),
					getCaptureSize: vi.fn(() => ({ width: 900, height: 1200 })),
					getIframeElement: vi.fn(() => null),
				}),
				[],
			)
			useEffect(() => {
				onLoaded?.()
			}, [onLoaded])
			return <div data-testid="mock-card-frame" data-card-id={cardId} />
		},
	),
}))

import ExportPreviewDialog from "../components/ExportPreviewDialog"
import type { SelfMediaPost } from "../types"

const posts: SelfMediaPost[] = [
	{
		meta: { id: "post-1", title: "First post" },
		cards: [
			{ path: "01.html", fileId: "file-1-1" },
			{ path: "02.html", fileId: "file-1-2" },
			{ path: "03.html", fileId: "file-1-3" },
		],
	},
	{
		meta: { id: "post-2", title: "Second post" },
		cards: [
			{ path: "01.html", fileId: "file-2-1" },
			{ path: "02.html", fileId: "file-2-2" },
		],
	},
]

const manyCardPost: SelfMediaPost = {
	meta: { id: "post-many", title: "Many cards" },
	cards: Array.from({ length: 10 }, (_, idx) => ({
		path: `${String(idx + 1).padStart(2, "0")}.html`,
		fileId: `file-many-${idx + 1}`,
	})),
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof ExportPreviewDialog>> = {}) {
	const onOpenChange = vi.fn()
	const onSyncActivePost = vi.fn()
	const onConfirm = vi.fn()
	const defaultProps = {
		open: true,
		onOpenChange,
		posts,
		initialPostIndex: 0,
		onSyncActivePost,
		onConfirm,
	}
	const view = render(<ExportPreviewDialog {...defaultProps} {...overrides} />)
	return {
		onOpenChange,
		onSyncActivePost,
		onConfirm,
		rerenderDialog: (
			nextOverrides: Partial<React.ComponentProps<typeof ExportPreviewDialog>>,
		) =>
			view.rerender(
				<ExportPreviewDialog {...defaultProps} {...overrides} {...nextOverrides} />,
			),
	}
}

describe("ExportPreviewDialog", () => {
	beforeEach(() => {
		mockUseCoverImageUrl.mockReturnValue({ url: null, loading: false })
	})

	it("defaults to the current active post and selects all of its cards", () => {
		renderDialog({ initialPostIndex: 1 })

		const dialog = screen.getByTestId("self-media-export-dialog")
		const grid = within(dialog).getByTestId("self-media-export-card-grid")
		const items = within(grid).getAllByTestId(/^self-media-export-card-item-/)
		expect(items).toHaveLength(posts[1].cards.length)

		const summary = within(dialog).getByTestId("self-media-export-selected-summary")
		expect(summary.textContent).toContain("count=2")
		expect(summary.textContent).toContain("total=2")
	})

	it("shows a visible selected style on selected cards", () => {
		renderDialog()

		const selectedItem = screen.getByTestId("self-media-export-card-item-0")
		expect(selectedItem).toHaveAttribute("aria-pressed", "true")
		expect(selectedItem.className).toContain("ring-2")
		expect(selectedItem.className).toContain("bg-primary/5")
	})

	it("keeps export options outside the card preview scroll region", () => {
		renderDialog({ posts: [manyCardPost], initialPostIndex: 0 })

		const dialog = screen.getByTestId("self-media-export-dialog")
		const cardGrid = screen.getByTestId("self-media-export-card-grid")
		const typeSection = screen.getByTestId("self-media-export-type-section")
		const scaleSection = screen.getByTestId("self-media-export-scale-section")
		const footer = screen.getByTestId("self-media-export-footer")

		expect(dialog.className).toContain("overflow-hidden")
		expect(cardGrid.className).toContain("min-h-0")
		expect(typeSection.className).toContain("shrink-0")
		expect(typeSection.className).toContain("px-4")
		expect(scaleSection.className).toContain("shrink-0")
		expect(scaleSection.className).toContain("px-4")
		expect(footer.className).toContain("shrink-0")
	})

	it("does not override the selected checkbox background", () => {
		renderDialog()

		const selectedCheckbox = screen.getByTestId("self-media-export-card-checkbox-0")
		expect(selectedCheckbox).toHaveAttribute("data-state", "checked")
		expect(selectedCheckbox.className).not.toMatch(/(^|\s)bg-background(\s|$)/)
	})

	it("supports clearing and re-selecting all cards via the toggle button", () => {
		const { onSyncActivePost } = renderDialog()

		const summary = screen.getByTestId("self-media-export-selected-summary")
		expect(summary.textContent).toContain("count=3")

		fireEvent.click(screen.getByTestId("self-media-export-toggle-all"))
		expect(screen.getByTestId("self-media-export-selected-summary").textContent).toContain(
			"count=0",
		)

		fireEvent.click(screen.getByTestId("self-media-export-toggle-all"))
		expect(screen.getByTestId("self-media-export-selected-summary").textContent).toContain(
			"count=3",
		)

		expect(onSyncActivePost).not.toHaveBeenCalled()
	})

	it("passes the sorted subset, image format, and chosen pixel ratio to onConfirm", async () => {
		const { onConfirm } = renderDialog({ initialPostIndex: 0 })

		// Deselect card index 1 to prove only the remaining indexes are passed.
		fireEvent.click(screen.getByTestId("self-media-export-card-item-1"))
		fireEvent.click(screen.getByTestId("self-media-export-format-option-webp"))

		fireEvent.click(screen.getByTestId("self-media-export-confirm"))
		expect(onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({
				postIndex: 0,
				cardIndexes: [0, 2],
				pixelRatio: 2,
				format: "webp",
			}),
		)
	})

	it("passes the long-image export type when selected", async () => {
		const { onConfirm } = renderDialog({ initialPostIndex: 0 })

		fireEvent.click(screen.getByTestId("self-media-export-type-long-image"))
		fireEvent.click(screen.getByTestId("self-media-export-confirm"))

		expect(onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({
				postIndex: 0,
				cardIndexes: [0, 1, 2],
				exportType: "longImage",
			}),
		)
	})

	it("shows dimensions from the actual card capture size", () => {
		renderDialog()

		expect(screen.getByTestId("self-media-export-scale-size-2x")).toHaveTextContent(
			"width=1800,height=2400",
		)

		fireEvent.click(screen.getByTestId("self-media-export-type-long-image"))
		expect(screen.getByTestId("self-media-export-scale-size-2x")).toHaveTextContent(
			"width=1800,height=7204",
		)
	})

	it("keeps long-image export disabled until every selected preview card is ready", () => {
		const { onConfirm } = renderDialog({ posts: [manyCardPost], initialPostIndex: 0 })

		fireEvent.click(screen.getByTestId("self-media-export-type-long-image"))

		const confirm = screen.getByTestId("self-media-export-confirm") as HTMLButtonElement
		expect(confirm.disabled).toBe(true)

		fireEvent.click(confirm)
		expect(onConfirm).not.toHaveBeenCalled()
	})

	it("passes preview card refs so export can use the freshly mounted dialog cards", async () => {
		const { onConfirm, rerenderDialog } = renderDialog({ initialPostIndex: 0 })

		fireEvent.click(screen.getByTestId("self-media-export-confirm"))

		const args = onConfirm.mock.calls[0]?.[0]
		const firstPreviewRef = args.getCardRef(0)
		expect(firstPreviewRef).toEqual(expect.objectContaining({ capture: expect.any(Function) }))

		rerenderDialog({
			posts: posts.map((post) => ({
				...post,
				cards: post.cards.map((card) => ({ ...card })),
			})),
		})

		expect(args.getCardRef(0)).toBe(firstPreviewRef)
		expect(args.getCardRef(99)).toBeNull()
	})

	it("disables confirm when nothing is selected", () => {
		renderDialog()

		fireEvent.click(screen.getByTestId("self-media-export-toggle-all"))
		const confirm = screen.getByTestId("self-media-export-confirm") as HTMLButtonElement
		expect(confirm.disabled).toBe(true)
	})

	it("renders WeChat export products without the card picker", async () => {
		const onCopyHtml = vi.fn()
		const { onConfirm } = renderDialog({
			exportMode: "wechatOfficial",
			onCopyWechatHtml: onCopyHtml,
			posts: [
				{
					...posts[0],
					thumbnailCover: { path: "thumb.png", fileId: "thumb-file" },
					heroCover: { path: "hero.png", fileId: "hero-file" },
				},
			],
		})

		expect(screen.queryByTestId("self-media-export-card-grid")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-export-dialog").className).not.toContain("h-[85vh]")
		expect(screen.getByTestId("self-media-export-dialog").className).toContain("max-h-[720px]")
		expect(screen.getByTestId("self-media-export-wechat-products").className).not.toContain(
			"flex-1",
		)
		expect(screen.getByTestId("self-media-export-wechat-cover-product")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-export-wechat-html-product")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-export-copy-html"))
		await waitFor(() => expect(onCopyHtml).toHaveBeenCalledTimes(1))
		await waitFor(() => {
			expect(screen.getByTestId("self-media-export-copy-html")).toHaveTextContent(
				"detail.selfMedia.export.wechat.htmlCopied",
			)
		})

		fireEvent.click(screen.getByTestId("self-media-export-confirm"))
		expect(onConfirm).toHaveBeenCalledWith(
			expect.objectContaining({
				postIndex: 0,
				cardIndexes: [],
				exportType: "wechatCoverImage",
			}),
		)
	})

	it("renders a stitched WeChat cover preview from the selected post cover images", () => {
		mockUseCoverImageUrl.mockImplementation((fileId?: string) => ({
			url: fileId ? `https://example.test/${fileId}.png` : null,
			loading: false,
		}))

		renderDialog({
			exportMode: "wechatOfficial",
			posts: [
				{
					...posts[0],
					thumbnailCover: { path: "thumb.png", fileId: "thumb-file" },
					heroCover: { path: "hero.png", fileId: "hero-file" },
				},
			],
		})

		const preview = screen.getByTestId("self-media-export-wechat-cover-preview")
		const squareImage = within(preview).getByAltText(
			"detail.selfMedia.export.wechat.squareCover",
		)
		const horizontalImage = within(preview).getByAltText(
			"detail.selfMedia.export.wechat.horizontalCover",
		)
		const horizontalFrame = screen.getByTestId("self-media-export-wechat-horizontal-preview")

		expect(preview.className).toContain("w-full")
		expect(preview.className).toContain("aspect-[10/3]")
		expect(preview.className).toContain("grid-cols-[3fr_7fr]")
		expect(squareImage).toHaveAttribute("src", "https://example.test/thumb-file.png")
		expect(horizontalImage).toHaveAttribute("src", "https://example.test/hero-file.png")
		expect(horizontalFrame.className).toContain("aspect-[21/9]")
		expect(horizontalFrame.className).not.toContain("border-l")
	})

	it("guides users to generate both covers when the selected post has no images", async () => {
		const onGenerateWechatCovers = vi.fn().mockResolvedValue(true)
		renderDialog({
			exportMode: "wechatOfficial",
			onGenerateWechatCovers,
			posts: [{ ...posts[0], thumbnailCover: undefined, heroCover: undefined }],
		})

		expect(screen.getByTestId("self-media-export-wechat-cover-empty-state")).toHaveTextContent(
			"detail.selfMedia.export.wechat.emptyTitle",
		)
		expect(
			screen.getByTestId("self-media-export-wechat-horizontal-preview").className,
		).toContain("border-l")
		expect(screen.getByTestId("self-media-export-confirm")).toBeDisabled()

		fireEvent.click(screen.getByTestId("self-media-export-generate-wechat-covers"))

		await waitFor(() => {
			expect(onGenerateWechatCovers).toHaveBeenCalledWith({
				postIndex: 0,
				coverTypes: ["thumbnailCover", "heroCover"],
			})
		})
	})

	it("only requests the missing square cover when the horizontal cover exists", async () => {
		const onGenerateWechatCovers = vi.fn().mockResolvedValue(true)
		renderDialog({
			exportMode: "wechatOfficial",
			onGenerateWechatCovers,
			posts: [
				{
					...posts[0],
					heroCover: { path: "hero.png", fileId: "hero-file" },
				},
			],
		})

		expect(screen.getByTestId("self-media-export-wechat-cover-empty-state")).toHaveTextContent(
			"detail.selfMedia.export.wechat.missingSquareTitle",
		)

		fireEvent.click(screen.getByTestId("self-media-export-generate-wechat-covers"))

		await waitFor(() => {
			expect(onGenerateWechatCovers).toHaveBeenCalledWith({
				postIndex: 0,
				coverTypes: ["thumbnailCover"],
			})
		})
	})

	it("shows the actual stitched WeChat cover output dimensions", () => {
		renderDialog({
			exportMode: "wechatOfficial",
			exportSizeHintCss: { width: 1800, height: 540 },
			posts: [
				{
					...posts[0],
					thumbnailCover: { path: "thumb.png", fileId: "thumb-file" },
					heroCover: { path: "hero.png", fileId: "hero-file" },
				},
			],
		})

		expect(screen.getByTestId("self-media-export-scale-size-2x")).toHaveTextContent(
			"width=3600,height=1080",
		)
	})
})
