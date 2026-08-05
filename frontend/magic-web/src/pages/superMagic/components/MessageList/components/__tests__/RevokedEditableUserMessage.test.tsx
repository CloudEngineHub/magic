import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import RevokedEditableUserMessage from "../RevokedEditableUserMessage"

const mocks = vi.hoisted(() => ({
	editorContexts: [] as SceneEditorContext[],
	globalProject: { id: "global-project" },
	globalSetSelectedTopic: vi.fn(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer",
	() => ({
		default: ({ editorContext }: { editorContext: SceneEditorContext }) => {
			mocks.editorContexts.push(editorContext)
			return <div data-testid="revoked-editor-container" />
		},
	}),
)

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/ModelSwitch/ModelSwitchContainer",
	() => ({
		default: () => null,
	}),
)

vi.mock("@/pages/superMagic/components/MessageList/components/Nodes/SourceTag", () => ({
	default: () => null,
}))

vi.mock(
	"@/pages/superMagic/components/MessageList/components/UserMessageCollapsibleRichText",
	() => ({
		UserMessageCollapsibleRichText: () => null,
	}),
)

vi.mock("@/pages/superMagic/components/MessageEditor/components/MentionList", () => ({
	default: () => null,
}))

vi.mock("@/components/business/MentionPanel/tiptap-plugin/types", () => ({
	getMentionUniqueId: () => "mention-id",
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils/mention", () => ({
	isAllowedMention: () => true,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils", () => ({
	handleProjectFileMention: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/MessageList/utils/openMessageFile", () => ({
	openMessageFile: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/MessageList/context", () => ({
	useMessageListContext: () => ({
		projectFilesStore: { workspaceFileTree: [] },
	}),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: () => ({
			content: JSON.stringify({ type: "doc", content: [] }),
		}),
		removeUserMessage: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		clearActiveRevokedAnchor: vi.fn(),
		remove: vi.fn(),
		clearHiddenRevokedOptimisticMessageIds: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: { selectedProject: mocks.globalProject },
	topicStore: { setSelectedTopic: mocks.globalSetSelectedTopic },
	workspaceStore: { selectedWorkspace: null, firstWorkspace: null },
}))

vi.mock("@/stores/projectFiles", () => ({
	default: { workspaceFileTree: [] },
}))

describe("RevokedEditableUserMessage", () => {
	beforeEach(() => {
		mocks.editorContexts.length = 0
	})

	it("uses the scoped MicroApp editor context instead of global project state", () => {
		const selectedProject = { id: "micro-app-project" }
		const setSelectedTopic = vi.fn()
		const topicStore = { setSelectedTopic }
		const mergeSendParams = vi.fn(
			({
				defaultParams,
			}: Parameters<NonNullable<SceneEditorContext["mergeSendParams"]>>[0]) => defaultParams,
		)
		const selectedTopic = {
			id: "topic-1",
			chat_topic_id: "chat-topic-1",
			topic_mode: "micro-app",
		} as Topic

		render(
			<RevokedEditableUserMessage
				node={
					{
						app_message_id: "message-1",
						send_time: "1722760200",
					} as SuperMagicMessageItem
				}
				selectedTopic={selectedTopic}
				messagesLength={2}
				fallbackContent={<div data-testid="fallback-content" />}
				editorContext={{
					selectedProject: selectedProject as never,
					setSelectedTopic,
					topicMode: "micro-app" as never,
					modelTopicMode: "default" as never,
					topicStore: topicStore as never,
					mergeSendParams,
				}}
			/>,
		)

		expect(screen.getByTestId("revoked-message-reedit-editor")).toBeInTheDocument()
		expect(screen.queryByTestId("fallback-content")).not.toBeInTheDocument()
		expect(mocks.editorContexts).toHaveLength(1)
		expect(mocks.editorContexts[0]).toEqual(
			expect.objectContaining({
				selectedProject,
				setSelectedTopic,
				topicMode: "micro-app",
				modelTopicMode: "default",
				topicStore,
				mergeSendParams,
			}),
		)
	})
})
