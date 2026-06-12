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
})
