import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { MobileRecordingShareExportSheet } from "../MobileRecordingShareExportSheet"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { target?: string }) => {
			const labels: Record<string, string> = {
				"detail.shareAndExport": "Share & Export",
				"detail.shareSection": "Share",
				"detail.shareLink": "Share link",
				"detail.exportSection": "Export files",
				"detail.exportRecording": "Recording",
				"detail.exportTranscript": "Transcript",
				"detail.exportNotes": "Notes",
				"detail.exportSummary": "Summary",
				"actions.cancel": "Cancel",
				"detail.exportContentLabel": "Select content to export",
				"detail.exportBtn": "Export {{target}}",
				"detail.tabs.summary": "Minutes",
				"detail.tabs.highlights": "Highlights",
			}
			let val = labels[key] ?? key
			if (options?.target) {
				val = val.replace("{{target}}", options.target)
			}
			return val
		},
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		headerTitle,
		headerSubtitle,
		headerLeadingAction,
	}: any) => {
		if (!visible) return null
		return (
			<div data-testid="mock-magic-popup">
				{headerTitle && <div>{headerTitle}</div>}
				{headerSubtitle && <div>{headerSubtitle}</div>}
				{headerLeadingAction && (
					<button
						data-testid={headerLeadingAction.testId}
						onClick={headerLeadingAction.onClick}
					>
						{headerLeadingAction.ariaLabel}
					</button>
				)}
				{children}
			</div>
		)
	},
}))

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
		loading: vi.fn(),
		dismiss: vi.fn(),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createBatchDownload: vi.fn().mockResolvedValue({ status: "ready", download_url: "http://mock-download.com/batch.zip" }),
		checkBatchDownloadStatus: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn().mockResolvedValue([{ url: "http://mock-download.com/file" }]),
	getFileContentById: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	downloadFileWithAnchor: vi.fn(),
}))

describe("MobileRecordingShareExportSheet", () => {
	const mockFileMap = {
		audio: { file_id: "audio-id", file_name: "audio.wav" },
		transcript: { file_id: "transcript-id", file_name: "transcript.md" },
		notes: { file_id: "notes-id", file_name: "notes.md" },
		summaryFiles: [
			{ type: "summary", file: { file_id: "sum-id", file_name: "summary.md" } },
			{ type: "highlights", file: { file_id: "hl-id", file_name: "highlights.md" } },
		],
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders main share and export menu", () => {
		render(
			<MobileRecordingShareExportSheet
				open
				recordingName="Prototype recording"
				fileMap={mockFileMap}
				onOpenChange={vi.fn()}
				onShareLink={vi.fn()}
				onDownloadRecording={vi.fn()}
			/>,
		)

		expect(screen.getByText("Share & Export")).toBeInTheDocument()
		expect(screen.getByText("Share")).toBeInTheDocument()
		expect(screen.getByText("Share link")).toBeInTheDocument()
		expect(screen.getByText("Export files")).toBeInTheDocument()
		expect(screen.getByText("Recording")).toBeInTheDocument()
		expect(screen.getByText("Transcript")).toBeInTheDocument()
		expect(screen.getByText("Notes")).toBeInTheDocument()
		expect(screen.getByText("Summary")).toBeInTheDocument()
	})

	it("triggers original audio download and transcript/notes downloads directly", async () => {
		const onDownloadRecording = vi.fn()
		render(
			<MobileRecordingShareExportSheet
				open
				recordingName="Prototype recording"
				fileMap={mockFileMap}
				onOpenChange={vi.fn()}
				onShareLink={vi.fn()}
				onDownloadRecording={onDownloadRecording}
			/>,
		)

		fireEvent.click(screen.getByText("Recording"))
		expect(onDownloadRecording).toHaveBeenCalledTimes(1)

		fireEvent.click(screen.getByText("Transcript"))
		// Wait for microtasks so async download triggers
		await Promise.resolve()
		expect(getTemporaryDownloadUrl).toHaveBeenCalledWith({ file_ids: ["transcript-id"] })
		expect(downloadFileWithAnchor).toHaveBeenCalledWith(
			"http://mock-download.com/file",
			"transcript.md",
		)

		fireEvent.click(screen.getByText("Notes"))
		await Promise.resolve()
		expect(getTemporaryDownloadUrl).toHaveBeenCalledWith({ file_ids: ["notes-id"] })
		expect(downloadFileWithAnchor).toHaveBeenCalledWith(
			"http://mock-download.com/file",
			"notes.md",
		)
	})

	it("transitions to summary view and downloads single selected file", async () => {
		const onOpenChange = vi.fn()
		render(
			<MobileRecordingShareExportSheet
				open
				recordingName="Prototype recording"
				fileMap={mockFileMap}
				onOpenChange={onOpenChange}
				onShareLink={vi.fn()}
				onDownloadRecording={vi.fn()}
			/>,
		)

		// Transition
		fireEvent.click(screen.getByText("Summary"))
		expect(screen.getByText("Select content to export")).toBeInTheDocument()
		expect(screen.getByText("Minutes")).toBeInTheDocument()
		expect(screen.getByText("Highlights")).toBeInTheDocument()

		// Uncheck Highlights (leaving only Minutes selected)
		fireEvent.click(screen.getByText("Highlights"))

		// Export
		fireEvent.click(screen.getByText("Export Summary"))
		await Promise.resolve()

		// Should not close popup
		expect(onOpenChange).not.toHaveBeenCalled()
		// Only minutes should be downloaded directly
		expect(getTemporaryDownloadUrl).toHaveBeenCalledWith({ file_ids: ["sum-id"] })
		expect(getTemporaryDownloadUrl).not.toHaveBeenCalledWith({ file_ids: ["hl-id"] })
	})

	it("performs batch download when multiple summary items are selected", async () => {
		const onOpenChange = vi.fn()
		const { SuperMagicApi } = await import("@/apis")
		render(
			<MobileRecordingShareExportSheet
				open
				recordingName="Prototype recording"
				fileMap={mockFileMap}
				projectId="project-123"
				onOpenChange={onOpenChange}
				onShareLink={vi.fn()}
				onDownloadRecording={vi.fn()}
			/>,
		)

		// Transition
		fireEvent.click(screen.getByText("Summary"))

		// Both "Minutes" and "Highlights" are selected. Click Export Summary.
		fireEvent.click(screen.getByText("Export Summary"))
		await Promise.resolve()

		// Verify batch download API was called with both file IDs and projectId
		expect(SuperMagicApi.createBatchDownload).toHaveBeenCalledWith({
			file_ids: ["sum-id", "hl-id"],
			project_id: "project-123",
		})
		expect(downloadFileWithAnchor).toHaveBeenCalledWith("http://mock-download.com/batch.zip")
		// Popup should not close
		expect(onOpenChange).not.toHaveBeenCalled()
	})
})
