import { describe, expect, it } from "vitest"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import {
	isChatProjectRouteContextReady,
	isTopicBoundToProject,
	isTopicRouteContextReady,
	shouldCreateFreshTopicForProject,
	shouldRefreshChatProjectState,
	shouldRefreshChatProjectStateOnDesktop,
	shouldRestoreRouteStateFromMainLayout,
	wasProjectRemovedFromLoadedList,
} from "@/pages/superMagic/services/topicProjectConsistency"

function createCompleteTopic(id: string, projectId: string): Topic {
	return {
		id,
		project_id: projectId,
		chat_conversation_id: `conversation-${id}`,
		chat_topic_id: `chat-${id}`,
	} as unknown as Topic
}

describe("topicProjectConsistency", () => {
	it("should require refresh when selected topic does not belong to current chat project", () => {
		const staleTopic = {
			id: "topic-a",
			project_id: "project-a",
		} as unknown as Topic

		expect(
			shouldRefreshChatProjectState({
				projectId: "project-b",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: staleTopic,
			}),
		).toBe(true)
	})

	it("should skip refresh when route project was optimistically removed from a loaded list", () => {
		expect(
			shouldRefreshChatProjectState({
				projectId: "project-deleted",
				selectedProjectId: undefined,
				selectedWorkspaceId: "workspace-1",
				selectedTopic: null,
				loadedProjects: [{ id: "project-other" } as unknown as ProjectListItem],
			}),
		).toBe(false)
	})

	it("should still refresh when project list is empty (cold entry)", () => {
		expect(
			shouldRefreshChatProjectState({
				projectId: "project-b",
				selectedProjectId: undefined,
				selectedWorkspaceId: undefined,
				selectedTopic: null,
				loadedProjects: [],
			}),
		).toBe(true)
	})

	it("wasProjectRemovedFromLoadedList detects optimistic delete", () => {
		expect(
			wasProjectRemovedFromLoadedList("project-a", [
				{ id: "project-b" } as unknown as ProjectListItem,
			]),
		).toBe(true)
		expect(wasProjectRemovedFromLoadedList("project-a", [])).toBe(false)
	})

	it("should allow skipping refresh only when project workspace and topic are all aligned", () => {
		const currentTopic = createCompleteTopic("topic-b", "project-b")

		expect(
			shouldRefreshChatProjectState({
				projectId: "project-b",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: currentTopic,
			}),
		).toBe(false)
	})

	it("keeps topic route blocked until chat mappings are restored", () => {
		const incompleteTopic = {
			id: "topic-b",
			project_id: "project-b",
		} as unknown as Topic

		expect(
			isTopicRouteContextReady({
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedProjectId: "project-b",
				selectedTopic: incompleteTopic,
			}),
		).toBe(false)
		expect(
			isTopicRouteContextReady({
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedProjectId: "project-b",
				selectedTopic: createCompleteTopic("topic-b", "project-b"),
			}),
		).toBe(true)
	})

	it("leaves chat route restoration to ChatProjectPage", () => {
		expect(
			shouldRestoreRouteStateFromMainLayout({
				isChatProjectRoute: true,
				workspaceId: undefined,
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedWorkspaceId: undefined,
				selectedProjectId: undefined,
				selectedTopic: null,
			}),
		).toBe(false)
	})

	it("keeps MainLayout recovery for an incomplete regular topic route", () => {
		expect(
			shouldRestoreRouteStateFromMainLayout({
				isChatProjectRoute: false,
				workspaceId: undefined,
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedWorkspaceId: "workspace-1",
				selectedProjectId: "project-b",
				selectedTopic: {
					id: "topic-b",
					project_id: "project-b",
				} as unknown as Topic,
			}),
		).toBe(true)
	})

	it("keeps chat project route blocked while a full topic context is still loading", () => {
		expect(
			isChatProjectRouteContextReady({
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: null,
			}),
		).toBe(false)
		expect(
			isChatProjectRouteContextReady({
				projectId: "project-b",
				routeTopicId: "topic-b",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: createCompleteTopic("topic-b", "project-b"),
			}),
		).toBe(true)
	})

	it("allows a restored read-only chat project without selected topic", () => {
		expect(
			isChatProjectRouteContextReady({
				projectId: "project-b",
				routeTopicId: undefined,
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: null,
				isSelectedProjectReadOnly: true,
			}),
		).toBe(true)
	})

	it("should request a fresh topic before send when topic belongs to another project", () => {
		const selectedProject = { id: "project-b" } as unknown as ProjectListItem
		const staleTopic = {
			id: "topic-a",
			project_id: "project-a",
		} as unknown as Topic
		const currentTopic = {
			id: "topic-b",
			project_id: "project-b",
		} as unknown as Topic

		expect(shouldCreateFreshTopicForProject(selectedProject, staleTopic)).toBe(true)
		expect(isTopicBoundToProject(currentTopic, "project-b")).toBe(true)
	})

	it("should skip desktop refresh while switchChatProjectInDesktop is in flight", () => {
		expect(
			shouldRefreshChatProjectStateOnDesktop({
				projectId: "project-a",
				routeTopicId: "topic-a",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: null,
				isDesktopChatSwitchInProgress: true,
			}),
		).toBe(false)
	})

	it("should refresh desktop state when URL points to a different active project", () => {
		expect(
			shouldRefreshChatProjectStateOnDesktop({
				projectId: "project-a",
				routeTopicId: "topic-a",
				selectedProjectId: "project-b",
				selectedWorkspaceId: "workspace-1",
				selectedTopic: null,
				loadedProjects: [{ id: "project-a" } as unknown as ProjectListItem],
			}),
		).toBe(true)
	})

	it("should still refresh on desktop cold start when store is empty", () => {
		expect(
			shouldRefreshChatProjectStateOnDesktop({
				projectId: "project-a",
				routeTopicId: "topic-a",
				selectedProjectId: undefined,
				selectedWorkspaceId: undefined,
				selectedTopic: null,
				loadedProjects: [],
			}),
		).toBe(true)
	})
})
