import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import AudioRecordingCard from "../AudioRecordingCard"
import type { AudioProjectListItem } from "@/types/audioProject"

vi.mock("@/services/audioRecordings", () => ({
	ALL_RECORDING_GROUP_ID: "mock-all-group",
}))

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === "card.moreTags") return `+${options?.count}`
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
				"card.regenerateSummary": "Regenerate summary",
				"card.summarizing": "Summarizing",
				"card.notSummarized": "Not summarized",
				"card.openProject": "View recording project",
				"card.summarize": "Summarize",
				"card.generateSummary": "Generate summary",
				"card.retrySummary": "Retry",
				"card.retryMerge": "Retry",
				"card.collapseTags": "Collapse",
				"card.moreActions": "More actions",
				"card.rename": "Rename",
				"card.delete": "Delete",
				"mobile.recordingEntry.progress.uploading": "Uploading",
				"mobile.recordingEntry.progress.transferFailed": "Upload failed",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/utils/string", () => ({
	formatTime: (time: number, format?: string) => {
		if (format === "YYYY/MM/DD HH:mm") return "2026/06/06 11:05"
		return "Apr 10 09:15"
	},
}))

vi.mock("i18next", () => ({
	default: {
		t: (key: string, options?: { datetime?: string }) => {
			if (key === "defaultName") return `${options?.datetime} 的录音`
			return key
		},
	},
}))

function createItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "project-1",
		project_name: "Weekly sync",
		card_status: "summarized",
		is_summarized: true,
		created_at: 1710000000,
		duration: 754,
		tags: ["Team", "Review", "Extra"],
		device_id: "Redmi K70 Ultra",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		...overrides,
	}
}

describe("AudioRecordingCard", () => {
	it("opens detail when recording is summarized", () => {
		const onOpen = vi.fn()
		render(<AudioRecordingCard item={createItem()} onOpen={onOpen} />)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).toHaveBeenCalledTimes(1)
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-summarized"),
		).toBeInTheDocument()
	})

	it("opens preview when not_summarized item has audio_file_id", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
					audio_file_id: "mock-audio-file-001",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("shows generate summary button for merging completed items", () => {
		const onOpen = vi.fn()
		const onSummarize = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
					audio_file_id: "mock-audio-file-001",
				})}
				onOpen={onOpen}
				onSummarize={onSummarize}
			/>,
		)

		const button = screen.getByTestId("audio-recording-card-project-1-summary-button")
		expect(button).toHaveTextContent("Summarize")

		fireEvent.click(button)
		expect(onSummarize).toHaveBeenCalledTimes(1)
		expect(onOpen).not.toHaveBeenCalled()
	})

	it("shows summarizing spinner while summary is in progress and opens detail on click", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
					project_status: "",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).toHaveBeenCalledTimes(1)
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-summarizing"),
		).toHaveTextContent("Summarizing")
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-summarizing"),
		).toBeDisabled()
		expect(
			screen.queryByTestId("audio-recording-card-project-1-summary-button"),
		).not.toBeInTheDocument()
	})

	it("shows processing status and does not open detail while merging is in progress", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "processing",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "in_progress",
					project_status: "",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).not.toHaveBeenCalled()
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-processing"),
		).toHaveTextContent("Processing")
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-processing"),
		).toBeDisabled()
		expect(
			screen.queryByTestId("audio-recording-card-project-1-summary-button"),
		).not.toBeInTheDocument()
	})

	it("shows waiting status and blocks navigation before merge begins", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "waiting",
					is_summarized: false,
					current_phase: "waiting",
					phase_status: null,
					project_status: "",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).not.toHaveBeenCalled()
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-waiting"),
		).toHaveTextContent("Waiting")
	})

	it("shows merge failed chip with retry placeholder action", () => {
		const onOpen = vi.fn()
		const onRetryMerge = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "merge_failed",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "failed",
					project_status: "",
				})}
				onOpen={onOpen}
				onRetryMerge={onRetryMerge}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).not.toHaveBeenCalled()
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-merge-failed"),
		).toHaveTextContent("Merge failed")
		expect(
			screen.getByTestId("audio-recording-card-project-1-merge-retry-button"),
		).toHaveTextContent("Retry")
		fireEvent.click(screen.getByTestId("audio-recording-card-project-1-merge-retry-button"))
		expect(onRetryMerge).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1" }))
	})

	it("opens detail for summarizing items without audio_file_id", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
					project_status: "",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("shows pending duration placeholder while summarizing duration is unavailable", () => {
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
					duration: 0,
				})}
			/>,
		)

		const durationEl = screen.getByTestId("audio-recording-card-project-1-duration")
		expect(durationEl).toHaveTextContent("--:--")
		expect(durationEl.querySelector(".animate-pulse")).toBeNull()
	})

	it("opens raw audio preview for summarizing items with audio_file_id", () => {
		const onOpen = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					audio_file_id: "mock-audio-file-001",
					current_phase: "summarizing",
					phase_status: "in_progress",
					project_status: "",
				})}
				onOpen={onOpen}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-card-project-1"))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("shows summary failed chip with retry summary button when summarizing failed", () => {
		const onSummarize = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "summary_failed",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "failed",
					project_status: "",
				})}
				onSummarize={onSummarize}
			/>,
		)

		expect(
			screen.getByTestId("audio-recording-card-project-1-status-summary-failed"),
		).toHaveTextContent("Summary failed")
		const button = screen.getByTestId("audio-recording-card-project-1-summary-button")
		expect(button).toHaveTextContent("Retry")
		fireEvent.click(button)
		expect(onSummarize).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1" }))
	})

	it("shows device id as source label for app recordings", () => {
		render(
			<AudioRecordingCard
				item={createItem({
					source: "app",
					device_id: "Redmi K70 Ultra",
					card_status: "not_summarized",
					is_summarized: false,
				})}
			/>,
		)

		expect(screen.getByTestId("audio-recording-card-project-1-source")).toHaveTextContent(
			"Redmi K70 Ultra",
		)
	})

	it("shows fixed PC label for pc source recordings", () => {
		render(
			<AudioRecordingCard
				item={createItem({
					source: "pc",
					device_id: "Web",
					card_status: "not_summarized",
					is_summarized: false,
				})}
			/>,
		)

		expect(screen.getByTestId("audio-recording-card-project-1-source")).toHaveTextContent("PC")
	})

	it("shows fixed phone label for h5 source recordings ignoring device_id", () => {
		render(
			<AudioRecordingCard
				item={createItem({
					source: "h5",
					device_id: "Web",
					card_status: "not_summarized",
					is_summarized: false,
				})}
			/>,
		)

		expect(screen.getByTestId("audio-recording-card-project-1-source")).toHaveTextContent(
			"Phone mic",
		)
	})

	it("keeps summarized badge on the same row as the device source", () => {
		render(<AudioRecordingCard item={createItem()} />)

		const sourceRow = screen.getByTestId("audio-recording-card-project-1-source-row")
		expect(sourceRow).toContainElement(
			screen.getByTestId("audio-recording-card-project-1-source"),
		)
		expect(sourceRow).toContainElement(
			screen.getByTestId("audio-recording-card-project-1-status-summarized"),
		)
		expect(
			screen.getByTestId("audio-recording-card-project-1-status-summarized"),
		).toHaveTextContent("Summarized")
	})

	it("renders duration in metadata row", () => {
		render(<AudioRecordingCard item={createItem({ duration: 754 })} />)

		expect(screen.getByTestId("audio-recording-card-project-1-duration")).toHaveTextContent(
			"12:34",
		)
	})

	it("uses neutral uploading colors that match the prototype hierarchy", () => {
		render(
			<AudioRecordingCard
				item={createItem({
					card_status: "uploading",
					is_summarized: false,
					transferStatus: "transferring",
					transferProgress: 0.45,
				})}
			/>,
		)

		const progressbar = screen.getByRole("progressbar")
		expect(progressbar).toHaveStyle({ background: "rgba(24, 24, 27, 0.08)" })
		expect(progressbar.firstElementChild).toHaveStyle({
			backgroundColor: "rgb(24, 24, 27)",
		})
		expect(screen.getByText("Uploading")).toHaveStyle({ color: "rgb(24, 24, 27)" })
		expect(screen.getByText("45%")).toHaveStyle({ color: "rgb(24, 24, 27)" })
	})

	it("renders the more-actions menu trigger", () => {
		render(<AudioRecordingCard item={createItem()} onRename={vi.fn()} onDelete={vi.fn()} />)

		expect(
			screen.getByTestId("audio-recording-card-project-1-more-actions"),
		).toBeInTheDocument()
	})

	it("opens the recording project action without opening the recording preview", () => {
		const onOpen = vi.fn()
		const onOpenProject = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem()}
				onOpen={onOpen}
				onOpenProject={onOpenProject}
				onRename={vi.fn()}
				onDelete={vi.fn()}
			/>,
		)

		const trigger = screen.getByTestId("audio-recording-card-project-1-more-actions")
		trigger.focus()
		fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })
		fireEvent.click(screen.getByTestId("audio-recording-card-project-1-action-open-project"))

		expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1" }))
		expect(onOpen).not.toHaveBeenCalled()
	})

	it("shows created_at fallback title when project name is empty", () => {
		render(<AudioRecordingCard item={createItem({ project_name: "" })} />)

		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
			"2026/06/06 11:05 的录音",
		)
	})

	it("shows regenerate option in more-actions dropdown for summarized items", async () => {
		const onSummarize = vi.fn()
		render(
			<AudioRecordingCard
				item={createItem({ card_status: "summarized" })}
				onSummarize={onSummarize}
			/>,
		)

		const trigger = screen.getByTestId("audio-recording-card-project-1-more-actions")
		trigger.focus()
		fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })

		fireEvent.click(
			await screen.findByTestId("audio-recording-card-project-1-action-regenerate"),
		)
		expect(onSummarize).toHaveBeenCalledWith(expect.objectContaining({ id: "project-1" }))
	})
})
