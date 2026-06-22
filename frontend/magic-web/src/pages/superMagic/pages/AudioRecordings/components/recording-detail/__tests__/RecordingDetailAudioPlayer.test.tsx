import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RecordingDetailAudioPlayer } from "../RecordingDetailAudioPlayer"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../player", () => ({
	RecordingDetailAudioBar: () => <div data-testid="recording-detail-audio-bar" />,
}))

describe("RecordingDetailAudioPlayer", () => {
	it("renders no-audio empty state when url is missing", () => {
		render(
			<RecordingDetailAudioPlayer
				audioRef={{ current: null }}
				audioUrl=""
				currentSec={0}
				duration={0}
				playing={false}
				expanded={false}
				playbackRate={1}
				onToggle={vi.fn()}
				onSeek={vi.fn()}
				onExpandedChange={vi.fn()}
				onPlaybackRateChange={vi.fn()}
			/>,
		)

		expect(screen.getByText("detail.empty.noAudio")).toBeInTheDocument()
	})

	it("renders shared audio bar shell when url exists", () => {
		render(
			<RecordingDetailAudioPlayer
				audioRef={{ current: null }}
				audioUrl="test.mp3"
				currentSec={0}
				duration={10}
				playing={false}
				expanded={false}
				playbackRate={1}
				onToggle={vi.fn()}
				onSeek={vi.fn()}
				onExpandedChange={vi.fn()}
				onPlaybackRateChange={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("recording-detail-audio-bar")).toBeInTheDocument()
	})
})
