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

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => {
				const labels: Record<string, string> = {
					"detail.back": "Back",
					"detail.exportSection": "Export",
					"detail.share": "Share",
					"detail.exportRecording": "Export recording",
					"detail.exportTranscript": "Export transcript",
					"detail.exportNotes": "Export notes",
					"detail.exportSummary": "Export summary",
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
	canGenerateSummary: true,
	summarySubmitting: false,
	onBack: vi.fn(),
	onRename: vi.fn(async () => true),
	onGenerateSummary: vi.fn(),
	onExportAudio: vi.fn(),
	onExportUnavailable: vi.fn(),
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
})
