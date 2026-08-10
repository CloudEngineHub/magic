import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import ElementBottomToolbarHost from "../ElementBottomToolbarHost"
import {
	ElementBottomToolbarProvider,
	useElementBottomToolbarSection,
} from "../ElementBottomToolbarContext"

const mocks = vi.hoisted(() => ({
	isReplacing: false,
	selectedElements: [] as Array<Record<string, unknown>>,
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			elementManager: {
				getElementInstance: vi.fn(() => null),
			},
		},
	}),
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasSelectionUI: () => ({
		selectedElements: mocks.selectedElements,
		isDragging: false,
		isSelecting: false,
		subElementTooltip: null,
	}),
	useCanvasModeUI: () => ({
		croppingElementId: null,
		extendingElementId: null,
		erasingElementId: null,
	}),
	useCanvasPanelUI: () => ({ fullscreenMediaElement: null }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useIsMediaReplacing: () => mocks.isReplacing,
}))

vi.mock("../../../../app/hooks/layout/useElementPositionEffect", () => ({
	default: () => ({ containerRef: { current: null } }),
}))

vi.mock("../../../../app/hooks/layout/useFloatingComponent", () => ({
	useFloatingComponent: () => ({ containerRef: { current: null } }),
}))

function RegisteredResultActions() {
	useElementBottomToolbarSection({
		elementId: "image-1",
		id: "image-result-actions",
		items: [{ id: "re-edit", label: "重新编辑", onClick: vi.fn() }],
	})
	return null
}

describe("ElementBottomToolbarHost replacement gating", () => {
	beforeEach(() => {
		mocks.isReplacing = false
		mocks.selectedElements = [
			{
				id: "image-1",
				type: ElementTypeEnum.Image,
				contents: [{ contentId: "image-content-1", src: "/images/current.png" }],
				activeContentId: "image-content-1",
				mainContentId: "image-content-1",
			},
		]
	})

	it("hides result actions while the selected image is replacing", () => {
		const { rerender } = render(
			<ElementBottomToolbarProvider>
				<RegisteredResultActions />
				<ElementBottomToolbarHost />
			</ElementBottomToolbarProvider>,
		)

		expect(screen.getByRole("button", { name: "重新编辑" })).toBeInTheDocument()

		mocks.isReplacing = true
		rerender(
			<ElementBottomToolbarProvider>
				<RegisteredResultActions />
				<ElementBottomToolbarHost />
			</ElementBottomToolbarProvider>,
		)

		expect(screen.queryByRole("button", { name: "重新编辑" })).toBeNull()
		expect(screen.getByRole("toolbar", { hidden: true })).toHaveAttribute("aria-hidden", "true")
	})
})
