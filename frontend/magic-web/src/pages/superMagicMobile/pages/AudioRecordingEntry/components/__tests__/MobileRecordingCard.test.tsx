import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { MobileRecordingCard } from "../MobileRecordingCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"card.sourceRecorded": "Phone mic",
				"card.sourceImported": "Imported audio",
				"card.sourceDevice": "Device recording",
				"card.summarized": "Summarized",
				"card.summarizing": "Summarizing now",
				"card.notSummarized": "Not summarized",
				"card.generateSummary": "Generate summary",
				"card.retrySummary": "Retry summary",
				"card.moreActions": "More actions",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/utils/string", () => ({
	formatRelativeTime: () => () => "2h ago",
	formatTime: () => "Apr 10 09:15",
}))

vi.mock("i18next", () => ({
	default: {
		t: (key: string, options?: { datetime?: string }) => {
			if (key === "defaultName") return `${options?.datetime} recording`
			return key
		},
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

	it("shows disabled summarizing CTA instead of status chip while in progress", () => {
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
		const summarizeButton = screen.getByTestId("mobile-recording-card-summarize-proj-beta-002")
		expect(summarizeButton).toBeDisabled()
		expect(summarizeButton).toHaveTextContent("Summarizing now")
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

		expect(screen.getByText("--:--")).toBeInTheDocument()
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
