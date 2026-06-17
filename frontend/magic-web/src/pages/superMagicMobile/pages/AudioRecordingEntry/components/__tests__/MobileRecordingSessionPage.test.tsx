import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingSessionPage } from "../MobileRecordingSessionPage"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

function renderSessionPage(duration: string) {
	render(
		<MobileRecordingSessionPage
			title="Mock Recording"
			duration={duration}
			isPaused={false}
			isBusy={false}
			transcriptMessages={[]}
			noteContent=""
			onBack={vi.fn()}
			onPause={vi.fn()}
			onResume={vi.fn()}
			onFinish={vi.fn()}
			onCancel={vi.fn()}
			onNoteChange={vi.fn()}
			WaveformComponent={() => <div data-testid="waveform" />}
			MessageListComponent={() => <div data-testid="message-list" />}
		/>,
	)
}

describe("MobileRecordingSessionPage duration display", () => {
	it("shows mm:ss for durations under one hour", () => {
		renderSessionPage("00:00:01")

		expect(screen.getByText("00:01")).toBeInTheDocument()
	})

	it("keeps h:mm:ss for one hour and above", () => {
		renderSessionPage("01:00:01")

		expect(screen.getByText("1:00:01")).toBeInTheDocument()
	})

	it("falls back to 00:00 for malformed duration strings", () => {
		renderSessionPage("bad-duration")

		expect(screen.getByText("00:00")).toBeInTheDocument()
	})
})
