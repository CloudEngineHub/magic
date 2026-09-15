import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import { GenerationStatus } from "../../../../public/magic-types"
import ImageMessageEditor from "../image"
import VideoGenerateEditor from "../video"

const mocks = vi.hoisted(() => ({
	isReplacing: false,
	selectedElements: [] as Array<Record<string, unknown>>,
	eventHandlers: {} as Record<string, (event: { data: { elementId: string } }) => void>,
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasSelectionUI: () => ({
		selectedElements: mocks.selectedElements,
		isSelecting: false,
		isDragging: false,
		activeToolSession: null,
	}),
	useCanvasModeUI: () => ({
		croppingElementId: null,
		extendingElementId: null,
		erasingElementId: null,
	}),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			elementManager: {
				isTemporary: vi.fn(() => false),
				getElementInstance: vi.fn(() => undefined),
			},
		},
	}),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasEvent: (event: string, listener: (event: { data: { elementId: string } }) => void) => {
		mocks.eventHandlers[event] = listener
	},
	useGenerationRuntime: vi.fn(() => null),
	useIsMediaReplacing: () => mocks.isReplacing,
}))

vi.mock("../image/SecondEdit", () => ({
	default: () => <div>image-second-edit</div>,
}))

vi.mock("../image/ImageMessageEditorRender", () => ({
	default: () => <div>image-create-editor</div>,
}))

vi.mock("../video/VideoSecondEdit", () => ({
	default: () => <div>video-second-edit</div>,
}))

vi.mock("../video/VideoGenerateEditorRender", () => ({
	default: () => <div>video-create-editor</div>,
}))

vi.mock("../../../fullscreen/media-resource/index", () => ({
	default: () => <div>media-preview</div>,
}))

describe("media editor replacement gating", () => {
	beforeEach(() => {
		mocks.isReplacing = false
		mocks.selectedElements = []
		mocks.eventHandlers = {}
	})

	it("mounts image second-edit when the result exists and unmounts it while replacement is active", () => {
		mocks.selectedElements = [
			{
				id: "image-1",
				type: ElementTypeEnum.Image,
				contents: [
					{
						contentId: "image-content-1",
						src: "/images/current.png",
						status: GenerationStatus.Completed,
						generateImageRequest: { model_id: "image-model" },
					},
				],
				activeContentId: "image-content-1",
				mainContentId: "image-content-1",
			},
		]
		const { rerender } = render(<ImageMessageEditor />)
		expect(screen.getByText("image-second-edit")).toBeInTheDocument()

		mocks.isReplacing = true
		rerender(<ImageMessageEditor />)
		expect(screen.queryByText("image-second-edit")).toBeNull()
	})

	it("unmounts video second-edit actions while replacement is active", () => {
		mocks.selectedElements = [
			{
				id: "video-1",
				type: ElementTypeEnum.Video,
				contents: [
					{
						contentId: "video-content-1",
						src: "/videos/current.mp4",
						status: GenerationStatus.Completed,
						generateVideoRequest: { model_id: "video-model" },
					},
				],
				activeContentId: "video-content-1",
				mainContentId: "video-content-1",
			},
		]
		const { rerender } = render(<VideoGenerateEditor />)
		expect(screen.getByText("video-second-edit")).toBeInTheDocument()

		mocks.isReplacing = true
		rerender(<VideoGenerateEditor />)
		expect(screen.queryByText("video-second-edit")).toBeNull()
	})

	it("keeps the completed video version editor mounted while another version generates", () => {
		mocks.selectedElements = [
			{
				id: "video-1",
				type: ElementTypeEnum.Video,
				contents: [
					{
						contentId: "video-content-1",
						src: "/videos/current.mp4",
						status: GenerationStatus.Completed,
						generateVideoRequest: { model_id: "video-model" },
					},
					{
						contentId: "video-content-2",
						status: GenerationStatus.Processing,
						generateVideoRequest: { model_id: "video-model" },
					},
				],
				activeContentId: "video-content-1",
				mainContentId: "video-content-1",
			},
		]

		render(<VideoGenerateEditor />)
		expect(screen.getByText("video-second-edit")).toBeInTheDocument()
	})

	it("keeps video result actions available after switching away from the submitted version", () => {
		const videoWithVersions = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			contents: [
				{
					contentId: "video-content-1",
					src: "/videos/current.mp4",
					status: GenerationStatus.Completed,
					generateVideoRequest: { model_id: "video-model" },
				},
				{
					contentId: "video-content-2",
					status: GenerationStatus.Processing,
					generateVideoRequest: { model_id: "video-model" },
				},
			],
			activeContentId: "video-content-2",
			mainContentId: "video-content-1",
		}
		mocks.selectedElements = [videoWithVersions]
		const view = render(<VideoGenerateEditor />)
		expect(screen.queryByText("video-second-edit")).toBeNull()

		mocks.selectedElements = [{ ...videoWithVersions, activeContentId: "video-content-1" }]
		view.rerender(<VideoGenerateEditor />)
		expect(screen.getByText("video-second-edit")).toBeInTheDocument()
	})

	it("restores image result actions after switching away from the submitted version", () => {
		const imageWithVersions = {
			id: "image-1",
			type: ElementTypeEnum.Image,
			contents: [
				{
					contentId: "image-content-1",
					src: "/images/current.png",
					status: GenerationStatus.Completed,
					generateImageRequest: { model_id: "image-model" },
				},
				{
					contentId: "image-content-2",
					src: "/images/generated.png",
					status: GenerationStatus.Completed,
					generateImageRequest: { model_id: "image-model" },
				},
			],
			activeContentId: "image-content-2",
			mainContentId: "image-content-1",
		}
		mocks.selectedElements = [imageWithVersions]
		const view = render(<ImageMessageEditor />)

		act(() => {
			mocks.eventHandlers["element:image:generate-submit-started"]?.({
				data: { elementId: "image-1" },
			})
		})
		expect(screen.queryByText("image-second-edit")).toBeNull()

		mocks.selectedElements = [{ ...imageWithVersions, activeContentId: "image-content-1" }]
		view.rerender(<ImageMessageEditor />)
		expect(screen.getByText("image-second-edit")).toBeInTheDocument()
	})
})
