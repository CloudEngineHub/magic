import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

const { setCurrentRoleMock } = vi.hoisted(() => ({
	setCurrentRoleMock: vi.fn(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	roleStore: {
		currentRole: TopicMode.General,
		setCurrentRole: setCurrentRoleMock,
	},
}))

vi.mock("@/pages/superMagic/hooks/useTaskData", () => ({
	useTaskData: () => ({ taskData: undefined }),
}))

vi.mock("@/pages/superMagic/hooks/useTaskInterrupt", () => ({
	useTaskInterrupt: () => ({ handleInterrupt: vi.fn() }),
}))

vi.mock("@/pages/superMagic/hooks/useTopicMode", () => ({
	default: () => ({ topicMode: TopicMode.General, setTopicMode: vi.fn() }),
}))

vi.mock("@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue", () => ({
	default: () => ({
		queue: [],
		queueStats: {},
		editingQueueItem: null,
		removeFromQueue: vi.fn(),
		sendQueuedMessage: vi.fn(),
		startEditQueueItem: vi.fn(),
		cancelEditQueueItem: vi.fn(),
		addToQueue: vi.fn(),
		finishEditQueueItem: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessagePanel/utils/preload", () => ({
	usePreload: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/hooks", () => ({
	useSceneSelection: () => ({
		currentScene: null,
		shouldShowCurrentSceneBadge: false,
		shouldShowSceneControls: false,
	}),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/stores", () => ({
	buildTopicInputScopeKey: vi.fn(() => "scope"),
	createSceneStateStore: () => ({
		resetState: vi.fn(),
		setInputScopeKey: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/constants/constant", () => ({
	DEFAULT_LAYOUT_CONFIG: {},
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/components/editors/constant", () => ({
	MOBILE_LAYOUT_CONFIG: {},
}))

vi.mock("@/pages/superMagic/utils/isChatWorkspaceProject", () => ({
	isCachedChatWorkspaceProject: () => false,
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModeConfigWithLegacy: vi.fn(() => undefined),
		isModeValid: vi.fn(() => true),
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			organizationCode: "org-1",
			userInfo: { user_id: "user-1" },
		},
	},
}))

vi.mock("../DesktopInputContainer", () => ({
	default: ({ editorContext }: { editorContext: { topicExamplesMode: TopicMode } }) => (
		<div data-testid="topic-examples-mode">{editorContext.topicExamplesMode}</div>
	),
}))

vi.mock("@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer", () => ({
	default: () => null,
}))

vi.mock("../../TaskList", () => ({ default: () => null }))
vi.mock("../../MessagePanel/components/MessageQueue", () => ({ default: () => null }))
vi.mock("@/components/business/MentionPanel/builtin-store", () => ({ default: {} }))

import ProjectPageInputContainer from "../index"

describe("ProjectPageInputContainer", () => {
	beforeEach(() => {
		setCurrentRoleMock.mockClear()
	})

	it("uses the project mode for topic examples without overwriting the home selection", () => {
		const selectedProject = {
			id: "project-1",
			workspace_id: "workspace-1",
			project_mode: TopicMode.PPT,
		} as ProjectListItem
		const selectedTopic = {
			id: "topic-1",
			project_id: selectedProject.id,
			topic_mode: TopicMode.PPT,
		} as Topic

		render(
			<ProjectPageInputContainer
				selectedProject={selectedProject}
				selectedTopic={selectedTopic}
				setSelectedTopic={vi.fn()}
				topicModeLogic={{ topicMode: TopicMode.PPT, setTopicMode: vi.fn() }}
			/>,
		)

		expect(setCurrentRoleMock).not.toHaveBeenCalled()
		expect(screen.getByTestId("topic-examples-mode")).toHaveTextContent(TopicMode.PPT)
	})
})
