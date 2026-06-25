import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
	RecordingDetailEmptyState,
	RecordingDetailPageSkeleton,
} from "../components/recording-detail/RecordingDetailEmptyState"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("RecordingDetailEmptyState", () => {
	it("renders transcript empty variant", () => {
		render(<RecordingDetailEmptyState variant="noTranscript" compact />)
		expect(screen.getByTestId("recording-detail-empty-noTranscript")).toBeInTheDocument()
		expect(screen.getByText("detail.emptyTranscript")).toBeInTheDocument()
	})

	it("renders summary pending variant", () => {
		render(<RecordingDetailEmptyState variant="summaryPending" />)
		expect(screen.getByTestId("recording-detail-empty-summaryPending")).toBeInTheDocument()
	})

	it("renders summary generating variant with spinning loader icon", () => {
		const { container } = render(<RecordingDetailEmptyState variant="summaryGenerating" />)
		expect(screen.getByTestId("recording-detail-empty-summaryGenerating")).toBeInTheDocument()
		expect(container.querySelector(".animate-spin")).toBeInTheDocument()
	})

	it("renders summary tab file empty variant with sparkles icon and emptySummary copy", () => {
		const { container } = render(<RecordingDetailEmptyState variant="noSummaryFile" compact />)
		expect(screen.getByTestId("recording-detail-empty-noSummaryFile")).toBeInTheDocument()
		expect(screen.getByText("detail.emptySummary")).toBeInTheDocument()
		expect(container.querySelector(".lucide-sparkles")).toBeTruthy()
	})

	it("renders page skeleton with shimmer blocks and fade-in transition", () => {
		const { container } = render(<RecordingDetailPageSkeleton />)
		const skeleton = screen.getByTestId("recording-detail-page-skeleton")

		expect(skeleton).toHaveClass("grid-cols-[400px_minmax(0,1fr)]")
		expect(skeleton).toHaveClass("animate-in", "fade-in")
		expect(skeleton).toHaveAttribute("aria-busy", "true")
		expect(container.querySelector(".animate-pulse")).toBeNull()
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
	})

	it("renders left column skeleton aligned with the borderless player and transcript layout", () => {
		render(<RecordingDetailPageSkeleton />)

		expect(screen.getByTestId("recording-detail-player-skeleton")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-transcript-skeleton")).toBeInTheDocument()
		expect(
			screen.getByTestId("recording-detail-transcript-skeleton").querySelector(".border-b"),
		).toBeNull()
	})
})
