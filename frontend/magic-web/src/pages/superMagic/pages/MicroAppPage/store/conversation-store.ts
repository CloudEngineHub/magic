import { makeAutoObservable } from "mobx"
import { SuperMagicApi } from "@/apis"
import { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { type ProjectListItem, type TaskStatus, type Topic } from "../../Workspace/types"

interface ConversationHydration {
	project: ProjectListItem | null
	topics: Topic[]
	selectedTopicId?: string | null
}

export class AppConversationStore {
	selectedProject: ProjectListItem | null = null
	topicStore: TopicStore = new TopicStore()
	isConversationGenerating = false

	constructor() {
		makeAutoObservable(this, { topicStore: false }, { autoBind: true })
	}

	hydrate({ project, topics, selectedTopicId }: ConversationHydration) {
		this.selectedProject = project
		this.topicStore.setTopics(topics)

		// Route changes reload the project context. Replace the selected topic as well so the
		// history panel and message list never keep a topic from the previous project.
		const targetTopic =
			topics.find((topic) => topic.id === selectedTopicId) || topics[0] || null
		this.topicStore.setSelectedTopic(targetTopic)
	}

	setSelectedProject(project: ProjectListItem | null) {
		this.selectedProject = project
	}

	async loadProjectContext(projectId: string): Promise<void> {
		const project = await SuperMagicApi.getProjectDetail({ id: projectId })
		if (!project) {
			this.reset()
			return
		}

		const response = await SuperMagicApi.getTopicsByProjectId({
			id: project.id,
			page: 1,
			page_size: 999,
		})

		this.hydrate({
			project,
			topics: response.list,
			selectedTopicId: project.current_topic_id,
		})
	}

	setConversationGenerating(isGenerating: boolean) {
		this.isConversationGenerating = isGenerating
	}

	updateTopicStatus(topicId: string, status: TaskStatus) {
		this.topicStore.updateTopicStatus(topicId, status)
	}

	reset() {
		this.selectedProject = null
		this.isConversationGenerating = false
		this.topicStore.reset()
	}
}
