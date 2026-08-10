import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum } from "../../../runtime/document/types"
import ElementTools from "../index"

const mocks = vi.hoisted(() => ({
	selectedElements: [] as Array<Record<string, unknown>>,
	canvas: undefined as
		{ mediaReplaceController: { getReplacingElementId: () => string | null } } | undefined,
	mediaReplaceStateHandler: undefined as
		| ((event: {
				data: { elementId: string; status: "idle" | "uploading" | "applying" | "error" }
		  }) => void)
		| undefined,
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
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(
		(
			event: string,
			handler: (event: {
				data: {
					elementId: string
					status: "idle" | "uploading" | "applying" | "error"
				}
			}) => void,
		) => {
			if (event === "element:media:replaceStateChanged") {
				mocks.mediaReplaceStateHandler = handler
			}
		},
	),
}))

vi.mock("../hooks/useShowVideoOriginalSizeButton", () => ({
	default: () => false,
}))

describe("ElementTools image replacement ordering", () => {
	beforeEach(() => {
		mocks.selectedElements = []
		mocks.canvas = undefined
		mocks.mediaReplaceStateHandler = undefined
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

	it("moves pending multi-version deletion out of the top toolbar", () => {
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
		expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()
	})

	it("keeps replace and download in the image top toolbar", () => {
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
			ElementToolTypeEnum.MediaReplaceButton,
			ElementToolTypeEnum.MediaDownloadButton,
		])
	})

	it("shows batch download for a single frame", () => {
		mocks.selectedElements = [
			{
				id: "frame-1",
				type: ElementTypeEnum.Frame,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels).toContain(ElementToolTypeEnum.FrameDownloadButton)
	})

	it("shows download for a single audio element", () => {
		mocks.selectedElements = [
			{
				id: "audio-1",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 320,
				height: 96,
				contents: [{ contentId: "audio-content", src: "./audios/demo.mp3" }],
				activeContentId: "audio-content",
				mainContentId: "audio-content",
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels).toEqual([
			ElementToolTypeEnum.MediaReplaceButton,
			ElementToolTypeEnum.MediaDownloadButton,
		])
	})

	it("shows the common download and replace tools for a video", () => {
		mocks.selectedElements = [
			{
				id: "video-1",
				type: ElementTypeEnum.Video,
				x: 0,
				y: 0,
				width: 640,
				height: 360,
				contents: [{ contentId: "video-content", src: "./videos/demo.mp4" }],
				activeContentId: "video-content",
				mainContentId: "video-content",
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels).toEqual([
			ElementToolTypeEnum.MediaReplaceButton,
			ElementToolTypeEnum.MediaDownloadButton,
		])
	})

	it("shows upload for an empty audio element", () => {
		mocks.selectedElements = [
			{
				id: "audio-empty",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 320,
				height: 96,
				contents: [{ contentId: "audio-content" }],
				activeContentId: "audio-content",
				mainContentId: "audio-content",
			},
		]

		render(<ElementTools />)
		const labels = Array.from(screen.getByTestId("element-tools").children).map(
			(node) => node.textContent,
		)

		expect(labels).toEqual([ElementToolTypeEnum.MediaReplaceButton])
	})

	it("hides the audio toolbar while the selected empty node uploads", () => {
		mocks.selectedElements = [
			{
				id: "audio-empty",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 320,
				height: 96,
				contents: [{ contentId: "audio-content" }],
				activeContentId: "audio-content",
				mainContentId: "audio-content",
			},
		]

		render(<ElementTools />)
		expect(screen.getByTestId("element-tools")).toBeInTheDocument()

		act(() => {
			mocks.mediaReplaceStateHandler?.({
				data: { elementId: "audio-empty", status: "uploading" },
			})
		})
		expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()

		act(() => {
			mocks.mediaReplaceStateHandler?.({
				data: { elementId: "audio-empty", status: "idle" },
			})
		})
		expect(screen.getByTestId("element-tools")).toBeInTheDocument()
	})

	it("hides the entire media toolbar during replacement", () => {
		mocks.selectedElements = [
			{
				id: "audio-1",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 320,
				height: 96,
				contents: [{ contentId: "audio-content", src: "./audios/voice.mp3" }],
				activeContentId: "audio-content",
				mainContentId: "audio-content",
			},
		]

		render(<ElementTools />)
		act(() => {
			mocks.mediaReplaceStateHandler?.({
				data: { elementId: "audio-1", status: "uploading" },
			})
		})

		expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()
	})

	it.each([ElementTypeEnum.Image, ElementTypeEnum.Video] as const)(
		"hides the %s toolbar while replacement is active",
		(type) => {
			mocks.selectedElements = [
				{
					id: `${type}-1`,
					type,
					x: 0,
					y: 0,
					width: 320,
					height: 180,
					contents: [{ contentId: `${type}-content`, src: `./${type}/demo` }],
					activeContentId: `${type}-content`,
					mainContentId: `${type}-content`,
				},
			]

			render(<ElementTools />)
			act(() => {
				mocks.mediaReplaceStateHandler?.({
					data: { elementId: `${type}-1`, status: "applying" },
				})
			})

			expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()
		},
	)

	it("restores replacement state when a video is reselected", () => {
		mocks.canvas = {
			mediaReplaceController: { getReplacingElementId: () => "video-1" },
		}
		mocks.selectedElements = [
			{
				id: "video-1",
				type: ElementTypeEnum.Video,
				x: 0,
				y: 0,
				width: 320,
				height: 180,
				contents: [{ contentId: "video-content", src: "./videos/demo.mp4" }],
				activeContentId: "video-content",
				mainContentId: "video-content",
			},
		]

		render(<ElementTools />)

		expect(screen.queryByTestId("element-tools")).not.toBeInTheDocument()
	})
})
