import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createTestResourceReferenceResolver } from "../../../../public/__tests__/testResourceReferenceResolver"
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
	it("does not open fullscreen preview for a deleted history resource", () => {
		const onPreviewMediaResource = vi.fn()
		const { container } = render(
			<ReferenceImageItem
				path="./images/deleted.png"
				onPreviewMediaResource={onPreviewMediaResource}
				resolveResourceReference={createTestResourceReferenceResolver({
					attachmentsReady: true,
				})}
			/>,
		)

		expect(screen.queryByRole("button")).not.toBeInTheDocument()
		fireEvent.click(container.firstElementChild as HTMLElement)
		expect(onPreviewMediaResource).not.toHaveBeenCalled()
	})

	it("keeps fullscreen preview enabled for an available history resource", () => {
		const onPreviewMediaResource = vi.fn()
		render(
			<ReferenceImageItem
				path="./images/available.png"
				onPreviewMediaResource={onPreviewMediaResource}
				resolveResourceReference={createTestResourceReferenceResolver({
					attachmentsReady: true,
					attachmentPathsByFileId: {
						available: "/画布A/images/available.png",
					},
				})}
			/>,
		)

		fireEvent.click(screen.getByRole("button"))
		expect(onPreviewMediaResource).toHaveBeenCalledWith(
			expect.objectContaining({ path: "./images/available.png" }),
		)
	})
})
