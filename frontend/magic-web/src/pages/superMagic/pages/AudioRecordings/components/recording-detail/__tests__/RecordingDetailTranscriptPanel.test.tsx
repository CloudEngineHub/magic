import type { MutableRefObject, ReactNode, Ref } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RecordingDetailProvider } from "../RecordingDetailProvider"
import { RecordingDetailTranscriptPanel } from "../RecordingDetailTranscriptPanel"

const scrollToMock = vi.fn()
const scrollIntoViewMock = vi.fn()
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"scrollIntoView",
)

/** Restores an HTMLElement method after a test replaces it with a deterministic mock. */
function restoreHTMLElementMethod(
	name: "scrollTo" | "scrollIntoView",
	descriptor?: PropertyDescriptor,
) {
	if (descriptor) {
		Object.defineProperty(HTMLElement.prototype, name, descriptor)
		return
	}
	Reflect.deleteProperty(HTMLElement.prototype, name)
}

/** Creates the DOMRect subset needed for scroll-position calculations. */
function createRect(top: number, height: number): DOMRect {
	return {
		x: 0,
		y: top,
		width: 100,
		height,
		top,
		right: 100,
		bottom: top + height,
		left: 0,
		toJSON: () => ({}),
	}
}

beforeEach(() => {
	scrollToMock.mockReset()
	scrollIntoViewMock.mockReset()
	Object.defineProperty(HTMLElement.prototype, "scrollTo", {
		configurable: true,
		value: scrollToMock,
	})
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoViewMock,
	})
})

afterEach(() => {
	vi.restoreAllMocks()
	restoreHTMLElementMethod("scrollTo", originalScrollTo)
	restoreHTMLElementMethod("scrollIntoView", originalScrollIntoView)
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			params?: { count?: number; visibleCount?: number; totalCount?: number },
		) => {
			const labels: Record<string, string> = {
				"detail.tabs.transcript": "Transcript",
				"detail.transcriptSegmentCountSuffix": `${params?.count ?? 0} segments`,
				"detail.transcriptVisibleCount": `${params?.visibleCount ?? 0}/${params?.totalCount ?? 0} segments`,
				"detail.emptyTranscriptFiltered": "No transcript in this filter",
				"detail.speakerFilterAll": "All speakers",
				"detail.speakerFilterTitle": "Filter speakers",
				"detail.openSpeakerSettings": "Speakers",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({
		children,
		scrollPortRef,
		...props
	}: {
		children: ReactNode
		scrollPortRef?: Ref<HTMLDivElement | null>
		[key: string]: unknown
	}) => (
		<div
			ref={(element) => {
				if (element) {
					// Provide stable viewport metrics before the panel effect calculates the centered row position.
					Object.defineProperties(element, {
						clientHeight: { configurable: true, value: 200 },
						scrollHeight: { configurable: true, value: 500 },
						scrollTop: { configurable: true, writable: true, value: 20 },
					})
				}
				if (typeof scrollPortRef === "function") {
					scrollPortRef(element)
				} else if (scrollPortRef) {
					;(scrollPortRef as MutableRefObject<HTMLDivElement | null>).current = element
				}
			}}
			data-testid="desktop-transcript-scroll-edge-fade"
			data-props={JSON.stringify(props)}
		>
			{children}
		</div>
	),
}))

vi.mock("../RecordingDetailEmptyState", () => ({
	RecordingDetailEmptyState: () => <div data-testid="recording-detail-empty-state">empty</div>,
}))

vi.mock("../RecordingDetailRegionEmptySlot", () => ({
	RecordingDetailRegionEmptySlot: ({ children }: { children: ReactNode }) => (
		<div data-testid="recording-detail-region-empty-slot">{children}</div>
	),
}))

vi.mock("../RecordingSpeakerFilterControl", () => ({
	RecordingSpeakerFilterControl: ({
		onChange,
		selectedIds,
	}: {
		onChange: (speakerIds: string[]) => void
		selectedIds: string[]
	}) => (
		<button
			type="button"
			data-testid="recording-detail-open-speaker-filter"
			className="size-8 rounded-full border bg-white"
			onClick={() => onChange(selectedIds[0] ? [selectedIds[0]] : [])}
		>
			Filter speakers
		</button>
	),
}))

/** Wraps the transcript panel with owner capabilities so tests match the desktop runtime contract. */
function renderTranscriptPanel(
	currentTime: number,
	playing = true,
	onOpenSpeakerSettings = vi.fn(),
) {
	const onSegmentClick = vi.fn()
	const onSelectedSpeakerIdsChange = vi.fn()

	render(
		<RecordingDetailProvider
			capabilities={{
				canEditSpeakers: true,
				canRenameProject: true,
				canDeleteProject: true,
				canMoveProject: true,
				canExportAudio: true,
				canExportTranscript: true,
				canExportNotes: true,
				canExportSummary: true,
				canShareProject: true,
				canTriggerSummary: true,
			}}
		>
			<RecordingDetailTranscriptPanel
				segments={[
					{
						id: "segment-1",
						start: 5,
						end: 10,
						speaker: "Speaker-1",
						text: "Earlier line",
					},
					{
						id: "segment-2",
						start: 10,
						end: 15,
						speaker: "Speaker-1",
						text: "Active line",
					},
				]}
				playing={playing}
				currentTime={currentTime}
				availableSpeakerIds={["Speaker-1"]}
				selectedSpeakerIds={["Speaker-1"]}
				speakerNameMap={{ "Speaker-1": "Speaker-1" }}
				onSegmentClick={onSegmentClick}
				onSelectedSpeakerIdsChange={onSelectedSpeakerIdsChange}
				onOpenSpeakerSettings={onOpenSpeakerSettings}
			/>
		</RecordingDetailProvider>,
	)

	return { onSegmentClick, onSelectedSpeakerIdsChange }
}

describe("RecordingDetailTranscriptPanel", () => {
	it("keeps segment rows on the same box model while only emphasizing the active content", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
			if (this.dataset.testid === "desktop-transcript-scroll-edge-fade") {
				return createRect(100, 200)
			}
			if (this.dataset.segmentId === "segment-2") return createRect(250, 40)
			return createRect(0, 0)
		})

		renderTranscriptPanel(10)

		const panel = screen.getByTestId("recording-detail-transcript-panel")
		const scrollPort = screen.getByTestId("desktop-transcript-scroll-edge-fade")
		const segments = screen.getAllByTestId("recording-detail-transcript-segment")
		const inactiveSegment = segments[0]
		const activeSegment = segments[1]
		const inactiveTime = screen.getByText("00:05")
		const activeTime = screen.getByText("00:10")
		const inactiveText = screen.getByText("Earlier line")
		const activeText = screen.getByText("Active line")
		const speakerChips = screen.getAllByTestId("recording-detail-transcript-speaker-chip")
		const title = screen.getByTestId("recording-detail-transcript-title")
		const count = screen.getByTestId("recording-detail-transcript-count")
		const settingsButton = screen.getByTestId("recording-detail-open-speaker-settings")
		const settingsIcon = screen.getByTestId("recording-detail-speaker-settings-icon")
		const accessory = screen.getByTestId("recording-detail-open-speaker-filter")

		expect(panel).not.toHaveClass("border", "bg-card")
		expect(title).toHaveTextContent("Transcript")
		expect(count).toHaveTextContent("2 segments")
		expect(settingsButton).toHaveTextContent("Speakers")
		expect(settingsButton).toHaveClass("h-8", "px-3", "text-[12px]", "rounded-full", "gap-1.5")
		expect(settingsButton).not.toHaveClass("h-10", "px-4", "text-[14px]")
		expect(settingsIcon).toHaveClass("size-4", "shrink-0")
		expect(settingsIcon).toHaveAttribute("aria-hidden", "true")
		expect(accessory).toHaveClass("size-8", "rounded-full", "border", "bg-white")
		expect(inactiveSegment).toHaveClass("rounded-xl", "px-2", "py-2.5")
		expect(activeSegment).toHaveClass("rounded-xl", "px-2", "py-2.5")
		expect(inactiveSegment).toHaveClass("px-2")
		expect(activeSegment).not.toHaveClass("bg-muted")
		expect(activeSegment).not.toHaveClass("shadow")

		expect(inactiveTime).toHaveClass("text-foreground/35")
		expect(activeTime).toHaveClass("text-foreground")
		expect(inactiveText).toHaveClass("text-foreground/65")
		expect(activeText).toHaveClass("text-foreground")
		expect(speakerChips[0]).toHaveClass("opacity-70")
		expect(speakerChips[1]).not.toHaveClass("opacity-70")
		expect(scrollToMock).toHaveBeenCalledWith({ top: 90, behavior: "smooth" })
		expect(scrollToMock.mock.contexts[0]).toBe(scrollPort)
		expect(scrollIntoViewMock).not.toHaveBeenCalled()
	})

	it("does not highlight or auto-scroll when playback is paused at a segment time", () => {
		renderTranscriptPanel(10, false)

		const [inactiveTime, pausedTime] = screen.getAllByText(/00:(05|10)/)
		const inactiveText = screen.getByText("Earlier line")
		const pausedText = screen.getByText("Active line")
		const speakerChips = screen.getAllByTestId("recording-detail-transcript-speaker-chip")

		expect(inactiveTime).toHaveClass("text-foreground")
		expect(pausedTime).toHaveClass("text-foreground")
		expect(inactiveText).toHaveClass("text-foreground")
		expect(pausedText).toHaveClass("text-foreground")
		expect(speakerChips[0]).not.toHaveClass("opacity-70")
		expect(speakerChips[1]).not.toHaveClass("opacity-70")
		expect(scrollToMock).not.toHaveBeenCalled()
		expect(scrollIntoViewMock).not.toHaveBeenCalled()
	})

	it("keeps row seek and speaker settings interactions separate", () => {
		const onOpenSpeakerSettings = vi.fn()
		const { onSegmentClick } = renderTranscriptPanel(10, true, onOpenSpeakerSettings)

		fireEvent.click(screen.getByText("Earlier line"))
		expect(onSegmentClick).toHaveBeenCalledWith(
			expect.objectContaining({ id: "segment-1", start: 5 }),
		)

		fireEvent.click(screen.getAllByTestId("recording-detail-transcript-speaker-chip")[1])
		expect(onOpenSpeakerSettings).toHaveBeenCalledTimes(1)
		expect(onSegmentClick).toHaveBeenCalledTimes(1)
	})

	it("forwards speaker filter changes through the shared filter control", () => {
		const { onSelectedSpeakerIdsChange } = renderTranscriptPanel(10)

		fireEvent.click(screen.getByTestId("recording-detail-open-speaker-filter"))

		expect(onSelectedSpeakerIdsChange).toHaveBeenCalledWith(["Speaker-1"])
	})

	it("shows the filtered empty state when transcript exists but the selection hides every row", () => {
		render(
			<RecordingDetailProvider
				capabilities={{
					canEditSpeakers: true,
					canRenameProject: true,
					canDeleteProject: true,
					canMoveProject: true,
					canExportAudio: true,
					canExportTranscript: true,
					canExportNotes: true,
					canExportSummary: true,
					canShareProject: true,
					canTriggerSummary: true,
				}}
			>
				<RecordingDetailTranscriptPanel
					segments={[]}
					availableSpeakerIds={["Speaker-1"]}
					playing={false}
					currentTime={0}
					selectedSpeakerIds={["Speaker-1"]}
					speakerNameMap={{ "Speaker-1": "Speaker-1" }}
					totalSegmentsCount={2}
					onSegmentClick={vi.fn()}
					onSelectedSpeakerIdsChange={vi.fn()}
					onOpenSpeakerSettings={vi.fn()}
				/>
			</RecordingDetailProvider>,
		)

		expect(screen.getByTestId("recording-detail-transcript-filter-empty")).toHaveTextContent(
			"No transcript in this filter",
		)
	})

	it("keeps speaker settings available when filtering hides every transcript row", () => {
		render(
			<RecordingDetailProvider
				capabilities={{
					canEditSpeakers: true,
					canRenameProject: true,
					canDeleteProject: true,
					canMoveProject: true,
					canExportAudio: true,
					canExportTranscript: true,
					canExportNotes: true,
					canExportSummary: true,
					canShareProject: true,
					canTriggerSummary: true,
				}}
			>
				<RecordingDetailTranscriptPanel
					segments={[]}
					availableSpeakerIds={["Speaker-1"]}
					playing={false}
					currentTime={0}
					selectedSpeakerIds={["Speaker-1"]}
					speakerNameMap={{ "Speaker-1": "Speaker-1" }}
					totalSegmentsCount={2}
					onSegmentClick={vi.fn()}
					onSelectedSpeakerIdsChange={vi.fn()}
					onOpenSpeakerSettings={vi.fn()}
				/>
			</RecordingDetailProvider>,
		)

		expect(screen.getByTestId("recording-detail-open-speaker-settings")).not.toBeDisabled()
	})
})
