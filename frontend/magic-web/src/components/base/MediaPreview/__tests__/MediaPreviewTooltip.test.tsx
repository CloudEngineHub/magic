import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/shadcn-ui/tooltip"
import { MediaPreviewThumbnail, MediaPreviewTooltip } from "../index"

const mobileState = { isMobile: false }

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => mobileState.isMobile,
}))

function renderTooltip(ui: ReactNode) {
	return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("MediaPreviewTooltip", () => {
	beforeEach(() => {
		mobileState.isMobile = false
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
	})

	it("opens when hovering the complete trigger and renders an image preview", async () => {
		const { container } = renderTooltip(
			<MediaPreviewTooltip
				mediaType="image"
				fileName="cover.png"
				previewUrl="https://cdn.test/cover.png"
				errorMessage="Preview failed"
				closeLabel="Close preview"
				audioLabels={{ play: "Play", pause: "Pause", progress: "Progress" }}
			>
				<span data-testid="mention-trigger">@cover.png</span>
			</MediaPreviewTooltip>,
		)

		fireEvent.pointerMove(
			container.querySelector("[data-media-preview-trigger]") as HTMLElement,
		)

		const tooltip = await screen.findByRole("tooltip")
		expect(tooltip).toHaveTextContent("cover.png")
		expect(tooltip).toHaveClass("z-tooltip")
		expect(tooltip.querySelector('img[src="https://cdn.test/cover.png"]')).not.toBeNull()
	})

	it("keeps the thumbnail on mobile without opening a tooltip", () => {
		mobileState.isMobile = true
		renderTooltip(
			<MediaPreviewTooltip
				mediaType="image"
				fileName="cover.png"
				previewUrl="https://cdn.test/cover.png"
				errorMessage="Preview failed"
				closeLabel="Close preview"
				audioLabels={{ play: "Play", pause: "Pause", progress: "Progress" }}
			>
				<span data-testid="mention-trigger">@cover.png</span>
			</MediaPreviewTooltip>,
		)

		const trigger = screen.getByTestId("mention-trigger")
		fireEvent.mouseMove(trigger)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("stops tooltip content interactions from bubbling to its parent", async () => {
		const parentClick = vi.fn()
		const parentMouseDown = vi.fn()
		const parentPointerDown = vi.fn()
		const { container } = renderTooltip(
			<div
				onClick={parentClick}
				onMouseDown={parentMouseDown}
				onPointerDown={parentPointerDown}
			>
				<MediaPreviewTooltip
					mediaType="image"
					fileName="cover.png"
					previewUrl="https://cdn.test/cover.png"
					errorMessage="Preview failed"
					closeLabel="Close preview"
					audioLabels={{ play: "Play", pause: "Pause", progress: "Progress" }}
				>
					<span>@cover.png</span>
				</MediaPreviewTooltip>
			</div>,
		)

		fireEvent.pointerMove(
			container.querySelector("[data-media-preview-trigger]") as HTMLElement,
		)
		const closeButton = await screen.findByRole("button", { name: "Close preview" })
		fireEvent.pointerDown(closeButton)
		fireEvent.mouseDown(closeButton)
		fireEvent.click(closeButton)

		expect(parentPointerDown).not.toHaveBeenCalled()
		expect(parentMouseDown).not.toHaveBeenCalled()
		expect(parentClick).not.toHaveBeenCalled()
	})

	it("autoplays a muted looping video and resets it when closed", async () => {
		const { container } = renderTooltip(
			<MediaPreviewTooltip
				mediaType="video"
				fileName="clip.mp4"
				previewUrl="https://cdn.test/clip.mp4"
				errorMessage="Preview failed"
				closeLabel="Close preview"
				audioLabels={{ play: "Play", pause: "Pause", progress: "Progress" }}
			>
				<span>@clip.mp4</span>
			</MediaPreviewTooltip>,
		)

		fireEvent.pointerMove(
			container.querySelector("[data-media-preview-trigger]") as HTMLElement,
		)
		const tooltip = await screen.findByRole("tooltip")
		const video = tooltip.querySelector("video") as HTMLVideoElement
		expect(video.muted).toBe(true)
		expect(video.loop).toBe(true)
		expect(video.autoplay).toBe(true)
		fireEvent.canPlay(video)
		await waitFor(() => expect(video.autoplay).toBe(true))

		fireEvent.click(screen.getByRole("button", { name: "Close preview" }))
		expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
		expect(video.currentTime).toBe(0)
	})

	it("renders the shared audio player and resets it when closed", async () => {
		const { container } = renderTooltip(
			<MediaPreviewTooltip
				mediaType="audio"
				fileName="voice.mp3"
				audioUrl="https://cdn.test/voice.mp3"
				errorMessage="Preview failed"
				closeLabel="Close preview"
				audioLabels={{ play: "Play", pause: "Pause", progress: "Progress" }}
			>
				<span>@voice.mp3</span>
			</MediaPreviewTooltip>,
		)

		fireEvent.pointerMove(
			container.querySelector("[data-media-preview-trigger]") as HTMLElement,
		)
		const tooltip = await screen.findByRole("tooltip")
		const audio = tooltip.querySelector("audio") as HTMLAudioElement
		const playButton = screen.getByRole("button", { name: "Play" })
		expect(playButton.querySelector('svg[fill="currentColor"]')).not.toBeNull()
		fireEvent.canPlay(audio)
		await waitFor(() => expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled())
		fireEvent.click(playButton)
		await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled())
		const pauseButton = await screen.findByRole("button", { name: "Pause" })
		expect(pauseButton.querySelector('svg[fill="currentColor"]')).not.toBeNull()
		const progress = screen.getByRole("slider", { name: "Progress" })
		expect(progress).toHaveClass("rounded-full")
		expect(progress).toHaveClass("[&::-webkit-slider-runnable-track]:h-0.5")
		expect(progress).toHaveClass("[&::-webkit-slider-thumb]:size-3")
		expect(progress.parentElement?.firstElementChild).toHaveClass("h-1.5")
		Object.defineProperty(audio, "duration", { configurable: true, value: 100 })
		fireEvent.loadedMetadata(audio)
		await waitFor(() => expect(progress).toHaveAttribute("max", "100"))
		let seekTime = 0
		Object.defineProperty(audio, "currentTime", {
			configurable: true,
			get: () => seekTime,
			set: (value: number) => {
				seekTime = value
			},
		})
		vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({
			bottom: 0,
			height: 12,
			left: 10,
			right: 210,
			top: 0,
			width: 200,
			x: 10,
			y: 0,
			toJSON: () => undefined,
		})
		const dispatchPointerEvent = (type: string, clientX: number) => {
			const event = new Event(type, { bubbles: true })
			Object.defineProperties(event, {
				clientX: { value: clientX },
				pointerId: { value: 1 },
			})
			fireEvent(progress, event)
		}
		dispatchPointerEvent("pointerdown", 60)
		expect(seekTime).toBe(25)
		dispatchPointerEvent("pointermove", 160)
		expect(seekTime).toBe(75)
		dispatchPointerEvent("pointerup", 160)
		expect(Number(progress.value)).toBe(75)
		Object.defineProperty(audio, "currentTime", {
			configurable: true,
			writable: true,
			value: 12,
		})
		fireEvent.click(screen.getByRole("button", { name: "Close preview" }))
		expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
		expect(audio.currentTime).toBe(0)
	})

	it("falls back when a thumbnail URL is missing or fails to load", () => {
		render(
			<MediaPreviewThumbnail
				mediaType="image"
				thumbnailUrl="https://cdn.test/missing.png"
				fallback={<span data-testid="fallback">file</span>}
			/>,
		)
		fireEvent.error(screen.getByRole("img"))
		expect(screen.getByTestId("fallback")).toBeInTheDocument()
	})
})
