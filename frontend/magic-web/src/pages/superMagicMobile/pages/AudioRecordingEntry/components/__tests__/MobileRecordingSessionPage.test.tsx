import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { MobileRecordingSessionPage } from "../MobileRecordingSessionPage"

const focusEditor = vi.fn()

vi.mock("@/pages/superMagic/components/Detail/contents/Md/components/EditorBody", async () => {
	const React = await import("react")
	type MockEditorRef = {
		editor: {
			commands: { insertProjectImageFromFile: (file: File) => boolean }
		} | null
		setContent: (content: string) => void
	}
	type MockEditorProps = {
		"data-testid"?: string
		onImageUploadSuccess?: (path: string) => void
		viewMode?: string
	}
	return {
		default: React.forwardRef<MockEditorRef, MockEditorProps>(
			(props, ref: React.ForwardedRef<MockEditorRef>) => {
				React.useImperativeHandle(ref, () => ({
					editor: {
						isFocused: true,
						commands: {
							focus: focusEditor,
							insertProjectImageFromFile: () => {
								props.onImageUploadSuccess?.("./images/mock-photo.jpg")
								return true
							},
						},
					},
					setContent: () => undefined,
				}))
				return React.createElement("div", {
					"data-testid": props["data-testid"],
					"data-view-mode": props.viewMode,
				})
			},
		),
	}
})

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils", () => ({
	// Mirror the shared duration formatter contract while keeping the test free from store side effects.
	formatRecordingDuration: (seconds: number) => {
		if (!Number.isFinite(seconds) || seconds <= 0) return "00:00"

		const totalSeconds = Math.floor(seconds)
		const hours = Math.floor(totalSeconds / 3600)
		const minutes = Math.floor((totalSeconds % 3600) / 60)
		const remain = totalSeconds % 60

		if (hours > 0) {
			return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
		}

		return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
	},
}))

function renderSessionPage(
	duration: string,
	options: {
		transcriptionEnabled?: boolean
		isEnablingTranscription?: boolean
		onEnableTranscription?: () => void
		isPaused?: boolean
		withProject?: boolean
	} = {},
) {
	render(
		<MobileRecordingSessionPage
			title="Mock Recording"
			duration={duration}
			isPaused={options.isPaused ?? false}
			isBusy={false}
			transcriptMessages={[]}
			noteContent=""
			transcriptionEnabled={options.transcriptionEnabled ?? true}
			isEnablingTranscription={options.isEnablingTranscription ?? false}
			onBack={vi.fn()}
			onPause={vi.fn()}
			onResume={vi.fn()}
			onFinish={vi.fn()}
			onCancel={vi.fn()}
			onNoteChange={vi.fn()}
			selectedProject={
				options.withProject ? ({ id: "mock-project-id" } as ProjectListItem) : undefined
			}
			onEnableTranscription={options.onEnableTranscription ?? vi.fn()}
			WaveformComponent={() => <div data-testid="waveform" />}
			MessageListComponent={() => <div data-testid="message-list" />}
			aiChat={<div data-testid="mock-recording-ai-chat" />}
		/>,
	)
}

describe("MobileRecordingSessionPage duration display", () => {
	beforeEach(() => {
		focusEditor.mockClear()
	})
	it("shows mm:ss for durations under one hour", () => {
		renderSessionPage("00:00:01")

		expect(screen.getByText("00:01")).toBeInTheDocument()
	})

	it("keeps hh:mm:ss for one hour and above", () => {
		renderSessionPage("01:00:01")

		expect(screen.getByText("01:00:01")).toBeInTheDocument()
	})

	it("falls back to 00:00 for malformed duration strings", () => {
		renderSessionPage("bad-duration")

		expect(screen.getByText("00:00")).toBeInTheDocument()
	})

	it("shows enable transcription CTA when realtime transcription is disabled", () => {
		const onEnableTranscription = vi.fn()

		renderSessionPage("00:00:01", {
			transcriptionEnabled: false,
			onEnableTranscription,
		})

		expect(screen.getByTestId("mobile-recording-transcription-disabled")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("mobile-recording-enable-transcription"))
		expect(onEnableTranscription).toHaveBeenCalled()
	})

	it("keeps enable transcription button disabled while initializing", () => {
		renderSessionPage("00:00:01", {
			transcriptionEnabled: false,
			isEnablingTranscription: true,
		})

		expect(screen.getByTestId("mobile-recording-enable-transcription")).toBeDisabled()
		expect(
			screen.getByText("mobile.recordingEntry.active.enablingTranscription"),
		).toBeInTheDocument()
	})

	it("switches to notes and opens the camera for an active project", () => {
		renderSessionPage("00:00:01")

		expect(screen.getByTestId("mobile-recording-session-camera")).toBeDisabled()
		expect(
			screen.getByTestId("mobile-recording-session-ask-ai").querySelector("svg"),
		).toBeTruthy()

		fireEvent.click(screen.getByTestId("mobile-recording-tab-notes"))
		expect(screen.getByTestId("mobile-recording-session-notes")).toHaveAttribute(
			"data-view-mode",
			"phone",
		)
		const cameraButton = screen.getByTestId("mobile-recording-session-camera")
		expect(cameraButton).toBeDisabled()
		expect(cameraButton.querySelector("svg")).toBeTruthy()

		fireEvent.click(screen.getByTestId("mobile-recording-tab-transcript"))
		expect(screen.getByTestId("mobile-recording-session-camera")).toBeDisabled()
		fireEvent.click(screen.getByTestId("mobile-recording-session-ask-ai"))

		expect(screen.getByTestId("mock-recording-ai-chat")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-ai-chat-back")).toBeInTheDocument()
		const popupContent = screen
			.getByTestId("mobile-recording-ai-chat-back")
			.closest('[data-slot="drawer-content"]')
		expect(popupContent).toHaveClass(
			"!h-[98dvh]",
			"!max-h-[calc(100dvh-var(--safe-area-inset-top)-0.5rem)]",
		)
	})

	it("inserts a captured photo through the project editor", async () => {
		renderSessionPage("00:00:01", { withProject: true })

		fireEvent.click(screen.getByTestId("mobile-recording-session-camera"))
		expect(screen.getByTestId("mobile-recording-tab-notes")).toHaveClass("bg-foreground")
		await waitFor(() =>
			expect(screen.getByTestId("mobile-recording-session-notes")).toBeInTheDocument(),
		)

		const input = screen.getByTestId("mobile-recording-session-camera-input")
		const photo = new File(["mock-image"], "mock-photo.jpg", { type: "image/jpeg" })
		fireEvent.change(input, { target: { files: [photo] } })

		expect(screen.getByTestId("mobile-recording-session-camera")).not.toBeDisabled()
	})

	it("keeps the current editor selection when the notes editor is focused", async () => {
		renderSessionPage("00:00:01", { withProject: true })
		fireEvent.click(screen.getByTestId("mobile-recording-tab-notes"))
		await waitFor(() =>
			expect(screen.getByTestId("mobile-recording-session-notes")).toBeInTheDocument(),
		)

		fireEvent.pointerDown(screen.getByTestId("mobile-recording-session-camera"))
		fireEvent.click(screen.getByTestId("mobile-recording-session-camera"))
		const input = screen.getByTestId("mobile-recording-session-camera-input")
		const photo = new File(["mock-image"], "mock-photo.jpg", { type: "image/jpeg" })
		fireEvent.change(input, { target: { files: [photo] } })

		expect(focusEditor).not.toHaveBeenCalledWith("end")
	})

	it("keeps the resume label on one line in the constrained three-column footer", () => {
		renderSessionPage("00:00:01", { isPaused: true })

		const resumeButton = screen.getByTestId("mobile-recording-session-toggle")
		expect(resumeButton).toHaveClass("h-12", "shrink-0", "whitespace-nowrap")
		expect(resumeButton).not.toHaveClass("h-14")
		expect(resumeButton).toHaveTextContent("mobile.recordingEntry.active.resume")
	})

	it("centers both side actions in equal-width footer columns", () => {
		renderSessionPage("00:00:01", { isPaused: true })

		expect(screen.getByTestId("mobile-recording-session-ask-ai")).toHaveClass(
			"justify-self-center",
		)
		expect(screen.getByTestId("mobile-recording-session-camera")).toHaveClass(
			"justify-self-center",
		)
	})

	it("keeps a fixed-height control slot when pause and resume shapes differ", () => {
		renderSessionPage("00:00:01", { isPaused: true })

		expect(screen.getByTestId("mobile-recording-session-control-slot")).toHaveClass("h-[68px]")
	})
})
