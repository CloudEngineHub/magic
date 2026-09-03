import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import { CanvasDesignI18nProvider } from "../../../../app/providers/I18nProvider"
import { createTestResourceReferenceResolver } from "../../../../public/__tests__/testResourceReferenceResolver"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import ReferenceImageItem from "../ReferenceImageItem"

vi.mock("../../../../app/hooks/resources/useReferenceImageUrls", () => ({
	useReferenceImageUrls: () => ({
		lowUrl: "https://example.com/reference.png",
		isLoading: false,
		hasError: false,
		imageInfo: undefined,
	}),
}))

vi.mock("../../../previews/reference-media/useReferenceVideoPoster", () => ({
	useReferenceVideoPoster: () => ({
		loadState: "error",
		posterClone: null,
	}),
}))

describe("ReferenceImageItem", () => {
	function renderItem(props: ComponentProps<typeof ReferenceImageItem>) {
		return render(
			<CanvasDesignI18nProvider>
				<TooltipProvider delayDuration={0}>
					<ReferenceImageItem {...props} />
				</TooltipProvider>
			</CanvasDesignI18nProvider>,
		)
	}

	it("shows an opaque asset path tooltip with a copy button", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.assign(navigator, { clipboard: { writeText } })

		renderItem({
			path: "asset://virtual-human-asset-id",
			onPreviewMediaResource: vi.fn(),
		})

		fireEvent.pointerMove(screen.getByRole("img", { name: "asset://virtual-human-asset-id" }), {
			pointerType: "mouse",
		})

		const tooltip = await screen.findByRole("tooltip")
		expect(tooltip).toHaveTextContent("asset://virtual-human-asset-id")

		const copyButton = screen.getByRole("button", { name: "复制资源路径" })
		expect(copyButton).toHaveClass("cursor-pointer")
		fireEvent.click(copyButton)
		expect(writeText).toHaveBeenCalledWith("asset://virtual-human-asset-id")
	})

	it("does not open fullscreen preview for a deleted history resource", () => {
		const onPreviewMediaResource = vi.fn()
		const { container } = renderItem({
			path: "./images/deleted.png",
			onPreviewMediaResource,
			resolveResourceReference: createTestResourceReferenceResolver({
				attachmentsReady: true,
			}),
		})

		expect(screen.queryByRole("button")).not.toBeInTheDocument()
		fireEvent.click(container.firstElementChild as HTMLElement)
		expect(onPreviewMediaResource).not.toHaveBeenCalled()
	})

	it("keeps fullscreen preview enabled for an available history resource", () => {
		const onPreviewMediaResource = vi.fn()
		renderItem({
			path: "./images/available.png",
			onPreviewMediaResource,
			resolveResourceReference: createTestResourceReferenceResolver({
				attachmentsReady: true,
				attachmentPathsByFileId: {
					available: "/画布A/images/available.png",
				},
			}),
		})

		fireEvent.click(screen.getByRole("button"))
		expect(onPreviewMediaResource).toHaveBeenCalledWith(
			expect.objectContaining({ path: "./images/available.png" }),
		)
	})
})
