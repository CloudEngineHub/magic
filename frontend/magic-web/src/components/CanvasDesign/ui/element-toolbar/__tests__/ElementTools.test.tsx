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

	it("does not show replace for a new empty image node", () => {
		mocks.selectedElements = [
			{
				id: "image-empty",
				type: ElementTypeEnum.Image,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				activeContentId: "version-1",
				mainContentId: "version-1",
				contents: [{ contentId: "version-1" }],
			},
		]

		render(<ElementTools />)

		expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()
	})

	it("keeps only delete for an empty active Content when other Contents exist", () => {
		mocks.selectedElements = [
			{
				id: "image-1",
				type: ElementTypeEnum.Image,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				activeContentId: "version-2",
				mainContentId: "version-1",
				contents: [
					{ contentId: "version-1", src: "./images/one.png", status: "completed" },
					{ contentId: "version-2", status: "pending" },
				],
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels).toEqual([ElementToolTypeEnum.ImageContentDeleteButton])
	})

	it("places replace immediately before delete for a multi-Content image", () => {
		mocks.selectedElements = [
			{
				id: "image-1",
				type: ElementTypeEnum.Image,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				activeContentId: "version-2",
				mainContentId: "version-1",
				contents: [
					{ contentId: "version-1", src: "./images/one.png", status: "completed" },
					{ contentId: "version-2", src: "./images/two.png", status: "completed" },
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
			ElementToolTypeEnum.ImageContentDeleteButton,
		])
	})
})
