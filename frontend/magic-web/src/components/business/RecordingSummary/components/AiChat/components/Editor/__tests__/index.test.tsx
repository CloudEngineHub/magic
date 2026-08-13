import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Editor from "../index"

const mocks = vi.hoisted(() => ({
	isMobile: vi.fn(() => true),
	modeSelector: vi.fn(),
	mobileInput: vi.fn(),
	topicModelStore: { selectedLanguageModel: null },
}))

vi.mock("@/hooks/useIsMobile", () => ({
	// Force the active-recording mobile rendering path under test.
	useIsMobile: () => mocks.isMobile(),
}))

vi.mock("@/stores/superMagic/topicModelStore", () => ({
	// Return one stable store so the selector and composer can be compared by identity.
	createSuperMagicTopicModelStore: () => mocks.topicModelStore,
}))

vi.mock("@/stores/recordingSummary", () => ({
	__esModule: true,
	default: {
		setWorkspace: vi.fn(),
		setProject: vi.fn(),
		setChatTopic: vi.fn(),
	},
}))

vi.mock("@/services/recordSummary/serviceInstance", () => ({
	// Provide the recording callbacks required while building the editor context.
	initializeService: () => ({
		updateWorkspace: vi.fn(),
		updateProject: vi.fn(),
		updateChatTopic: vi.fn(),
		getCurrentSessionTaskKey: () => "mock-session-task-key",
	}),
}))

vi.mock("@/pages/superMagic/hooks/useTaskData", () => ({
	// Keep optional task UI outside this selector-focused test.
	useTaskData: () => ({ taskData: null }),
}))

vi.mock("@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue", () => ({
	// Supply an empty queue while preserving the context callbacks used by the editor.
	default: () => ({
		queue: [],
		queueStats: {},
		editingQueueItem: null,
		addToQueue: vi.fn(),
		finishEditQueueItem: vi.fn(),
		removeFromQueue: vi.fn(),
		sendQueuedMessage: vi.fn(),
		startEditQueueItem: vi.fn(),
		cancelEditQueueItem: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor", () => ({
	// Preserve children without loading the complete editor provider implementation.
	MessageEditorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils/draftKey", () => ({
	// Return a deterministic draft key for the mocked recording context.
	createMessageEditorDraftKey: () => "mock-recording-draft-key",
}))

vi.mock("@/pages/superMagic/components/TaskList", () => ({
	// Represent optional task content without its runtime dependencies.
	default: () => <div data-testid="task-list" />,
}))

vi.mock("@/pages/superMagic/components/MessagePanel/components/MessageQueue", () => ({
	// Represent optional queued messages without loading queue UI dependencies.
	default: () => <div data-testid="message-queue" />,
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer",
	() => ({
		// Represent the desktop branch, which should not render in this test.
		default: () => <div data-testid="desktop-editor" />,
	}),
)

vi.mock("@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer", () => ({
	// Capture the mobile editor context to verify it shares the selected model store.
	default: (props: unknown) => {
		mocks.mobileInput(props)
		return <div data-testid="mobile-input" />
	},
}))

vi.mock(
	"@/pages/superMagicMobile/pages/ChatPage/components/mobile-composer/MobileComposerModeSelector",
	() => ({
		// Capture selector props to verify employee switching remains disabled.
		default: (props: unknown) => {
			mocks.modeSelector(props)
			return <div data-testid="recording-model-selector" />
		},
	}),
)

describe("RecordingSummary AiChat Editor", () => {
	beforeEach(() => {
		mocks.isMobile.mockReturnValue(true)
		mocks.modeSelector.mockClear()
		mocks.mobileInput.mockClear()
	})

	it("renders a general-model selector that shares its store with the mobile composer", () => {
		render(
			<Editor
				messages={[]}
				attachments={[]}
				selectedWorkspace={null}
				selectedProject={{ id: "mock-project-id" } as never}
				selectedTopic={{ id: "mock-topic-id" } as never}
				mentionPanelStore={{} as never}
				projectFilesStore={{} as never}
				isShowLoadingInit={false}
				showLoading={false}
			/>,
		)

		expect(screen.getByTestId("recording-model-selector")).toBeInTheDocument()
		expect(mocks.modeSelector).toHaveBeenCalledWith(
			expect.objectContaining({
				topicMode: "general",
				selectorVariant: "claw",
				topicModelStore: mocks.topicModelStore,
				onModeChange: undefined,
			}),
		)
		expect(mocks.mobileInput).toHaveBeenCalledWith(
			expect.objectContaining({
				editorContext: expect.objectContaining({
					topicMode: "general",
					topicModelStore: mocks.topicModelStore,
					mobileModeSelectorVariant: "claw",
				}),
			}),
		)
	})

	it("keeps the desktop editor inside the panel when it has outer margins", () => {
		mocks.isMobile.mockReturnValue(false)

		render(
			<Editor
				messages={[]}
				attachments={[]}
				selectedWorkspace={null}
				selectedProject={{ id: "mock-project-id" } as never}
				selectedTopic={{ id: "mock-topic-id" } as never}
				mentionPanelStore={{} as never}
				projectFilesStore={{} as never}
				isShowLoadingInit={false}
				showLoading={false}
			/>,
		)

		const editorWrapper = screen.getByTestId("desktop-editor").parentElement

		expect(editorWrapper).toHaveClass("m-2", "shrink-0")
		expect(editorWrapper).not.toHaveClass("w-full")
	})
})
