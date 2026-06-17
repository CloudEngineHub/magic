import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router"

const facadeMock = {
	presentation: "recording" as "recording" | "list",
	isSessionActive: true,
	duration: "00:00:08",
	isPaused: false,
	isRecording: true,
	isBusy: false,
	transcriptMessages: [],
	noteContent: "",
	recordingTitle: "Mock Recording",
	showList: vi.fn(),
	showRecording: vi.fn(),
	startRecording: vi.fn(),
	pauseRecording: vi.fn(),
	resumeRecording: vi.fn(),
	finishRecording: vi.fn(),
	cancelRecording: vi.fn(),
	updateNote: vi.fn(),
	refreshList: vi.fn(),
	optimisticItems: [],
	WaveformComponent: () => <div data-testid="mobile-recording-waveform" />,
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../hooks/useMobileRecordingEntryFacade", () => ({
	useMobileRecordingEntryFacade: () => facadeMock,
}))

vi.mock("../AudioRecordingListPanel", () => ({
	default: ({ onResumeRecording }: { onResumeRecording: () => void }) => (
		<div data-testid="mobile-audio-recording-list-panel">
			<button type="button" onClick={onResumeRecording} data-testid="resume-recording-entry">
				resume
			</button>
		</div>
	),
}))

vi.mock("../components/MobileRecordingSettingsSheet", () => ({
	MobileRecordingSettingsSheet: () => null,
}))

vi.mock("../components/MobileRecordingSessionPage", () => ({
	MobileRecordingSessionPage: ({ onBack }: { onBack: () => void }) => (
		<div data-testid="mobile-recording-session-page">
			<button type="button" onClick={onBack} data-testid="mobile-recording-session-back">
				back
			</button>
		</div>
	),
}))

vi.mock("@/pages/superMagicMobile/components/MobileShell", () => ({
	MobileShellSidebarToggleButton: ({ testId }: { testId: string }) => (
		<button type="button" data-testid={testId}>
			menu
		</button>
	),
	SuperMobileShellRouteLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useOptionalSuperMobileShellOutlet: () => ({
		isSidebarOpen: false,
		openSidebar: vi.fn(),
		closeSidebar: vi.fn(),
	}),
}))

import AudioRecordingEntryPage from "../index"

describe("AudioRecordingEntryPage active flow", () => {
	it("shows the full-screen recording page when the shared session should be taken over", () => {
		facadeMock.presentation = "recording"

		render(
			<MemoryRouter>
				<AudioRecordingEntryPage />
			</MemoryRouter>,
		)

		expect(screen.getByTestId("mobile-recording-session-page")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-audio-recording-list-panel")).toBeNull()
	})

	it("returns to list mode while keeping the session resumable from the list", () => {
		facadeMock.presentation = "recording"

		render(
			<MemoryRouter>
				<AudioRecordingEntryPage />
			</MemoryRouter>,
		)
		fireEvent.click(screen.getByTestId("mobile-recording-session-back"))

		expect(facadeMock.showList).toHaveBeenCalled()

		cleanup()
		facadeMock.presentation = "list"
		render(
			<MemoryRouter>
				<AudioRecordingEntryPage />
			</MemoryRouter>,
		)

		expect(screen.getByTestId("mobile-audio-recording-list-panel")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("resume-recording-entry"))
		expect(facadeMock.showRecording).toHaveBeenCalled()
	})
})
