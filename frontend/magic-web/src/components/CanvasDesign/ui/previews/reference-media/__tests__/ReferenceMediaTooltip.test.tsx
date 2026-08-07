import { createEvent, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import { ReferenceAudioPreview } from "../ReferenceAudioPreview"
import { ReferenceImageLowPreview } from "../ReferenceImageLowPreview"
import { ReferenceVideoPosterPreview } from "../ReferenceVideoPosterPreview"
import { CanvasDesignI18nProvider } from "../../../../app/providers/I18nProvider"

const mocks = vi.hoisted(() => ({
	loadAudio: vi.fn(),
	posterClone: null as HTMLCanvasElement | null,
}))

vi.mock("../useReferenceAudioSrc", () => ({
	useReferenceAudioSrc: () => ({
		src: "https://cdn.test/audio.mp3",
		isLoading: false,
		hasError: false,
		load: mocks.loadAudio,
	}),
}))

vi.mock("../useReferenceVideoPoster", () => ({
	useReferenceVideoPoster: () => ({
		loadState: "ready",
		posterClone: mocks.posterClone,
		ossSrc: "https://cdn.test/video.mp4",
	}),
}))

vi.mock("../../../../app/hooks/resources/useReferenceImageUrls", async () => {
	const { useState } = await import("react")
	return {
		useReferenceImageUrls: () => {
			const [open, setOpen] = useState(false)
			return {
				lowUrl: "https://cdn.test/image-low.png",
				fullUrl: "https://cdn.test/image-full.png",
				isLoading: false,
				hasError: false,
				imageInfo: { naturalWidth: 640, naturalHeight: 360 },
				isFullUrlLoading: false,
				open,
				setOpen,
				handleOpenChange: setOpen,
			}
		},
	}
})

vi.mock("../useObserveBoxSize", () => ({
	useObserveBoxSize: () => ({ ref: vi.fn(), w: 48, h: 56 }),
}))

function renderWithTooltipProvider(ui: ReactNode) {
	return render(
		<CanvasDesignI18nProvider>
			<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>
		</CanvasDesignI18nProvider>,
	)
}

function getTooltipTrigger(container: HTMLElement): HTMLElement {
	const trigger = container.querySelector<HTMLElement>("[data-state]")
	if (!trigger) throw new Error("Tooltip trigger not found")
	return trigger
}

function fireTouchPointerDown(target: Element) {
	const event = createEvent.pointerDown(target)
	Object.defineProperty(event, "pointerType", { value: "touch" })
	fireEvent(target, event)
}

describe("Reference media SourceList tooltip", () => {
	beforeEach(() => {
		mocks.loadAudio.mockClear()
		const poster = document.createElement("canvas")
		poster.width = 640
		poster.height = 360
		mocks.posterClone = poster
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: vi.fn(),
			clearRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
	})

	it("opens an image preview from a touch press and keeps the file name", () => {
		const { container } = renderWithTooltipProvider(
			<ReferenceImageLowPreview
				fileName="image.png"
				path="./images/image.png"
				fillParent
				inlineOriginal
				enableTooltip
			/>,
		)

		fireTouchPointerDown(getTooltipTrigger(container))

		const tooltip = screen.getByRole("tooltip")
		expect(tooltip).not.toHaveAttribute("data-reference-media-tooltip-fullscreen")
		expect(tooltip).toHaveStyle({ width: "250px", maxWidth: "250px" })
		expect(tooltip).toHaveTextContent("image.png")
		const image = tooltip.querySelector<HTMLImageElement>(
			'img[src="https://cdn.test/image-full.png"]',
		)
		expect(image).not.toBeNull()
		expect(image).toHaveStyle({ width: "250px", height: "141px" })
		expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "关闭预览" }))
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.stubGlobal(
			"ResizeObserver",
			vi.fn().mockImplementation(() => ({
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn(),
			})),
		)
	})

	it("opens an audio mini player from a touch press and closes outside", () => {
		const { container } = renderWithTooltipProvider(
			<ReferenceAudioPreview fileName="audio.mp3" path="./audios/audio.mp3" enableTooltip />,
		)

		fireTouchPointerDown(getTooltipTrigger(container))

		expect(mocks.loadAudio).toHaveBeenCalledOnce()
		const tooltip = screen.getByRole("tooltip")
		expect(tooltip).toHaveTextContent("audio.mp3")
		const audio = tooltip.querySelector("audio")
		expect(audio).toHaveAttribute("controls")
		expect(audio?.autoplay).toBe(false)

		fireEvent.pointerDown(document.body)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("opens a muted looping video preview and pauses it when closed", () => {
		const pause = vi.mocked(HTMLMediaElement.prototype.pause)
		const { container } = renderWithTooltipProvider(
			<ReferenceVideoPosterPreview
				fileName="video.mp4"
				path="./videos/video.mp4"
				enableTooltip
			/>,
		)

		fireTouchPointerDown(getTooltipTrigger(container))

		const video = screen.getByRole("tooltip").querySelector("video")
		expect(video).not.toBeNull()
		if (!video) throw new Error("Video preview not found")
		expect(video.muted).toBe(true)
		expect(video.loop).toBe(true)
		expect(video.autoplay).toBe(true)

		fireEvent.pointerDown(document.body)
		expect(pause).toHaveBeenCalled()
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})
})
