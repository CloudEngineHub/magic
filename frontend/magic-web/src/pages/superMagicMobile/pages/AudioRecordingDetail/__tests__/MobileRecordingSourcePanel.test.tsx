import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingSourcePanel } from "../components/MobileRecordingSourcePanel"

const scrollEdgeFadePropsMock = vi.fn()

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.tabs.transcript": "Transcript",
				"detail.tabs.notes": "Notes",
				"detail.emptyTranscript": "No transcript",
				"detail.emptyNotes": "No notes",
				"detail.openSpeakerSettings": "Open speaker settings",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({
		children,
		...props
	}: {
		children: ReactNode
		[key: string]: unknown
	}) => {
		scrollEdgeFadePropsMock(props)
		return <div data-testid="source-scroll-edge-fade">{children}</div>
	},
}))

vi.mock("../components/MobileRecordingMarkdownContent", () => ({
	MobileRecordingMarkdownContent: ({ content }: { content: string }) => (
		<div data-testid="source-markdown-content">{content}</div>
	),
}))

describe("MobileRecordingSourcePanel", () => {
	it("wraps transcript content with the shared scroll shadow container", () => {
		render(
			<MobileRecordingSourcePanel
				transcriptContent="[00:05] Mock transcript"
				notesContent="Mock notes"
				currentTime={0}
				scrollPaddingBottom={64}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onSeek={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("source-scroll-edge-fade")).toBeInTheDocument()
		expect(scrollEdgeFadePropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fadeColor: "mobile-background",
				contentDeps: ["transcript", 1, true],
				scrollClassName: "px-4",
			}),
		)
		expect(screen.getByTestId("mobile-recording-transcript-item")).toBeInTheDocument()
	})

	it("keeps the same scroll container when switching to notes", () => {
		render(
			<MobileRecordingSourcePanel
				transcriptContent="[00:05] Mock transcript"
				notesContent="Mock notes"
				currentTime={0}
				scrollPaddingBottom={64}
				speakerNameMap={{}}
				onOpenSpeakerSettings={vi.fn()}
				onSeek={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByText("Notes"))

		expect(screen.getByTestId("source-scroll-edge-fade")).toBeInTheDocument()
		expect(scrollEdgeFadePropsMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				contentDeps: ["notes", 1, true],
			}),
		)
		expect(screen.getByTestId("source-markdown-content")).toHaveTextContent("Mock notes")
	})

	it("renders the speaker action outside the transcript row button container", () => {
		render(
			<MobileRecordingSourcePanel
				transcriptContent="[00:05] Speaker-1: Mock transcript"
				notesContent="Mock notes"
				currentTime={0}
				scrollPaddingBottom={64}
				speakerNameMap={{ "Speaker-1": "Speaker-1" }}
				onOpenSpeakerSettings={vi.fn()}
				onSeek={vi.fn()}
			/>,
		)

		const transcriptItem = screen.getByTestId("mobile-recording-transcript-item")
		const speakerButton = screen.getByRole("button", { name: "Open speaker settings" })

		expect(transcriptItem.tagName).not.toBe("BUTTON")
		expect(speakerButton.closest("button")).toBe(speakerButton)
	})
})
