import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecordingDetailEmptyState } from "../components/recording-detail/RecordingDetailEmptyState"

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
})
