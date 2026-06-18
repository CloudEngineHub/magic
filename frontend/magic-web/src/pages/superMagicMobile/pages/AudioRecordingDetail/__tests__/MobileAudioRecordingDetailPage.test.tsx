import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MobileAudioRecordingDetailPage from "../index"
import type { AudioProjectListItem } from "@/types/audioProject"
import { RouteName } from "@/routes/constants"
import { toast } from "sonner"

const navigateMock = vi.fn()
const saveMediaSpeakersAndMagicProjectJsMock = vi.fn()
const downloadRecordingAudioFileMock = vi.fn()
const deleteAudioRecordingProjectsMock = vi.fn()

const {
	detailDataMock,
	sourcePanelPropsMock,
	summaryPanelPropsMock,
	collectSpeakerIdsFromTextMock,
} = vi.hoisted(() => ({
	detailDataMock: vi.fn(),
	sourcePanelPropsMock: vi.fn(),
	summaryPanelPropsMock: vi.fn(),
	collectSpeakerIdsFromTextMock: vi.fn(() => []),
}))

/** Builds a fictional detail item so tests avoid any real recording identifiers. */
function createItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "project-mobile-001",
		project_name: "Mock mobile recording",
		created_at: 1710000000,
		duration: 90,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "merging",
		phase_status: "completed",
		card_status: "not_summarized",
		is_summarized: false,
		task_key: "task-mobile-001",
		topic_id: "topic-mobile-001",
		audio_file_id: "audio-mobile-001",
		model_id: "model-mobile-001",
		workspace_id: "workspace-mobile-001",
		...overrides,
	}
}

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router")
	return {
		...actual,
		useParams: () => ({ projectId: "project-mobile-001" }),
		useLocation: () => ({
			state: {
				projectName: "Mock mobile recording",
				cardStatus: "not_summarized",
				audioFileId: "audio-mobile-001",
			},
		}),
	}
})

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => navigateMock,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.back": "Back",
				"detail.tabs.source": "Source",
				"detail.tabs.summaryRoot": "Summary",
				"detail.share": "Share",
				"detail.shareAndExport": "Share & Export",
				"detail.shareSection": "Share",
				"detail.shareLink": "Share link",
				"detail.exportSection": "Export files",
				"detail.exportRecording": "Recording",
				"detail.exportTranscript": "Transcript",
				"detail.exportNotes": "Notes",
				"detail.exportSummary": "Summary",
				"detail.exportUnavailable": "Only original recording export is available right now",
				"card.moreActions": "More actions",
				"card.rename": "Rename",
				"detail.loading": "Loading",
				"detail.loadFailed": "Load failed",
				"detail.untitled": "Untitled",
				"detail.summarizing": "Generating summary...",
				"detail.summarizingHint": "All summary views will appear when it is ready.",
				"detail.notSummarized": "No summary yet",
				"detail.notSummarizedHint": "Generate a summary to preview it here",
				"actions.renameTitle": "Rename title",
				"actions.renameLabel": "Rename label",
				"actions.renamePlaceholder": "Rename placeholder",
				"actions.cancel": "Cancel",
				"actions.confirm": "Confirm",
				"detail.speakerSettingsTitle": "Speaker settings",
				"detail.speakerSettingsHint": "Speaker settings hint",
				"detail.speakerSettingsCancel": "Close speaker settings",
				"detail.speakerSettingsSave": "Save speaker settings",
				"detail.speakerLabel": `Speaker {{label}}`,
			}
			return labels[key] ?? key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("../hooks/useMobileRecordingDetailData", () => ({
	useMobileRecordingDetailData: (...args: unknown[]) => detailDataMock(...args),
}))

vi.mock("../hooks/useMobileRecordingAudioPlayer", () => ({
	useMobileRecordingAudioPlayer: () => ({
		audioRef: { current: null },
		currentTime: 0,
		duration: 90,
		progress: 0,
		playing: false,
		toggle: vi.fn(),
		seekTo: vi.fn(),
		playSegment: vi.fn(),
	}),
}))

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
	},
}))

vi.mock("../components/MobileRecordingAudioPlayer", () => ({
	MobileRecordingAudioPlayer: () => <div data-testid="mobile-recording-audio-player" />,
}))

vi.mock("@/pages/superMagicMobile/components/ProjectShareSheet", () => ({
	__esModule: true,
	default: ({ open }: { open: boolean }) =>
		open ? <div data-testid="mobile-recording-project-share-sheet" /> : null,
}))

vi.mock("../components/MobileRecordingShareExportSheet", () => ({
	MobileRecordingShareExportSheet: ({
		open,
		fileMap,
		onShareLink,
		onDownloadRecording,
	}: {
		open: boolean
		fileMap: unknown
		onShareLink: () => void
		onDownloadRecording: () => void
	}) =>
		open ? (
			<div data-testid="mobile-recording-share-export-sheet">
				<span data-testid="file-map">{JSON.stringify(fileMap)}</span>
				<button
					type="button"
					data-testid="mobile-recording-share-link"
					onClick={onShareLink}
				>
					Share link
				</button>
				<button
					type="button"
					data-testid="mobile-recording-export-recording"
					onClick={onDownloadRecording}
				>
					Recording
				</button>
			</div>
		) : null,
}))

vi.mock("../components/MobileRecordingSourcePanel", () => ({
	MobileRecordingSourcePanel: (props: Record<string, unknown>) => {
		sourcePanelPropsMock(props)
		return (
			<div data-testid="mobile-recording-source-panel">
				<button
					type="button"
					data-testid="open-speaker-settings"
					onClick={() => (props.onOpenSpeakerSettings as () => void)?.()}
				>
					Open speaker settings
				</button>
			</div>
		)
	},
}))

vi.mock("../components/MobileRecordingSummaryPanel", () => ({
	MobileRecordingSummaryPanel: (props: Record<string, unknown>) => {
		summaryPanelPropsMock(props)
		return <div data-testid="mobile-recording-summary-panel" />
	},
}))

vi.mock("../utils/markdown-time-links", () => ({
	collectSpeakerIdsFromText: (...args: unknown[]) => collectSpeakerIdsFromTextMock(...args),
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/media/utils", () => ({
	saveMediaSpeakersAndMagicProjectJs: (...args: unknown[]) =>
		saveMediaSpeakersAndMagicProjectJsMock(...args),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/download-recording-audio", () => ({
	downloadRecordingAudioFile: (...args: unknown[]) => downloadRecordingAudioFileMock(...args),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/audio-recording-actions", async () => {
	const actual = await vi.importActual<
		typeof import("@/pages/superMagic/pages/AudioRecordings/utils/audio-recording-actions")
	>("@/pages/superMagic/pages/AudioRecordings/utils/audio-recording-actions")

	return {
		...actual,
		deleteAudioRecordingProjects: (...args: unknown[]) =>
			deleteAudioRecordingProjectsMock(...args),
	}
})

describe("MobileAudioRecordingDetailPage", () => {
	beforeEach(() => {
		navigateMock.mockReset()
		deleteAudioRecordingProjectsMock.mockReset()
		deleteAudioRecordingProjectsMock.mockResolvedValue(undefined)
		saveMediaSpeakersAndMagicProjectJsMock.mockReset()
		saveMediaSpeakersAndMagicProjectJsMock.mockResolvedValue(undefined)
		sourcePanelPropsMock.mockReset()
		summaryPanelPropsMock.mockReset()
		collectSpeakerIdsFromTextMock.mockReset()
		collectSpeakerIdsFromTextMock.mockReturnValue([])
		downloadRecordingAudioFileMock.mockReset()
		downloadRecordingAudioFileMock.mockResolvedValue(true)
		vi.mocked(toast.info).mockReset()
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			projectItem: createItem(),
			mutateAudioProjectItem: vi.fn(),
			fileMap: {
				summaryFiles: [{ type: "summary", fileId: "summary-file", fileName: "summary.md" }],
				magicProject: { file_id: "magic-project-file-001" },
				magicProjectConfig: { metadata: { speakers: { "Speaker-1": "Saved Host" } } },
			},
			texts: {
				transcript: { fileId: "transcript-file", content: "Transcript mock" },
				notes: { fileId: "notes-file", content: "Notes mock" },
				magicProject: {
					fileId: "magic-project-file-001",
					content: "window.magicProjectConfig = { metadata: { speakers: {} } }",
				},
				summary: {
					summary: { fileId: "summary-file", content: "Summary mock" },
				},
			},
			audioUrl: "https://example.invalid/audio-mock.mp3",
			title: "Mock mobile recording",
			attachmentTree: [],
			attachmentList: [],
		})
	})

	it("renders the source panel by default for unsummarized recordings", () => {
		render(<MobileAudioRecordingDetailPage />)

		expect(screen.getByTestId("mobile-recording-source-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-summary-panel")).toBeNull()
		expect(sourcePanelPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				scrollPaddingBottom: expect.any(Number),
				transcriptContent: "Transcript mock",
				notesContent: "Notes mock",
			}),
		)
	})

	it("switches to the summary panel and passes the loaded summary files", () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: createItem({
				card_status: "summarized",
				current_phase: "summarizing",
				phase_status: "completed",
			}),
			fileMap: {
				summaryFiles: [{ type: "summary", fileId: "summary-file", fileName: "summary.md" }],
			},
			texts: {
				transcript: { fileId: "transcript-file", content: "Transcript mock" },
				notes: { fileId: "notes-file", content: "Notes mock" },
				summary: {
					summary: { fileId: "summary-file", content: "Summary mock" },
				},
			},
			audioUrl: "https://example.invalid/audio-mock.mp3",
			title: "Mock mobile recording",
			attachmentList: [],
		})

		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByText("Summary"))

		expect(screen.getByTestId("mobile-recording-summary-panel")).toBeInTheDocument()
		expect(summaryPanelPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				attachmentList: expect.any(Array),
				scrollPaddingBottom: expect.any(Number),
				summaryFiles: [
					expect.objectContaining({
						type: "summary",
					}),
				],
			}),
		)
	})

	it("keeps the summary tab active when a summary time chip starts playback", () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: createItem({
				card_status: "summarized",
				current_phase: "summarizing",
				phase_status: "completed",
			}),
			fileMap: {
				summaryFiles: [{ type: "summary", fileId: "summary-file", fileName: "summary.md" }],
			},
			texts: {
				transcript: { fileId: "transcript-file", content: "Transcript mock" },
				notes: { fileId: "notes-file", content: "Notes mock" },
				summary: {
					summary: { fileId: "summary-file", content: "Summary mock" },
				},
			},
			audioUrl: "https://example.invalid/audio-mock.mp3",
			title: "Mock mobile recording",
		})

		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByText("Summary"))
		const latestSummaryPanelProps = summaryPanelPropsMock.mock.calls.at(-1)?.[0] as
			| { onTimeClick?: (start: number, end?: number) => void }
			| undefined

		act(() => {
			latestSummaryPanelProps?.onTimeClick?.(12, 24)
		})

		expect(screen.getByTestId("mobile-recording-summary-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-source-panel")).toBeNull()
	})

	it("shows the summarizing placeholder when summary is not ready yet", () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: createItem({
				card_status: "summarizing",
				current_phase: "summarizing",
				phase_status: "in_progress",
			}),
			fileMap: { summaryFiles: [] },
			texts: { transcript: undefined, notes: undefined, summary: {} },
			audioUrl: "",
			title: "Mock mobile recording",
		})

		render(<MobileAudioRecordingDetailPage />)
		fireEvent.click(screen.getByText("Summary"))

		expect(screen.getByTestId("mobile-recording-summary-placeholder")).toBeInTheDocument()
		expect(screen.getByText("Generating summary...")).toBeInTheDocument()
		expect(screen.getByText("All summary views will appear when it is ready.")).toBeInTheDocument()
	})

	it("navigates back to the recordings list", () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("Back"))

		expect(navigateMock).toHaveBeenCalledWith({ name: RouteName.AudioRecordings })
	})

	it("uses the shared mobile header button and icon sizing for back/share/more actions", () => {
		render(<MobileAudioRecordingDetailPage />)

		const backButton = screen.getByLabelText("Back")
		const shareButton = screen.getByLabelText("Share")
		const moreButton = screen.getByLabelText("More actions")

		// Lock the header geometry to the same 48px buttons used by mobile project detail so icon size and stroke stay visually aligned.
		expect(backButton.className).toContain("mobile-page-header-btn")
		expect(shareButton.className).toContain("h-12 w-12")
		expect(moreButton.className).toContain("h-12 w-12")

		expect(backButton.querySelector("svg")?.getAttribute("class")).toContain("size-[22px]")
		expect(shareButton.querySelector("svg")?.getAttribute("class")).toContain("size-[22px]")
		expect(moreButton.querySelector("svg")?.getAttribute("class")).toContain("size-[22px]")
	})

	it("opens the share & export sheet from the header share action", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("Share"))

		expect(await screen.findByTestId("mobile-recording-share-export-sheet")).toBeInTheDocument()
	})

	it("opens the existing project-share sheet from the share & export launcher", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("Share"))
		fireEvent.click(await screen.findByTestId("mobile-recording-share-link"))

		expect(
			await screen.findByTestId("mobile-recording-project-share-sheet"),
		).toBeInTheDocument()
	})

	it("downloads the original recording from the share & export launcher", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("Share"))
		fireEvent.click(await screen.findByTestId("mobile-recording-export-recording"))

		await waitFor(() => {
			expect(downloadRecordingAudioFileMock).toHaveBeenCalledWith({
				fileId: "audio-mobile-001",
				audioFile: undefined,
				fallbackName: "Mock mobile recording",
			})
		})
	})

	it("passes fileMap to the share-export sheet", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("Share"))
		expect(await screen.findByTestId("mobile-recording-share-export-sheet")).toBeInTheDocument()
		expect(screen.getByTestId("file-map")).not.toBeEmptyDOMElement()
	})

	it("opens the more-actions sheet even when the project query has not recovered the detail item yet", async () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: null,
			fileMap: {
				summaryFiles: [],
				magicProject: { file_id: "magic-project-file-001" },
				magicProjectConfig: { metadata: { speakers: {} } },
			},
			texts: { transcript: undefined, notes: undefined, summary: {} },
			audioUrl: "",
			title: "Recovered title",
		})

		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("More actions"))

		await waitFor(() => {
			expect(document.body).toHaveAttribute("data-scroll-locked", "1")
		})
	})

	it("prefers the recovered project name in the header over bundle metadata titles", () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: createItem({ project_name: "Correct project title" }),
			fileMap: {
				summaryFiles: [],
				magicProject: { file_id: "magic-project-file-001" },
				magicProjectConfig: {
					name: "Stale bundle title",
					metadata: { title: "Older html title", speakers: {} },
				},
			},
			texts: { transcript: undefined, notes: undefined, summary: {} },
			audioUrl: "",
			title: "Correct project title",
		})

		render(<MobileAudioRecordingDetailPage />)

		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Correct project title")
		expect(screen.queryByText("Older html title")).toBeNull()
	})

	it("opens the speaker settings sheet with the shared action header controls", async () => {
		collectSpeakerIdsFromTextMock.mockReturnValue(["Speaker-1"])

		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByTestId("open-speaker-settings"))

		expect((await screen.findAllByText("Speaker settings")).length).toBeGreaterThan(0)
		expect(await screen.findByLabelText("Close speaker settings")).toBeInTheDocument()
		expect(await screen.findByLabelText("Save speaker settings")).toBeInTheDocument()
	})

	it("hydrates saved speaker names and persists edits when users save the sheet", async () => {
		collectSpeakerIdsFromTextMock.mockReturnValue(["Speaker-1"])

		render(<MobileAudioRecordingDetailPage />)

		await waitFor(() => {
			expect(sourcePanelPropsMock).toHaveBeenLastCalledWith(
				expect.objectContaining({
					speakerNameMap: { "Speaker-1": "Saved Host" },
				}),
			)
		})

		fireEvent.click(screen.getByTestId("open-speaker-settings"))

		const input = await screen.findByDisplayValue("Saved Host")
		fireEvent.change(input, { target: { value: "Renamed Host" } })
		fireEvent.click(await screen.findByLabelText("Save speaker settings"))

		expect(saveMediaSpeakersAndMagicProjectJsMock).toHaveBeenCalledWith({
			mediaSpeakers: { "Speaker-1": "Renamed Host" },
			magicProjectJsFileInfo: {
				fileId: "magic-project-file-001",
				content: "window.magicProjectConfig = { metadata: { speakers: {} } }",
			},
		})
		await waitFor(() => {
			expect(sourcePanelPropsMock).toHaveBeenLastCalledWith(
				expect.objectContaining({
					speakerNameMap: { "Speaker-1": "Renamed Host" },
				}),
			)
		})
	})

	it("renders the loading state without mounting the detail panels", () => {
		detailDataMock.mockReturnValue({
			loading: true,
			error: false,
			mutateAudioProjectItem: vi.fn(),
			projectItem: null,
			fileMap: null,
			texts: { summary: {} },
			audioUrl: "",
			title: "",
		})
		render(<MobileAudioRecordingDetailPage />)

		expect(screen.getByText("Loading", { exact: false })).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-source-panel")).toBeNull()
		expect(screen.queryByTestId("mobile-recording-summary-panel")).toBeNull()
	})

	it("renders the error state without mounting the detail panels", () => {
		detailDataMock.mockReturnValue({
			loading: false,
			error: true,
			mutateAudioProjectItem: vi.fn(),
			projectItem: null,
			fileMap: null,
			texts: { summary: {} },
			audioUrl: "",
			title: "",
		})

		render(<MobileAudioRecordingDetailPage />)

		expect(screen.getByText("Load failed")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-source-panel")).toBeNull()
		expect(screen.queryByTestId("mobile-recording-summary-panel")).toBeNull()
	})

	it("opens the share & export sheet from the more-actions sheet share button", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("More actions"))
		fireEvent.click(await screen.findByTestId("mobile-recording-more-share"))

		expect(await screen.findByTestId("mobile-recording-share-export-sheet")).toBeInTheDocument()
	})

	it("passes deleted project id when navigating back to the list after delete", async () => {
		render(<MobileAudioRecordingDetailPage />)

		fireEvent.click(screen.getByLabelText("More actions"))
		fireEvent.click(await screen.findByTestId("mobile-recording-more-delete"))
		fireEvent.click(await screen.findByTestId("mobile-recording-delete-confirm"))

		await waitFor(() => {
			expect(deleteAudioRecordingProjectsMock).toHaveBeenCalledWith(["project-mobile-001"])
		})
		expect(navigateMock).toHaveBeenCalledWith({
			name: RouteName.AudioRecordings,
			state: { deletedProjectId: "project-mobile-001" },
		})
	})
})
