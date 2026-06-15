import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingSummaryPanel } from "../components/MobileRecordingSummaryPanel"

const scrollEdgeFadePropsMock = vi.fn()
const magicMarkmapPropsMock = vi.fn()

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.emptySummary": "No summary",
				"detail.emptySummaryFile": "No summary file",
				"detail.unsupportedSummaryFile": "Unsupported summary file",
				"detail.tabs.summary": "Minutes",
				"detail.tabs.topics": "Topics",
				"detail.tabs.highlights": "Highlights",
				"detail.tabs.insights": "Insights",
				"detail.tabs.mindmap": "Mindmap",
				"detail.tabs.followup": "Follow-up",
				"detail.tabs.powerDynamics": "Power Dynamics",
				"detail.tabs.intent": "Intent",
				"detail.tabs.unsupported": "Unsupported",
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
	}) => {
		scrollEdgeFadePropsMock(props)
		return <div data-testid="summary-scroll-edge-fade">{children}</div>
	},
}))

vi.mock("@/components/base/MagicMarkmap", () => ({
	default: (props: Record<string, unknown>) => {
		magicMarkmapPropsMock(props)
		return <div data-testid="mock-mindmap" />
	},
}))

vi.mock("../components/MobileRecordingMarkdownContent", () => ({
	MobileRecordingMarkdownContent: ({ content }: { content: string }) => (
		<div data-testid="summary-markdown-content">{content}</div>
	),
}))

describe("MobileRecordingSummaryPanel", () => {
	/** Reset shared spies so each summary-panel assertion only observes its own render cycle. */
	function resetSharedMocks() {
		scrollEdgeFadePropsMock.mockClear()
		magicMarkmapPropsMock.mockClear()
	}

	it("wraps summary markdown with the shared scroll shadow container", () => {
		resetSharedMocks()

		render(
			<MobileRecordingSummaryPanel
				summaryFiles={[
					{ type: "summary", fileId: "summary-file", fileName: "summary.md" },
					{ type: "highlights", fileId: "highlights-file", fileName: "highlights.md" },
				]}
				summaryContent={{
					summary: "Summary body",
					highlights: "Highlights body",
				}}
				scrollPaddingBottom={72}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onTimeClick={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("summary-scroll-edge-fade")).toBeInTheDocument()
		expect(scrollEdgeFadePropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fadeColor: "mobile-background",
				contentDeps: ["summary", 2, true],
				scrollClassName: "px-4",
			}),
		)
		expect(screen.getByTestId("summary-markdown-content")).toHaveTextContent("Summary body")
	})

	it("recomputes the scroll container when the active summary tab changes", () => {
		resetSharedMocks()

		render(
			<MobileRecordingSummaryPanel
				summaryFiles={[
					{ type: "summary", fileId: "summary-file", fileName: "summary.md" },
					{ type: "highlights", fileId: "highlights-file", fileName: "highlights.md" },
				]}
				summaryContent={{
					summary: "Summary body",
					highlights: "Highlights body",
				}}
				scrollPaddingBottom={72}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onTimeClick={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-summary-tab-highlights"))

		expect(scrollEdgeFadePropsMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				contentDeps: ["highlights", 2, true],
			}),
		)
		expect(screen.getByTestId("summary-markdown-content")).toHaveTextContent("Highlights body")
	})

	it("renders translated labels for each supported summary tab type", () => {
		resetSharedMocks()

		render(
			<MobileRecordingSummaryPanel
				summaryFiles={[
					{ type: "summary", fileId: "summary-file", fileName: "summary.md" },
					{ type: "topics", fileId: "topics-file", fileName: "topics.md" },
					{ type: "highlights", fileId: "highlights-file", fileName: "highlights.md" },
					{ type: "insights", fileId: "insights-file", fileName: "insights.md" },
					{ type: "mindmap", fileId: "mindmap-file", fileName: "mindmap.md" },
					{ type: "followup", fileId: "followup-file", fileName: "followup.md" },
					{ type: "power_dynamics", fileId: "power-file", fileName: "power.md" },
					{ type: "intent", fileId: "intent-file", fileName: "intent.md" },
					{ type: "unexpected_type", fileId: "unsupported-file", fileName: "unsupported.md" },
				]}
				summaryContent={{
					summary: "Summary body",
					topics: "## Topics",
					highlights: "Highlights body",
					insights: "Insights body",
					mindmap: "# Root",
					followup: "Follow-up body",
					power_dynamics: "Power body",
					intent: "Intent body",
					unexpected_type: "Unknown body",
				}}
				scrollPaddingBottom={72}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onTimeClick={vi.fn()}
			/>,
		)

		expect(screen.getByText("Minutes")).toBeInTheDocument()
		expect(screen.getByText("Topics")).toBeInTheDocument()
		expect(screen.getByText("Highlights")).toBeInTheDocument()
		expect(screen.getByText("Insights")).toBeInTheDocument()
		expect(screen.getByText("Mindmap")).toBeInTheDocument()
		expect(screen.getByText("Follow-up")).toBeInTheDocument()
		expect(screen.getByText("Power Dynamics")).toBeInTheDocument()
		expect(screen.getByText("Intent")).toBeInTheDocument()
		expect(screen.getByText("Unsupported")).toBeInTheDocument()
	})

	it("renders the empty summary state when no summary files are available", () => {
		resetSharedMocks()

		render(
			<MobileRecordingSummaryPanel
				summaryFiles={[]}
				summaryContent={{}}
				scrollPaddingBottom={72}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onTimeClick={vi.fn()}
			/>,
		)

		expect(screen.getByText("No summary")).toBeInTheDocument()
		expect(screen.queryByTestId("summary-scroll-edge-fade")).toBeNull()
	})

	it("overrides the mindmap canvas to use a solid mobile background", () => {
		resetSharedMocks()

		render(
			<MobileRecordingSummaryPanel
				summaryFiles={[{ type: "mindmap", fileId: "mindmap-file", fileName: "mindmap.md" }]}
				summaryContent={{ mindmap: "# Root\n## Child" }}
				scrollPaddingBottom={72}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onTimeClick={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mock-mindmap")).toBeInTheDocument()
		expect(magicMarkmapPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				className:
					"h-full min-h-[520px] bg-[#f7f7f8] [&_svg]:bg-[#f7f7f8] [&_svg]:[background-image:none]",
			}),
		)
	})
})
