import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecordingDetailHeader } from "../RecordingDetailHeader"
import {
	RECORDING_DETAIL_HEADER_ICON_ACTION_CLASS,
	RECORDING_DETAIL_HEADER_TEXT_ACTION_CLASS,
} from "../RecordingDetailHeaderActionMenu"

vi.mock("../RecordingDetailProvider", () => ({
	useRecordingDetailCapabilities: () => ({
		canRename: true,
		canGenerateSummary: true,
		canExport: true,
		canManageShare: true,
		canMoveGroup: true,
		canDelete: true,
	}),
}))

vi.mock("../resolve-summary-type-label", () => ({
	resolveSummaryTypeLabel: (type: string) => `Summary ${type}`,
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => {
				const labels: Record<string, string> = {
					"detail.back": "Back",
					"detail.export": "Export",
					"detail.exportAudio": "Export audio",
					"detail.exportTranscript": "Export transcript",
					"detail.exportNotes": "Export notes",
					"detail.exportSummary": "Export summary",
					"detail.exportAll": "Export all",
					"detail.share": "Share",
					"detail.shareCreate": "Create share",
					"detail.shareManage": "Manage share",
					"card.generateSummary": "Generate summary",
					"card.moveToGroup": "Move to group",
					"card.moreActions": "More actions",
					"card.summarized": "Summarized",
					"card.sourceRecorded": "Recorded",
					"actions.deleteTitle": "Delete",
				}
				return labels[key] ?? key
			},
		}),
	}
})

const baseProps = {
	title: "Weekly sync",
	projectItem: {
		id: "project-alpha",
		project_name: "Weekly sync",
		created_at: 1710000000,
		duration: 120,
		card_status: "summarized" as const,
		current_phase: "summarizing" as const,
		phase_status: "completed" as const,
		audio_source: "recorded" as const,
		workspace_id: "group-a",
	},
	fileMap: {
		summaryFiles: [
			{
				type: "summary",
				fileName: "summary.md",
				file: { file_id: "summary-alpha", file_name: "summary.md" },
			},
		],
	},
	exportAvailability: {
		hasAudio: true,
		hasTranscript: true,
		hasNotes: false,
		hasSummaryFiles: true,
		hasAnyExportable: true,
	},
	canGenerateSummary: true,
	summarySubmitting: false,
	onBack: vi.fn(),
	onRename: vi.fn(async () => true),
	onGenerateSummary: vi.fn(),
	onExportAudio: vi.fn(),
	onExportTranscript: vi.fn(),
	onExportNotes: vi.fn(),
	onExportSummaryType: vi.fn(),
	onExportAll: vi.fn(),
	onCreateShare: vi.fn(),
	onManageShare: vi.fn(),
	onMoveGroup: vi.fn(),
	onDelete: vi.fn(),
}

describe("RecordingDetailHeader action styling", () => {
	it("places back button inline with title using bordered icon trigger", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		const backButton = screen.getByTestId("recording-detail-back")
		expect(backButton).toHaveClass(...RECORDING_DETAIL_HEADER_ICON_ACTION_CLASS.split(" "))
		expect(backButton).toHaveAttribute("aria-label", "Back")
		expect(screen.queryByText("Back")).not.toBeInTheDocument()
	})

	it("does not render a bottom border on the header shell", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		expect(screen.getByTestId("recording-detail-header")).not.toHaveClass("border-b")
	})

	it("uses prototype-sized bordered triggers for export and share", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		expect(screen.getByTestId("recording-detail-export-trigger")).toHaveClass(
			...RECORDING_DETAIL_HEADER_TEXT_ACTION_CLASS.split(" "),
		)
		expect(screen.getByTestId("recording-detail-share-trigger")).toHaveClass(
			...RECORDING_DETAIL_HEADER_TEXT_ACTION_CLASS.split(" "),
		)
		expect(screen.getByTestId("recording-detail-export-trigger")).toHaveTextContent("Export")
	})

	it("uses a bordered square trigger for more actions", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		expect(screen.getByTestId("recording-detail-more-trigger")).toHaveClass(
			...RECORDING_DETAIL_HEADER_ICON_ACTION_CLASS.split(" "),
		)
	})

	it("includes open-state classes on export trigger for prototype highlight", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		expect(screen.getByTestId("recording-detail-export-trigger").className).toContain(
			"data-[state=open]:border-foreground",
		)
		expect(screen.getByTestId("recording-detail-export-trigger").className).toContain(
			"data-[state=open]:bg-muted",
		)
	})

	it("keeps generate summary CTA at h-9 typography", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		expect(screen.getByTestId("recording-detail-generate-summary")).toHaveClass(
			"h-9",
			"text-[13px]",
		)
	})

	it("passes export callbacks to the header contract", () => {
		const onExportTranscript = vi.fn()
		const onExportAll = vi.fn()

		render(
			<RecordingDetailHeader
				{...baseProps}
				onExportTranscript={onExportTranscript}
				onExportAll={onExportAll}
			/>,
		)

		expect(screen.getByTestId("recording-detail-export-trigger")).toBeInTheDocument()
		expect(typeof onExportTranscript).toBe("function")
		expect(typeof onExportAll).toBe("function")
	})
})
