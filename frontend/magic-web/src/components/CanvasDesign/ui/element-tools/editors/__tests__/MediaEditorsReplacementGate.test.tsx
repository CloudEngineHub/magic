import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import { GenerationStatus } from "../../../../public/magic-types"
import ImageMessageEditor from "../image"
import VideoGenerateEditor from "../video"

const mocks = vi.hoisted(() => ({
	isReplacing: false,
	selectedElements: [] as Array<Record<string, unknown>>,
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
	useCanvasEvent: vi.fn(),
	useGenerationRuntime: vi.fn(() => null),
	useIsMediaReplacing: () => mocks.isReplacing,
}))

vi.mock("../../../../app/hooks/resources/useImageOssSrc", () => ({
	useImageOssSrc: () => ({ hasOssSrc: true }),
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
	})

	it("unmounts image second-edit actions while replacement is active", () => {
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
})
