import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { ToolbarButton } from "@/pages/superMagic/components/MessageEditor/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import MicroAppCreatePrompt from "../MicroAppCreatePrompt"

const mocks = vi.hoisted(() => ({
	setSelectedProject: vi.fn(),
	setSelectedTopic: vi.fn(),
	setSelectedWorkspace: vi.fn(),
	editorContext: undefined as SceneEditorContext | undefined,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: { setSelectedProject: mocks.setSelectedProject },
	topicStore: { setSelectedTopic: mocks.setSelectedTopic },
	workspaceStore: { setSelectedWorkspace: mocks.setSelectedWorkspace },
}))

vi.mock("@/pages/superMagic/pages/MicroAppPage/utils/microAppModelMode", () => ({
	resolveMicroAppModelSelectionMode: () => TopicMode.MicroApp,
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer",
	() => ({
		default: ({ editorContext }: { editorContext: SceneEditorContext }) => {
			mocks.editorContext = editorContext
			return (
				<button
					type="button"
					data-testid="mock-editor-send-success"
					onClick={() =>
						editorContext.onSendSuccess?.({
							currentProject: { id: "project-created" },
							currentTopic: { id: "topic-created" },
						})
					}
				>
					send
				</button>
			)
		},
	}),
)

vi.mock("@/pages/superMagic/components/MainInputContainer/stores", () => ({
	SceneStateProvider: ({ children }: { children: ReactNode }) => children,
	buildTopicInputScopeKey: () => "micro-apps-create",
	createSceneStateStore: () => ({
		setInputScopeKey: vi.fn(),
	}),
}))

describe("MicroAppCreatePrompt", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.editorContext = undefined
	})

	it("uses the shared message editor to create a fresh micro app and enters it after send", () => {
		const onCreated = vi.fn()
		const onFocusChange = vi.fn()
		render(
			<MicroAppCreatePrompt
				workspace={{ id: "workspace-1", name: "Micro Apps" } as never}
				onCreated={onCreated}
				onFocusChange={onFocusChange}
			/>,
		)

		expect(mocks.setSelectedProject).toHaveBeenCalledWith(null)
		expect(mocks.setSelectedTopic).toHaveBeenCalledWith(null)
		expect(mocks.editorContext?.topicMode).toBe(TopicMode.MicroApp)
		expect(mocks.editorContext?.selectedProject).toBeNull()
		expect(mocks.editorContext?.selectedTopic).toBeNull()
		expect(mocks.editorContext?.placeholder).toBe("microAppsPage.heroPlaceholder")
		expect(mocks.editorContext?.layoutConfig?.bottomRight).toContain(ToolbarButton.MCP)

		const editor = screen.getByTestId("mock-editor-send-success")
		fireEvent.focus(editor)
		expect(onFocusChange).toHaveBeenCalledWith(true)

		fireEvent.blur(editor)
		expect(onFocusChange).toHaveBeenLastCalledWith(false)

		fireEvent.click(editor)
		expect(onCreated).toHaveBeenCalledWith("project-created")
	})
})
