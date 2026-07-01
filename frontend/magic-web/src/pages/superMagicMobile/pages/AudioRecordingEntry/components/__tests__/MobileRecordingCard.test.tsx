import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { MobileRecordingCard } from "../MobileRecordingCard"

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"card.sourceRecorded": "Phone mic",
				"card.sourceImported": "Imported audio",
				"card.sourceDevice": "Device recording",
				"card.sourcePc": "PC",
				"card.summarized": "Summarized",
				"card.waiting": "Waiting",
				"card.summaryFailed": "Summary failed",
				"card.mergeFailed": "Merge failed",
				"card.processing": "Processing",
				"card.summarizing": "Summarizing now",
				"card.notSummarized": "Not summarized",
				"card.generateSummary": "Generate summary",
				"card.retrySummary": "Retry",
				"card.retryMerge": "Retry",
				"card.moreActions": "More actions",
				"mobile.recordingEntry.progress.uploading": "Uploading",
				"mobile.recordingEntry.progress.transferFailed": "Upload failed",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/utils/string", () => ({
	formatRelativeTime: () => () => "2h ago",
	formatTime: () => "Apr 10 09:15",
}))

vi.mock("@/services/audioRecordings", () => ({
	ALL_RECORDING_GROUP_ID: "mock-all-group",
}))

vi.mock("i18next", () => ({
	default: {
		t: (key: string, options?: { datetime?: string }) => {
			if (key === "defaultName") return `${options?.datetime} recording`
			return key
		},
		use: vi.fn().mockReturnThis(),
	},
}))

/** Builds a fictional list item for card tests — no real IDs or names */
function createItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "proj-beta-002",
		project_name: "Weekly sync notes",
		card_status: "summarized",
		is_summarized: true,
		created_at: 1710000000,
		duration: 754,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		...overrides,
	}
}

describe("MobileRecordingCard", () => {
	it("shows summarized badge and navigates on card click", () => {
		const onOpen = vi.fn()
		render(<MobileRecordingCard item={createItem()} onOpen={onOpen} />)

		expect(screen.getByText("Summarized")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("mobile-recording-card-proj-beta-002"))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("shows summarize CTA for not_summarized items ready to summarize", () => {
		const onSummarize = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
					task_key: "task-mock-001",
					topic_id: "topic-mock-001",
				})}
				onSummarize={onSummarize}
			/>,
		)

		const summarizeButton = screen.getByTestId("mobile-recording-card-summarize-proj-beta-002")
		expect(summarizeButton).toBeInTheDocument()
		fireEvent.click(summarizeButton)
		expect(onSummarize).toHaveBeenCalledTimes(1)
	})

	it("hides summarize CTA when item is already summarized", () => {
		render(<MobileRecordingCard item={createItem()} />)

		expect(screen.queryByTestId("mobile-recording-card-summarize-proj-beta-002")).toBeNull()
	})

	it("does not show not-summarized badge for pending items", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
					task_key: "task-mock-001",
					topic_id: "topic-mock-001",
				})}
			/>,
		)

		expect(screen.queryByText("Not summarized")).toBeNull()
		expect(screen.getByText("Generate summary")).toBeInTheDocument()
	})

	it("shows summarizing indicator instead of status chip while in progress", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
				})}
			/>,
		)

		expect(screen.queryByText("Not summarized")).toBeNull()
		const summarizeIndicator = screen.getByTestId(
			"mobile-recording-card-summarize-proj-beta-002",
		)
		expect(summarizeIndicator.tagName).toBe("BUTTON")
		expect(summarizeIndicator).toBeDisabled()
		expect(summarizeIndicator).toHaveTextContent("Summarizing now")
	})

	it("shows processing indicator and blocks navigation while backend merge is running", () => {
		const onOpen = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "processing",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "in_progress",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-card-proj-beta-002"))
		expect(onOpen).not.toHaveBeenCalled()
		const processingIndicator = screen.getByTestId(
			"mobile-recording-card-summarize-proj-beta-002",
		)
		expect(processingIndicator.tagName).toBe("BUTTON")
		expect(processingIndicator).toBeDisabled()
		expect(processingIndicator).toHaveTextContent("Processing")
	})

	it("shows waiting indicator and blocks navigation before merge begins", () => {
		const onOpen = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "waiting",
					is_summarized: false,
					current_phase: "waiting",
					phase_status: null,
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-card-proj-beta-002"))
		expect(onOpen).not.toHaveBeenCalled()
		const waitingIndicator = screen.getByTestId("mobile-recording-card-summarize-proj-beta-002")
		expect(waitingIndicator.tagName).toBe("SPAN")
		expect(waitingIndicator).toHaveTextContent("Waiting")
	})

	it("shows merge failed chip without retry placeholder before retry API exists", () => {
		const onOpen = vi.fn()
		const onSummarize = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "merge_failed",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "failed",
				})}
				onOpen={onOpen}
				onSummarize={onSummarize}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-card-proj-beta-002"))
		expect(onOpen).not.toHaveBeenCalled()
		expect(screen.getByText("Merge failed")).toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-recording-card-merge-retry-proj-beta-002"),
		).not.toBeInTheDocument()
		expect(onSummarize).not.toHaveBeenCalled()
	})

	it("shows summary failed chip without retry summary button", () => {
		const onSummarize = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "summary_failed",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "failed",
				})}
				onSummarize={onSummarize}
			/>,
		)

		expect(screen.getByText("Summary failed")).toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-recording-card-summarize-proj-beta-002"),
		).not.toBeInTheDocument()
		expect(onSummarize).not.toHaveBeenCalled()
	})

	it("navigates when summarizing card is clicked even without audio_file_id", () => {
		const onOpen = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-card-proj-beta-002"))
		expect(onOpen).toHaveBeenCalledTimes(1)

		onOpen.mockClear()
		fireEvent.click(screen.getByTestId("mobile-recording-card-summarize-proj-beta-002"))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("shows duration fallback while summarizing duration is unavailable", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
					duration: 0,
				})}
			/>,
		)

		const durationPlaceholder = screen.getByText("--:--")
		expect(durationPlaceholder).toBeInTheDocument()
		expect(durationPlaceholder).not.toHaveClass("animate-pulse")
	})

	it("shows duration fallback for imported audio when duration is unavailable", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					audio_source: "imported",
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
					duration: 0,
				})}
			/>,
		)

		expect(screen.getByText("--:--")).toBeInTheDocument()
		expect(screen.getByText("Imported audio")).toBeInTheDocument()
	})

	it("shows formatted duration for imported audio when duration is available", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					audio_source: "imported",
					duration: 754,
				})}
			/>,
		)

		expect(screen.getByText("12:34")).toBeInTheDocument()
	})

	it("shows fixed PC label for pc source recordings", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					source: "pc",
					device_id: "Web",
				})}
			/>,
		)

		expect(screen.getByText("PC")).toBeInTheDocument()
	})

	it("shows fixed phone label for h5 source recordings ignoring device_id", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					source: "h5",
					device_id: "Web",
				})}
			/>,
		)

		expect(screen.getByText("Phone mic")).toBeInTheDocument()
	})

	it("renders transferring progress state and hides time meta", () => {
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "uploading",
					is_summarized: false,
					transferStatus: "transferring",
					transferProgress: 0.45,
				})}
			/>,
		)

		expect(screen.getByText("45%")).toBeInTheDocument()
		const progressbar = screen.getByRole("progressbar")
		expect(progressbar).toBeInTheDocument()
		expect(progressbar).toHaveAttribute("aria-valuenow", "45")
		expect(screen.queryByText("2h ago")).toBeNull()
		expect(progressbar).toHaveStyle({ background: "rgba(24, 24, 27, 0.08)" })
		expect(progressbar.firstElementChild).toHaveStyle({
			backgroundColor: "rgb(24, 24, 27)",
		})
		expect(screen.getByText("Uploading")).toHaveStyle({ color: "rgb(24, 24, 27)" })
		expect(screen.getByText("45%")).toHaveStyle({ color: "rgb(24, 24, 27)" })
	})

	it("renders failed state and triggers onRetry callback when clicked", () => {
		const onRetry = vi.fn()
		render(
			<MobileRecordingCard
				item={createItem({
					card_status: "upload_failed",
					is_summarized: false,
					transferStatus: "failed",
					transferProgress: 0.8,
				})}
				onRetry={onRetry}
			/>,
		)

		expect(screen.getByText("80%")).toBeInTheDocument()
		const retryButton = screen.getByTestId("mobile-recording-card-retry-proj-beta-002")
		expect(retryButton).toBeInTheDocument()
		fireEvent.click(retryButton)
		expect(onRetry).toHaveBeenCalledTimes(1)
	})
})
