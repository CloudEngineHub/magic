import { describe, expect, it } from "vitest"
import type { ProjectListItem, Topic } from "../../../Workspace/types"
import { AppConversationStore } from "../conversation-store"

function createTopic(id: string, projectId: string): Topic {
	return {
		id,
		project_id: projectId,
		topic_name: id,
	} as Topic
}

describe("AppConversationStore", () => {
	it("replaces the selected topic when project context is rehydrated", () => {
		const store = new AppConversationStore()
		const firstProject = { id: "project-1" } as ProjectListItem
		const secondProject = { id: "project-2" } as ProjectListItem
		const firstTopic = createTopic("topic-1", firstProject.id)
		const secondTopic = createTopic("topic-2", secondProject.id)

		store.hydrate({
			project: firstProject,
			topics: [firstTopic],
			selectedTopicId: firstTopic.id,
		})
		store.hydrate({
			project: secondProject,
			topics: [secondTopic],
			selectedTopicId: secondTopic.id,
		})

		expect(store.selectedProject).toMatchObject(secondProject)
		expect(store.topicStore.selectedTopic).toMatchObject(secondTopic)

		store.hydrate({ project: secondProject, topics: [], selectedTopicId: null })
		expect(store.topicStore.selectedTopic).toBeNull()
	})
})
