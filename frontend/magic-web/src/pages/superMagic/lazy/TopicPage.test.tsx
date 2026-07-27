import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Topic } from "../pages/Workspace/types"
import TopicPage from "./TopicPage"

const mockState = vi.hoisted(() => ({
	isMobile: false,
	projectId: "project-1",
	topicId: "topic-1",
	projectStore: {
		selectedProject: null as { id: string } | null,
	},
	topicStore: {
		selectedTopic: null as Topic | null,
	},
	getProjectDetail: vi.fn(),
	getTopicDetail: vi.fn(),
}))

function createCompleteTopic(): Topic {
	return {
		id: "topic-1",
		project_id: "project-1",
		chat_conversation_id: "conversation-1",
		chat_topic_id: "chat-topic-1",
	} as unknown as Topic
}

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-router", () => ({
	useParams: () => ({
		projectId: mockState.projectId,
		topicId: mockState.topicId,
	}),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => mockState.isMobile,
}))

vi.mock("@/routes/components/Navigate", () => ({
	Navigate: () => <div data-testid="navigate-target" />,
}))

vi.mock("../stores/core", () => ({
	projectStore: mockState.projectStore,
	topicStore: mockState.topicStore,
}))

vi.mock("../services", () => ({
	__esModule: true,
	default: {
		project: {
			getProjectDetail: mockState.getProjectDetail,
		},
		topic: {
			getTopicDetail: mockState.getTopicDetail,
		},
	},
}))

vi.mock("./skeleton/TopicPageDesktopSkeleton", () => ({
	__esModule: true,
	default: () => <div data-testid="desktop-topic-skeleton" />,
}))

vi.mock("./skeleton/TopicPageMobileSkeleton", () => ({
	__esModule: true,
	default: () => <div data-testid="mobile-topic-skeleton" />,
}))

vi.mock("@/pages/superMagic/pages/TopicPage/index.desktop", () => ({
	__esModule: true,
	default: () => <div data-testid="desktop-topic-page" />,
}))

vi.mock("@/pages/superMagicMobile/pages/TopicPage", () => ({
	__esModule: true,
	default: () => <div data-testid="mobile-topic-page" />,
}))

describe("TopicPage desktop route loading", () => {
	beforeEach(() => {
		mockState.isMobile = false
		mockState.projectId = "project-1"
		mockState.topicId = "topic-1"
		mockState.projectStore.selectedProject = null
		mockState.topicStore.selectedTopic = null
		mockState.getProjectDetail.mockReset()
		mockState.getTopicDetail.mockReset()
	})

	it("keeps the existing desktop skeleton while project state is not restored", () => {
		render(<TopicPage />)

		expect(screen.getByTestId("desktop-topic-skeleton")).toBeInTheDocument()
		expect(screen.queryByTestId("desktop-topic-page")).not.toBeInTheDocument()
	})

	it("keeps the skeleton when the route topic only has list fields", () => {
		mockState.projectStore.selectedProject = { id: "project-1" }
		mockState.topicStore.selectedTopic = {
			id: "topic-1",
			project_id: "project-1",
		} as unknown as Topic

		render(<TopicPage />)

		expect(screen.getByTestId("desktop-topic-skeleton")).toBeInTheDocument()
		expect(screen.queryByTestId("desktop-topic-page")).not.toBeInTheDocument()
	})

	it("mounts the desktop topic page after project topic and chat mappings are ready", async () => {
		mockState.projectStore.selectedProject = { id: "project-1" }
		mockState.topicStore.selectedTopic = createCompleteTopic()

		render(<TopicPage />)

		expect(await screen.findByTestId("desktop-topic-page")).toBeInTheDocument()
	})
})
