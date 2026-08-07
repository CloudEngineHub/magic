import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum } from "../../../runtime/document/types"
import ElementTools from "../index"

const mocks = vi.hoisted(() => ({
	selectedElements: [] as Array<Record<string, unknown>>,
}))

vi.mock("../ElementToolsRender", () => ({
	default: (props: { options: Array<string | { type: string }> }) => (
		<div data-testid="element-tools">
			{props.options.map((option, index) => (
				<span key={`${typeof option === "string" ? option : option.type}-${index}`}>
					{typeof option === "string" ? option : option.type}
				</span>
			))}
		</div>
	),
}))

vi.mock("../../../app/providers/CanvasUIProvider", () => ({
	useCanvasSelectionUI: () => ({
		selectedElements: mocks.selectedElements,
		isDragging: false,
		isSelecting: false,
		subElementTooltip: null,
	}),
}))

vi.mock("../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({ convertHightConfig: { supported: false } }),
}))

vi.mock("../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: undefined }),
}))

vi.mock("../hooks/useShowVideoOriginalSizeButton", () => ({
	default: () => false,
}))

describe("ElementTools image replacement ordering", () => {
	beforeEach(() => {
		mocks.selectedElements = []
	})

	it("places replace immediately before delete for a multi-version image", () => {
		mocks.selectedElements = [
			{
				id: "image-1",
				type: ElementTypeEnum.Image,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				imageDslVersion: 2,
				activeVersionId: "version-2",
				mainVersionId: "version-1",
				versions: [
					{ id: "version-1", src: "./images/one.png", status: "completed" },
					{ id: "version-2", src: "./images/two.png", status: "completed" },
				],
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels.slice(-3)).toEqual([
			"Divider",
			ElementToolTypeEnum.ImageReplaceButton,
			ElementToolTypeEnum.ImageVersionDeleteButton,
		])
	})
})
