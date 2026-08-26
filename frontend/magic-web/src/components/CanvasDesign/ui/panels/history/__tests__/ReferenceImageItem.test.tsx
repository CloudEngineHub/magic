import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import { CanvasDesignI18nProvider } from "../../../../app/providers/I18nProvider"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import ReferenceImageItem from "../ReferenceImageItem"

vi.mock("../../../../app/hooks/resources/useReferenceImageUrls", () => ({
	useReferenceImageUrls: () => ({
		lowUrl: null,
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

		fireEvent.click(screen.getByRole("button", { name: "复制资源路径" }))
		expect(writeText).toHaveBeenCalledWith("asset://virtual-human-asset-id")
	})
})
