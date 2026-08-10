import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../../../runtime/document/types"
import MediaReplaceButton from "../index"

const mocks = vi.hoisted(() => ({
	selectedElements: [] as Array<Record<string, unknown>>,
	emit: vi.fn(),
}))

vi.mock("../../../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(),
}))

vi.mock("../../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			readonly: false,
			eventEmitter: { emit: mocks.emit },
		},
	}),
}))

vi.mock("../../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasUI: () => ({ selectedElements: mocks.selectedElements }),
}))

vi.mock("../../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}))

function createMediaElement(type: "image" | "video" | "audio", src?: string) {
	return {
		id: `${type}-1`,
		type,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		contents: [{ contentId: `${type}-content-1`, src }],
		activeContentId: `${type}-content-1`,
		mainContentId: `${type}-content-1`,
	}
}

describe("MediaReplaceButton labels", () => {
	beforeEach(() => {
		mocks.selectedElements = []
		mocks.emit.mockReset()
	})

	it.each([
		[ElementTypeEnum.Image, "替换图片"],
		[ElementTypeEnum.Video, "替换视频"],
		[ElementTypeEnum.Audio, "替换音频"],
	] as const)("shows the media-specific replacement label for %s", (type, label) => {
		mocks.selectedElements = [createMediaElement(type, `/media/${type}`)]

		render(<MediaReplaceButton />)

		expect(screen.getByText(label)).toBeInTheDocument()
	})

	it("shows upload audio for an empty audio element", () => {
		mocks.selectedElements = [createMediaElement(ElementTypeEnum.Audio)]

		render(<MediaReplaceButton />)

		expect(screen.getByText("上传音频")).toBeInTheDocument()
	})

	it("emits the replacement button element as the menu anchor", () => {
		mocks.selectedElements = [createMediaElement(ElementTypeEnum.Image, "/media/image")]
		render(<MediaReplaceButton />)

		const button = screen.getByText("替换图片").parentElement as HTMLDivElement

		fireEvent.click(screen.getByText("替换图片"))

		expect(mocks.emit).toHaveBeenCalledWith({
			type: "element:media:replaceClick",
			data: {
				elementId: "image-1",
				mediaType: ElementTypeEnum.Image,
				contentId: "image-content-1",
				anchorElement: button,
			},
		})
	})
})
