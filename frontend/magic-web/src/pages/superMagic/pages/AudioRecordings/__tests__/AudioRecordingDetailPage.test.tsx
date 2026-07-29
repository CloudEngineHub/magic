import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import AudioRecordingDetailPage from "../AudioRecordingDetailPage"
import { RouteName } from "@/routes/constants"
import { AUDIO_RECORDINGS_PAGE_SHELL_CLASS } from "../constants/page-shell"

const navigateMock = vi.fn()
const storageMock = vi.hoisted(() => ({
	getItem: vi.fn(() => null),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	key: vi.fn(() => null),
	length: 0,
}))
const audioPlayerMock = vi.hoisted(() => ({
	seekTo: vi.fn(),
	playSegment: vi.fn(),
	toggle: vi.fn(),
	setPlaybackRate: vi.fn(),
}))
const locationStateMock = vi.hoisted(() => ({
	projectName: "Weekly sync",
	cardStatus: "summarized" as "summarized" | "not_summarized" | "summarizing",
	audioFileId: undefined as string | undefined,
}))
const shareControlsMock = vi.hoisted(() => ({
	shareManagementOpen: false,
	openManageShare: vi.fn(),
	closeManageShare: vi.fn(),
}))
const superMagicServiceMock = vi.hoisted(() => ({
	initializeState: vi.fn(),
}))

vi.hoisted(() => {
	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router")
	return {
		...actual,
		useParams: () => ({ projectId: "project-alpha" }),
		useLocation: () => ({
			state: locationStateMock,
		}),
	}
})

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => navigateMock,
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: superMagicServiceMock,
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: {},
}))

vi.mock("@/apis/clients/chatWebSocket", () => ({
	default: {},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/models/config/stores/theme.store", () => ({
	themeStore: {
		theme: "light",
		setTheme: vi.fn(),
		syncDocumentDarkClass: vi.fn(),
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string, options?: Record<string, unknown>) => {
				const labels: Record<string, string> = {
					"detail.back": "Back",
					"detail.loading": "Loading",
					"detail.loadFailed": "Failed to load",
					"detail.untitled": "Untitled",
					"detail.transcriptCount": "Transcript {{count}} segments",
					"detail.exportSection": "Export",
					"detail.share": "Share",
					"detail.tabs.notes": "Notes",
					"detail.emptyTranscript": "No transcript",
					"detail.emptyNotes": "No notes",
					"detail.openSpeakerSettings": "Speaker settings",
					"card.summarized": "Summarized",
					"card.notSummarized": "Not summarized",
					"card.summarizing": "Summarizing",
					"actions.cancel": "Cancel",
					"actions.confirm": "Confirm",
					"actions.deleteTitle": "Delete",
					"actions.deleteConfirmSingle": "Delete this recording?",
				}
				if (key === "detail.transcriptCount") {
					return `Transcript ${options?.count ?? 0} segments`
				}
				return labels[key] ?? key
			},
		}),
	}
})

const mockDetailData = vi.hoisted(() => ({
	loading: false,
	error: false,
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
		summaryFiles: [],
	},
	texts: { summary: {} },
	audioUrl: "https://example.test/audio.wav",
	title: "Weekly sync",
	attachmentTree: [],
	attachmentList: [],
	refresh: vi.fn(),
	mutateAudioProjectItem: vi.fn(),
}))

vi.mock("../hooks/useRecordingDetailData", () => ({
	useRecordingDetailData: () => mockDetailData,
}))

vi.mock("../hooks/useRecordingAudioPlayer", () => ({
	useRecordingAudioPlayer: () => ({
		audioRef: { current: null },
		currentTime: 0,
		duration: 120,
		playing: false,
		progress: 0,
		playbackRate: 1,
		setPlaybackRate: audioPlayerMock.setPlaybackRate,
		seekTo: audioPlayerMock.seekTo,
		playSegment: audioPlayerMock.playSegment,
		toggle: audioPlayerMock.toggle,
	}),
}))

vi.mock("../hooks/useRecordingPlayerCurrentSec", () => ({
	useRecordingPlayerCurrentSec: () => 0,
}))

vi.mock("../hooks/useRecordingDetailActions", () => ({
	useRecordingDetailActions: () => ({
		renaming: false,
		deleting: false,
		moving: false,
		summarySubmitting: false,
		downloading: false,
		exportAvailability: {
			hasAudio: true,
			hasTranscript: true,
			hasNotes: false,
			hasSummaryFiles: false,
			hasAnyExportable: true,
		},
		canGenerateSummary: false,
		renameProject: vi.fn().mockResolvedValue(true),
		deleteProject: vi.fn(),
		moveToGroup: vi.fn(),
		submitSummary: vi.fn(),
		downloadAudio: vi.fn(),
		downloadTranscript: vi.fn(),
		downloadNotes: vi.fn(),
		downloadSummaryType: vi.fn(),
		downloadAll: vi.fn(),
	}),
}))

vi.mock("../components/recording-detail/useRecordingDetailShareControls", () => ({
	useRecordingDetailShareControls: () => ({
		shareModalOpen: false,
		shareManagementOpen: shareControlsMock.shareManagementOpen,
		attachments: [],
		attachmentList: [],
		defaultSelectedFileIds: [],
		requiredFileIds: [],
		openCreateShare: vi.fn(),
		openManageShare: shareControlsMock.openManageShare,
		closeManageShare: shareControlsMock.closeManageShare,
		closeShareModal: vi.fn(),
	}),
}))

vi.mock("../components/recording-detail/RecordingShareManagementDialog", () => ({
	default: ({
		open,
		projectId,
		onClose,
	}: {
		open: boolean
		projectId: string
		onClose: () => void
	}) =>
		open ? (
			<button
				type="button"
				data-testid="recording-share-management-dialog"
				data-project-id={projectId}
				onClick={onClose}
			>
				Recording share management
			</button>
		) : null,
}))

vi.mock("../components/AudioRecordingGroupDialogs", () => ({
	AudioRecordingMoveGroupDialog: () => null,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/media/utils", () => ({
	saveMediaSpeakersAndMagicProjectJs: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/Share/Modal", () => ({
	default: () => null,
}))

vi.mock("react-markdown", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base/MagicMarkmap", () => ({
	default: () => <div data-testid="magic-markmap-mock" />,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/IsolatedHTMLRenderer", () => ({
	default: () => <div data-testid="isolated-html-mock" />,
}))

vi.mock("../components/recording-detail/RecordingDetailHeader", () => ({
	RecordingDetailHeader: ({
		title,
		onOpenProject,
	}: {
		title: string
		onOpenProject?: () => void
	}) => (
		<div data-testid="recording-detail-header">
			<h1>{title}</h1>
			<button
				type="button"
				data-testid="recording-detail-open-project"
				onClick={onOpenProject}
			>
				Open project
			</button>
		</div>
	),
}))

vi.mock("../components/recording-detail/RecordingDetailLeftColumn", () => ({
	RecordingDetailLeftColumn: ({
		onPlaySegment,
	}: {
		onPlaySegment: (segment: { id: string; start: number; end?: number; text: string }) => void
	}) => (
		<div data-testid="recording-detail-left-column">
			<div data-testid="recording-detail-audio-player" />
			<div
				className="flex h-full min-h-full w-full flex-1 items-center justify-center"
				data-testid="recording-detail-region-empty-slot"
			>
				<div data-testid="recording-detail-empty-noTranscript">No transcript</div>
			</div>
			<button
				type="button"
				data-testid="recording-detail-trigger-transcript-play"
				onClick={() =>
					onPlaySegment({
						id: "segment-1",
						start: 55,
						end: 73,
						text: "Mock transcript line",
					})
				}
			>
				Play transcript segment
			</button>
		</div>
	),
}))

vi.mock("@/services/audioRecordings", () => ({
	recordingGroupsService: {
		listGroups: vi.fn().mockResolvedValue({ groups: [], totalCount: 0, ungroupedCount: 0 }),
	},
	UNGROUPED_RECORDING_GROUP_ID: "ungrouped",
}))

describe("AudioRecordingDetailPage", () => {
	beforeEach(() => {
		navigateMock.mockReset()
		superMagicServiceMock.initializeState.mockReset()
		superMagicServiceMock.initializeState.mockResolvedValue(undefined)
		audioPlayerMock.seekTo.mockReset()
		audioPlayerMock.playSegment.mockReset()
		audioPlayerMock.toggle.mockReset()
		audioPlayerMock.setPlaybackRate.mockReset()
		shareControlsMock.shareManagementOpen = false
		shareControlsMock.openManageShare.mockReset()
		shareControlsMock.closeManageShare.mockReset()
		mockDetailData.loading = false
		mockDetailData.error = false
	})

	it("renders desktop workbench layout", () => {
		render(<AudioRecordingDetailPage />)

		expect(screen.getByTestId("recording-detail-workbench")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-header")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-right-panel")).toBeInTheDocument()
	})

	it("initializes the recording project before navigating from the detail menu", async () => {
		let resolveInitialization: () => void = () => undefined
		superMagicServiceMock.initializeState.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveInitialization = resolve
			}),
		)

		render(<AudioRecordingDetailPage />)
		fireEvent.click(screen.getByTestId("recording-detail-open-project"))

		expect(superMagicServiceMock.initializeState).toHaveBeenCalledWith({
			projectId: "project-alpha",
		})
		expect(navigateMock).not.toHaveBeenCalled()

		resolveInitialization()
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				name: RouteName.SuperWorkspaceProjectState,
				params: { projectId: "project-alpha" },
			})
		})
	})

	it("uses the same page shell styles as the recordings list page", () => {
		render(<AudioRecordingDetailPage />)

		expect(screen.getByTestId("audio-recording-detail-page")).toHaveClass(
			...AUDIO_RECORDINGS_PAGE_SHELL_CLASS.split(" "),
		)
	})

	it("shows page error state with back action", () => {
		mockDetailData.error = true

		render(<AudioRecordingDetailPage />)

		expect(screen.getByTestId("recording-detail-empty-pageError")).toBeInTheDocument()
		fireEvent.click(screen.getByText("Back"))
		expect(navigateMock).toHaveBeenCalledWith({ name: RouteName.AudioRecordings })
	})

	it("shows empty transcript state while keeping workbench layout", () => {
		render(<AudioRecordingDetailPage />)

		const transcriptEmpty = screen.getByTestId("recording-detail-empty-noTranscript")
		expect(transcriptEmpty).toBeInTheDocument()
		expect(
			transcriptEmpty.closest('[data-testid="recording-detail-region-empty-slot"]'),
		).toHaveClass("min-h-full", "items-center", "justify-center")
		expect(screen.getByTestId("recording-detail-audio-player")).toBeInTheDocument()
	})

	it("centers empty notes state inside the right panel scroll region", () => {
		render(<AudioRecordingDetailPage />)

		const notesEmpty = screen.getByTestId("recording-detail-empty-noNotes")
		expect(notesEmpty).toBeInTheDocument()
		expect(
			notesEmpty.closest('[data-testid="recording-detail-region-empty-slot"]'),
		).toHaveClass("min-h-full", "items-center", "justify-center")
	})

	it("renders the shared created-at fallback title instead of the untitled label", () => {
		mockDetailData.title = "2024/03/09 16:00 的录音"

		render(<AudioRecordingDetailPage />)

		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
			"2024/03/09 16:00 的录音",
		)
		expect(screen.queryByText("Untitled")).toBeNull()
	})

	it("seeks with autoplay instead of previewing a single transcript segment", () => {
		render(<AudioRecordingDetailPage />)

		fireEvent.click(screen.getByTestId("recording-detail-trigger-transcript-play"))

		expect(audioPlayerMock.seekTo).toHaveBeenCalledWith(55, { autoplay: true })
		expect(audioPlayerMock.playSegment).not.toHaveBeenCalled()
	})

	it("mounts local recording share management dialog for the current project", () => {
		shareControlsMock.shareManagementOpen = true

		render(<AudioRecordingDetailPage />)

		expect(screen.getByTestId("recording-share-management-dialog")).toHaveAttribute(
			"data-project-id",
			"project-alpha",
		)

		fireEvent.click(screen.getByTestId("recording-share-management-dialog"))
		expect(shareControlsMock.closeManageShare).toHaveBeenCalled()
	})
})
