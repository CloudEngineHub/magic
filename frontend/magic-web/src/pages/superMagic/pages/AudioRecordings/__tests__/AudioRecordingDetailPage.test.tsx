import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import AudioRecordingDetailPage from "../AudioRecordingDetailPage"
import { RouteName } from "@/routes/constants"
import { AUDIO_RECORDINGS_PAGE_SHELL_CLASS } from "../constants/page-shell"

const navigateMock = vi.fn()
const locationStateMock = vi.hoisted(() => ({
	projectName: "Weekly sync",
	cardStatus: "summarized" as "summarized" | "not_summarized" | "summarizing",
	audioFileId: undefined as string | undefined,
}))

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
		setPlaybackRate: vi.fn(),
		seekTo: vi.fn(),
		playSegment: vi.fn(),
		toggle: vi.fn(),
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
		canGenerateSummary: false,
		renameProject: vi.fn().mockResolvedValue(true),
		deleteProject: vi.fn(),
		moveToGroup: vi.fn(),
		submitSummary: vi.fn(),
		downloadAudio: vi.fn(),
		exportUnavailable: vi.fn(),
	}),
}))

vi.mock("../components/recording-detail/useRecordingDetailShareControls", () => ({
	useRecordingDetailShareControls: () => ({
		shareModalOpen: false,
		attachments: [],
		attachmentList: [],
		defaultSelectedFileIds: [],
		openCreateShare: vi.fn(),
		openManageShare: vi.fn(),
		closeShareModal: vi.fn(),
	}),
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
	RecordingDetailHeader: () => <div data-testid="recording-detail-header" />,
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
		mockDetailData.loading = false
		mockDetailData.error = false
	})

	it("renders desktop workbench layout", () => {
		render(<AudioRecordingDetailPage />)

		expect(screen.getByTestId("recording-detail-workbench")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-header")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-right-panel")).toBeInTheDocument()
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

		expect(screen.getByTestId("recording-detail-empty-noTranscript")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-audio-player")).toBeInTheDocument()
	})
})
