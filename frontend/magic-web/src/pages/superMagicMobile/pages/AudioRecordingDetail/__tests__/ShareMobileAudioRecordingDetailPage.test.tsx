import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ShareMobileAudioRecordingDetailPage from "../ShareMobileAudioRecordingDetailPage"

const {
	useShareRecordingDetailDataMock,
	sourcePanelPropsMock,
	summaryPanelPropsMock,
	sheetPropsMock,
} = vi.hoisted(() => ({
	useShareRecordingDetailDataMock: vi.fn(),
	sourcePanelPropsMock: vi.fn(),
	summaryPanelPropsMock: vi.fn(),
	sheetPropsMock: vi.fn(),
}))

/** Builds deterministic readonly share data so UI tests never rely on real recording content. */
function createShareDetailData() {
	return {
		loading: false,
		error: null,
		fileMap: {
			audio: { file_id: "audio-share-001", file_name: "share-audio.wav" },
			transcript: { file_id: "transcript-share-001", file_name: "share-transcript.md" },
			notes: { file_id: "notes-share-001", file_name: "share-notes.md" },
			summaryFiles: [{ type: "summary", file: { file_id: "summary-share-001" } }],
			magicProjectConfig: {
				metadata: {
					speakers: { "Speaker-1": "Speaker A" },
				},
			},
		},
		texts: {
			transcript: { content: "mock transcript" },
			notes: { content: "mock notes" },
			summary: { summary: { content: "mock summary" }, topics: { content: "" } },
		},
		audioUrl: "https://example.com/mock-audio.wav",
		title: "Mock Share Recording",
		attachmentList: [],
	}
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.loading": "Loading",
				"detail.loadFailed": "Load failed",
				"detail.untitled": "Untitled",
				"detail.tabs.source": "Source",
				"detail.tabs.summaryRoot": "Summary",
				"card.moreActions": "More actions",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/hooks/useShareRecordingDetailData", () => ({
	useShareRecordingDetailData: (...args: unknown[]) => useShareRecordingDetailDataMock(...args),
}))

vi.mock("../hooks/useMobileRecordingAudioPlayer", () => ({
	useMobileRecordingAudioPlayer: () => ({
		audioRef: { current: null },
		playing: false,
		currentTime: 0,
		duration: 180,
		playbackRate: 1,
		toggle: vi.fn(),
		seekTo: vi.fn(),
		playSegment: vi.fn(),
		setPlaybackRate: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingPlayerCurrentSec", () => ({
	useRecordingPlayerCurrentSec: () => 0,
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingColorSegments", () => ({
	useRecordingColorSegments: () => [],
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/download-recording-audio", () => ({
	downloadRecordingAudioFile: vi.fn(),
}))

vi.mock("../components/MobileRecordingSourcePanel", () => ({
	MobileRecordingSourcePanel: (props: unknown) => {
		sourcePanelPropsMock(props)
		return <div data-testid="mock-source-panel">Source panel</div>
	},
}))

vi.mock("../components/MobileRecordingSummaryPanel", () => ({
	MobileRecordingSummaryPanel: (props: unknown) => {
		summaryPanelPropsMock(props)
		return <div data-testid="mock-summary-panel">Summary panel</div>
	},
}))

vi.mock("../components/MobileRecordingAudioPlayer", () => ({
	MobileRecordingAudioPlayer: ({ hidden }: { hidden?: boolean }) => (
		<div data-testid="mock-audio-player" data-hidden={hidden ? "true" : "false"}>
			Player
		</div>
	),
}))

vi.mock("../components/MobileRecordingShareExportSheet", () => ({
	MobileRecordingShareExportSheet: (props: {
		open: boolean
		showShareSection?: boolean
		allowDownload?: boolean
		onOpenChange: (open: boolean) => void
		onSearch?: () => void
	}) => {
		sheetPropsMock(props)
		if (!props.open) return null
		return (
			<div data-testid="mobile-recording-share-export-sheet">
				<div>{props.showShareSection ? "Share visible" : "Share hidden"}</div>
				<div>{props.allowDownload ? "Download allowed" : "Download blocked"}</div>
				<button type="button" onClick={() => props.onOpenChange(false)}>
					Close
				</button>
				{props.onSearch ? (
					<button type="button" onClick={props.onSearch}>
						Search content
					</button>
				) : null}
			</div>
		)
	},
}))

describe("ShareMobileAudioRecordingDetailPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useShareRecordingDetailDataMock.mockReturnValue(createShareDetailData())
	})

	it("renders the readonly share header without a direct export button", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				attachments={{ tree: [], list: [] }}
			/>,
		)

		expect(screen.getByText("Source")).toBeInTheDocument()
		expect(screen.getByText("Summary")).toBeInTheDocument()
		expect(screen.getByText("Mock Share Recording")).toBeInTheDocument()
		expect(screen.getByLabelText("More actions")).toBeInTheDocument()
		expect(screen.queryByLabelText("detail.exportSection")).not.toBeInTheDocument()
	})

	it("applies the external share topbar offset to the page root and sticky header", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				topbarOffset="calc(52px + var(--safe-area-inset-top,0px))"
				attachments={{ tree: [], list: [] }}
			/>,
		)

		expect(screen.getByTestId("mobile-recording-share-page")).toHaveStyle({
			paddingTop: "calc(52px + var(--safe-area-inset-top,0px))",
		})
		expect(screen.getByTestId("mobile-recording-share-sticky-header")).toHaveStyle({
			top: "calc(52px + var(--safe-area-inset-top,0px))",
		})
	})

	it("opens the export sheet from the more button and keeps share actions hidden", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				attachments={{ tree: [], list: [] }}
			/>,
		)

		fireEvent.click(screen.getByLabelText("More actions"))

		expect(screen.getByTestId("mobile-recording-share-export-sheet")).toBeInTheDocument()
		expect(screen.getByText("Share hidden")).toBeInTheDocument()
		expect(sheetPropsMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				open: true,
				showShareSection: false,
				allowDownload: true,
			}),
		)
	})

	it("adds extra bottom reading room on top of the floating player offset", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				attachments={{ tree: [], list: [] }}
			/>,
		)

		expect(summaryPanelPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				scrollPaddingBottom: 96,
			}),
		)

		fireEvent.click(screen.getByRole("button", { name: "Source" }))

		expect(sourcePanelPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				scrollPaddingBottom: 96,
			}),
		)
	})

	it("switches between source and summary tabs without changing readonly behavior", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				attachments={{ tree: [], list: [] }}
			/>,
		)

		expect(screen.getByTestId("mock-summary-panel")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Source" }))
		expect(screen.getByTestId("mock-source-panel")).toBeInTheDocument()
		expect(sourcePanelPropsMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				availableSpeakerIds: [],
				selectedSpeakerIds: [],
				onSelectedSpeakerIdsChange: expect.any(Function),
			}),
		)
	})

	it("keeps search available when download permission is unavailable", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile={false}
				attachments={{ tree: [], list: [] }}
			/>,
		)

		fireEvent.click(screen.getByLabelText("More actions"))
		expect(screen.getByText("Download blocked")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Search content" }))
		expect(screen.getByTestId("mobile-recording-share-content-search-root")).toBeInTheDocument()
		expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-hidden", "true")
	})

	it("falls back to a zero offset when the outer share header is hidden", () => {
		render(
			<ShareMobileAudioRecordingDetailPage
				projectId="project-share-001"
				resourceName="Mock resource"
				allowDownloadProjectFile
				attachments={{ tree: [], list: [] }}
			/>,
		)

		expect(screen.getByTestId("mobile-recording-share-page")).toHaveStyle({
			paddingTop: "0px",
		})
		expect(screen.getByTestId("mobile-recording-share-sticky-header")).toHaveStyle({
			top: "0px",
		})
	})
})
