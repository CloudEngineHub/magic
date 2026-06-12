import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import AudioRecordingEntryPage from "../index"
import { useOptionalSuperMobileShellOutlet } from "@/pages/superMagicMobile/components/MobileShell"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../AudioRecordingListPanel", () => ({
	default: () => <div data-testid="mobile-audio-recording-list-panel" />,
}))

vi.mock("../components/MobileRecordingSettingsSheet", () => ({
	MobileRecordingSettingsSheet: ({
		open,
		onOpenChange,
	}: {
		open: boolean
		onOpenChange: (open: boolean) => void
	}) =>
		open ? (
			<div data-testid="mobile-recording-settings-sheet">
				<button
					type="button"
					data-testid="mobile-recording-settings-sheet-close-mock"
					onClick={() => onOpenChange(false)}
				>
					close
				</button>
			</div>
		) : null,
}))

vi.mock("@/pages/superMagicMobile/components/MobileShell", () => ({
	MobileShellSidebarToggleButton: ({ testId }: { testId: string }) => (
		<button type="button" data-testid={testId}>
			menu
		</button>
	),
	SuperMobileShellRouteLayout: ({
		children,
		activeView,
		testIdPrefix,
	}: {
		children: React.ReactNode
		activeView: string
		testIdPrefix: string
	}) => (
		<div
			data-testid="audio-recording-entry-shell-fallback"
			data-active-view={activeView}
			data-prefix={testIdPrefix}
		>
			{children}
		</div>
	),
	useOptionalSuperMobileShellOutlet: vi.fn(() => ({
		isSidebarOpen: false,
		openSidebar: vi.fn(),
		closeSidebar: vi.fn(),
	})),
}))

describe("AudioRecordingEntryPage", () => {
	it("renders mobile shell header and list panel when mounted under app route layout", () => {
		render(<AudioRecordingEntryPage />)

		expect(screen.getByTestId("mobile-audio-entry-page")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-audio-entry-menu-button")).toBeInTheDocument()
		expect(screen.getByText("mobile.shell.navRecording")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-audio-recording-list-panel")).toBeInTheDocument()
		expect(screen.queryByText("mobile.recordingEntry.placeholder")).toBeNull()
		expect(screen.queryByTestId("audio-recording-entry-shell-fallback")).toBeNull()
	})

	it("opens settings sheet when header settings button is clicked", () => {
		render(<AudioRecordingEntryPage />)

		expect(screen.getByTestId("mobile-recording-settings-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-settings-sheet")).toBeNull()

		fireEvent.click(screen.getByTestId("mobile-recording-settings-trigger"))
		expect(screen.getByTestId("mobile-recording-settings-sheet")).toBeInTheDocument()
	})

	it("wraps panel with SuperMobileShellRouteLayout when shell outlet is unavailable", () => {
		vi.mocked(useOptionalSuperMobileShellOutlet).mockReturnValueOnce(null)

		render(<AudioRecordingEntryPage />)

		const shell = screen.getByTestId("audio-recording-entry-shell-fallback")
		expect(shell).toHaveAttribute("data-active-view", "recording")
		expect(shell).toHaveAttribute("data-prefix", "mobile-audio-recordings-page")
		expect(screen.getByTestId("mobile-audio-recording-list-panel")).toBeInTheDocument()
	})
})
