import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RecordingDetailProvider } from "../RecordingDetailProvider"
import { RecordingDetailTranscriptPanel } from "../RecordingDetailTranscriptPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: { count?: number }) => {
			const labels: Record<string, string> = {
				"detail.tabs.transcript": "Transcript",
				"detail.transcriptSegmentCountSuffix": `${params?.count ?? 0} segments`,
				"detail.openSpeakerSettings": "Open speaker settings",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({
		children,
		...props
	}: {
		children: ReactNode
		[key: string]: unknown
	}) => (
		<div data-testid="desktop-transcript-scroll-edge-fade" data-props={JSON.stringify(props)}>
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

/** Wraps the transcript panel with owner capabilities so tests match the desktop runtime contract. */
function renderTranscriptPanel(currentTime: number, onOpenSpeakerSettings = vi.fn()) {
	const onSegmentClick = vi.fn()

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
				currentTime={currentTime}
				speakerNameMap={{ "Speaker-1": "Speaker-1" }}
				onSegmentClick={onSegmentClick}
				onOpenSpeakerSettings={onOpenSpeakerSettings}
			/>
		</RecordingDetailProvider>,
	)

	return { onSegmentClick }
}

describe("RecordingDetailTranscriptPanel", () => {
	it("keeps segment rows on the same box model while only emphasizing the active content", () => {
		const scrollIntoViewMock = vi.fn()
		const originalScrollIntoView = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"scrollIntoView",
		)
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoViewMock,
		})

		renderTranscriptPanel(10)

		const panel = screen.getByTestId("recording-detail-transcript-panel")
		const segments = screen.getAllByTestId("recording-detail-transcript-segment")
		const inactiveSegment = segments[0]
		const activeSegment = segments[1]
		const inactiveTime = screen.getByText("0:05")
		const activeTime = screen.getByText("0:10")
		const inactiveText = screen.getByText("Earlier line")
		const activeText = screen.getByText("Active line")
		const speakerChips = screen.getAllByTestId("recording-detail-transcript-speaker-chip")
		const title = screen.getByTestId("recording-detail-transcript-title")
		const count = screen.getByTestId("recording-detail-transcript-count")
		const settingsButton = screen.getByTestId("recording-detail-open-speaker-settings")
		const accessory = screen.getByTestId("recording-detail-transcript-header-accessory")

		expect(panel).not.toHaveClass("border", "bg-card")
		expect(title).toHaveTextContent("Transcript")
		expect(count).toHaveTextContent("2 segments")
		expect(settingsButton).toHaveClass("h-8", "px-3", "text-[12px]", "rounded-full")
		expect(settingsButton).not.toHaveClass("h-10", "px-4", "text-[14px]")
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
		expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center", behavior: "smooth" })

		if (originalScrollIntoView) {
			Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
		}
	})

	it("keeps row seek and speaker settings interactions separate", () => {
		const onOpenSpeakerSettings = vi.fn()
		const { onSegmentClick } = renderTranscriptPanel(10, onOpenSpeakerSettings)

		fireEvent.click(screen.getByText("Earlier line"))
		expect(onSegmentClick).toHaveBeenCalledWith(
			expect.objectContaining({ id: "segment-1", start: 5 }),
		)

		fireEvent.click(screen.getAllByTestId("recording-detail-transcript-speaker-chip")[1])
		expect(onOpenSpeakerSettings).toHaveBeenCalledTimes(1)
		expect(onSegmentClick).toHaveBeenCalledTimes(1)
	})
})
