import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RecordingDetailHeader } from "../RecordingDetailHeader"
import {
	RECORDING_DETAIL_HEADER_ICON_ACTION_CLASS,
	RECORDING_DETAIL_HEADER_TEXT_ACTION_CLASS,
} from "../RecordingDetailHeaderActionMenu"

const localStorageMock = vi.hoisted(() => ({
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	key: vi.fn(),
	length: 0,
}))

const recordingCapabilitiesMock = vi.hoisted(() => ({
	current: {
		canRename: true,
		canGenerateSummary: true,
		canExport: true,
		canManageShare: true,
		canMoveGroup: true,
		canCopyToProject: true,
		canDelete: true,
	},
}))

Object.defineProperty(globalThis, "localStorage", {
	value: localStorageMock,
	writable: true,
})

vi.mock("@/models/config/stores/theme.store", () => ({
	themeStore: {
		theme: "light",
		syncDocumentDarkClass: vi.fn(),
		setTheme: vi.fn(),
	},
}))

vi.mock("../RecordingDetailProvider", () => ({
	useRecordingDetailCapabilities: () => recordingCapabilitiesMock.current,
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
					"card.regenerateSummary": "Regenerate summary",
					"card.moveToGroup": "Move to group",
					"card.moreActions": "More actions",
					"card.openProject": "View recording project",
					"card.copyToProject": "Copy to project",
					"card.notSummarized": "Not summarized",
					"card.summarized": "Summarized",
					"card.summarizing": "Summarizing",
					"card.summaryFailed": "Summary failed",
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
	onOpenProject: vi.fn(),
	onMoveGroup: vi.fn(),
	onCopyToProject: vi.fn(),
	onDelete: vi.fn(),
}

describe("RecordingDetailHeader action styling", () => {
	beforeEach(() => {
		recordingCapabilitiesMock.current = {
			canRename: true,
			canGenerateSummary: true,
			canExport: true,
			canManageShare: true,
			canMoveGroup: true,
			canCopyToProject: true,
			canDelete: true,
		}
	})

	it("places back button inline with title using bordered icon trigger", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		const backButton = screen.getByTestId("recording-detail-back")
		expect(backButton).toHaveClass(...RECORDING_DETAIL_HEADER_ICON_ACTION_CLASS.split(" "))
		expect(backButton).toHaveAttribute("aria-label", "Back")
		expect(screen.queryByText("Back")).not.toBeInTheDocument()
	})

	it("can hide the back button for share readonly shells", () => {
		render(<RecordingDetailHeader {...baseProps} showBackButton={false} />)

		expect(screen.queryByTestId("recording-detail-back")).not.toBeInTheDocument()
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

	it("opens the recording project from the first more-actions entry", () => {
		const onOpenProject = vi.fn()
		render(<RecordingDetailHeader {...baseProps} onOpenProject={onOpenProject} />)

		const trigger = screen.getByTestId("recording-detail-more-trigger")
		trigger.focus()
		fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })
		fireEvent.click(screen.getByTestId("recording-detail-open-project"))

		expect(onOpenProject).toHaveBeenCalledTimes(1)
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

	it("renders the summarized title badge with the prototype success tone", () => {
		render(<RecordingDetailHeader {...baseProps} />)

		const badge = screen.getByTestId("recording-detail-summary-status")
		expect(badge).toHaveTextContent("Summarized")
		expect(badge).toHaveClass("border-emerald-500/25", "bg-emerald-500/10")
	})

	it("hides generate summary CTA while summary generation is in progress", () => {
		render(
			<RecordingDetailHeader
				{...baseProps}
				projectItem={{
					...baseProps.projectItem,
					card_status: "summarizing",
					current_phase: "summarizing",
					phase_status: "in_progress",
				}}
				canGenerateSummary={false}
			/>,
		)

		expect(screen.queryByTestId("recording-detail-generate-summary")).not.toBeInTheDocument()
		const badge = screen.getByTestId("recording-detail-summary-status")
		expect(badge).toHaveTextContent("Summarizing")
		expect(badge).toHaveClass("border-sky-500/25", "bg-sky-500/10")
		expect(badge.querySelector("svg")).toHaveClass("animate-spin")
	})

	it("shows generate summary CTA when manual summary can be submitted", () => {
		render(
			<RecordingDetailHeader
				{...baseProps}
				projectItem={{
					...baseProps.projectItem,
					card_status: "not_summarized",
					current_phase: "merging",
					phase_status: "completed",
				}}
				canGenerateSummary
			/>,
		)

		expect(screen.getByTestId("recording-detail-generate-summary")).toHaveTextContent(
			"Generate summary",
		)
		const badge = screen.getByTestId("recording-detail-summary-status")
		expect(badge).toHaveTextContent("Not summarized")
		expect(badge).toHaveClass("border-amber-500/25", "bg-amber-500/10")
	})

	it("shows regenerate summary CTA when summary generation failed", () => {
		render(
			<RecordingDetailHeader
				{...baseProps}
				projectItem={{
					...baseProps.projectItem,
					card_status: "summary_failed",
					current_phase: "summarizing",
					phase_status: "failed",
				}}
				canGenerateSummary
			/>,
		)

		expect(screen.getByTestId("recording-detail-generate-summary")).toHaveTextContent(
			"Regenerate summary",
		)
		const badge = screen.getByTestId("recording-detail-summary-status")
		expect(badge).toHaveTextContent("Summary failed")
		expect(badge).toHaveClass("border-destructive/25", "bg-destructive/10")
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

	it("does not require or render copy action when the capability is disabled", () => {
		recordingCapabilitiesMock.current = {
			...recordingCapabilitiesMock.current,
			canCopyToProject: false,
			canDelete: false,
		}
		const shareLikeProps = { ...baseProps }
		delete (shareLikeProps as Partial<typeof baseProps>).onCopyToProject
		delete (shareLikeProps as Partial<typeof baseProps>).onOpenProject

		render(<RecordingDetailHeader {...shareLikeProps} />)

		expect(screen.getByTestId("recording-detail-more-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("recording-detail-copy-to-project")).not.toBeInTheDocument()
		expect(screen.queryByTestId("recording-detail-open-project")).not.toBeInTheDocument()
	})
})
