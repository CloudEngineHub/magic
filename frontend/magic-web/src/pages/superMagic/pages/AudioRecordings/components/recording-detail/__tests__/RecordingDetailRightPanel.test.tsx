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
	RecordingDetailTabStrip: ({ tabs }: { tabs: Array<{ key: string }> }) => (
		<div data-testid="summary-tabs">
			{tabs.map((tab) => (
				<span key={tab.key} data-testid={`summary-tab-${tab.key}`} />
			))}
		</div>
	),
}))

vi.mock("../RecordingDetailEmptyState", () => ({
	RecordingDetailEmptyState: () => <div data-testid="empty-state" />,
}))

vi.mock("../RecordingMarkdownContent", () => ({
	RecordingMarkdownContent: (props: { attachments?: unknown[]; relativeFilePath?: string }) => (
		<div
			data-testid="markdown-content"
			data-attachment-count={props.attachments?.length ?? 0}
			data-relative-file-path={props.relativeFilePath ?? ""}
		/>
	),
}))

vi.mock("../RecordingSummaryContent", () => ({
	RecordingSummaryContent: (props: { attachmentTree?: unknown[] }) => (
		<div
			data-testid="summary-content"
			data-attachment-count={props.attachmentTree?.length ?? 0}
		/>
	),
}))

vi.mock("../resolve-summary-type-label", () => ({
	resolveSummaryTypeLabel: (type: string) => type,
}))

const baseProps = {
	fileMap: null,
	summaryContent: {},
	attachmentList: [],
	attachmentTree: [],
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
		render(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				fileMap={{
					summaryFiles: [],
					magicProjectConfig: { files: { notes: "notes/mock-notes.md" } },
				}}
			/>,
		)

		const panel = screen.getByTestId("recording-detail-right-panel")
		expect(panel).toHaveClass("h-full", "min-h-0")
		expect(panel).not.toHaveClass("min-h-[560px]")
		expect(screen.getByTestId("summary-tabs")).toBeInTheDocument()
	})

	it("passes note image lookup context to the markdown renderer", () => {
		render(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				fileMap={{
					summaryFiles: [],
					notes: {
						file_id: "mock-notes-file",
						file_name: "mock-notes.md",
					},
					magicProjectConfig: { files: { notes: "notes/mock-notes.md" } },
				}}
				notesContent="![mock](./images/mock.png)"
				attachmentTree={[
					{
						file_id: "mock-file",
						file_name: "mock.png",
						relative_file_path: "images/mock.png",
					},
				]}
				notesFilePath="notes/mock.md"
			/>,
		)

		const markdown = screen.getByTestId("markdown-content")
		expect(markdown).toHaveAttribute("data-attachment-count", "1")
		expect(markdown).toHaveAttribute("data-relative-file-path", "notes/mock.md")
	})

	it("shows notes only when the bundle config declares them", () => {
		const { rerender } = render(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				fileMap={{
					summaryFiles: [],
					magicProjectConfig: { files: { notes: "notes/mock-notes.md" } },
				}}
			/>,
		)

		expect(screen.getByTestId("summary-tab-notes")).toBeInTheDocument()

		rerender(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				fileMap={{
					summaryFiles: [],
					notes: { file_id: "fallback-notes-file", file_name: "fallback-notes.md" },
				}}
			/>,
		)

		expect(screen.queryByTestId("summary-tab-notes")).not.toBeInTheDocument()
	})

	it("keeps the share visibility gate in addition to the bundle config", () => {
		render(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				showNotesTab={false}
				fileMap={{
					summaryFiles: [],
					magicProjectConfig: { files: { notes: "notes/mock-notes.md" } },
				}}
			/>,
		)

		expect(screen.queryByTestId("summary-tab-notes")).not.toBeInTheDocument()
	})

	it("passes attachment context to markdown summary content", () => {
		render(
			<RecordingDetailRightPanel
				{...baseProps}
				summaryReady
				fileMap={{
					summaryFiles: [
						{
							type: "summary",
							fileName: "summary.md",
							file: {
								file_id: "mock-summary-file",
								file_name: "summary.md",
								relative_file_path: "summary.md",
							},
						},
					],
				}}
				summaryContent={{ summary: "![mock](./images/mock.png)" }}
				attachmentTree={[
					{
						file_id: "mock-image-file",
						file_name: "mock.png",
						relative_file_path: "images/mock.png",
					},
				]}
			/>,
		)

		expect(screen.getByTestId("summary-content")).toHaveAttribute("data-attachment-count", "1")
	})
})
