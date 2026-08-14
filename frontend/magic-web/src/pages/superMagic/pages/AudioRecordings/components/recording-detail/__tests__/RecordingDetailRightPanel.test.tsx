import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RecordingDetailRightPanel } from "../RecordingDetailRightPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("../RecordingDetailSummaryState", () => ({
	RecordingDetailSummaryState: () => <div data-testid="summary-state" />,
}))

vi.mock("../RecordingDetailTabStrip", () => ({
	RecordingDetailTabStrip: () => <div data-testid="summary-tabs" />,
}))

vi.mock("../RecordingDetailEmptyState", () => ({
	RecordingDetailEmptyState: () => <div data-testid="empty-state" />,
}))

vi.mock("../RecordingMarkdownContent", () => ({
	RecordingMarkdownContent: () => <div data-testid="markdown-content" />,
}))

vi.mock("../RecordingSummaryContent", () => ({
	RecordingSummaryContent: () => <div data-testid="summary-content" />,
}))

vi.mock("../resolve-summary-type-label", () => ({
	resolveSummaryTypeLabel: (type: string) => type,
}))

const baseProps = {
	fileMap: null,
	summaryContent: {},
	attachmentList: [],
	summaryReady: false,
	summarizing: false,
	summaryFailed: false,
	speakerNameMap: {},
	onOpenSpeakerSettings: vi.fn(),
	onTimeClick: vi.fn(),
}

describe("RecordingDetailRightPanel responsive height", () => {
	/** Verifies non-ready states do not create vertical overflow in a constrained workbench. */
	it("allows the pending summary panel to shrink with its parent", () => {
		render(<RecordingDetailRightPanel {...baseProps} />)

		const panel = screen.getByTestId("recording-detail-right-panel")
		expect(panel).toHaveClass("h-full", "min-h-0")
		expect(panel).not.toHaveClass("min-h-[560px]")
	})

	/** Verifies ready summary content uses the same shrinkable panel contract. */
	it("allows the ready summary panel to shrink with its parent", () => {
		render(<RecordingDetailRightPanel {...baseProps} summaryReady />)

		const panel = screen.getByTestId("recording-detail-right-panel")
		expect(panel).toHaveClass("h-full", "min-h-0")
		expect(panel).not.toHaveClass("min-h-[560px]")
		expect(screen.getByTestId("summary-tabs")).toBeInTheDocument()
	})
})
