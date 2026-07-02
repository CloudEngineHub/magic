import { makeAutoObservable, runInAction } from "mobx"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { AppConversationStore } from "./conversation-store"

export class AppRootStore {
	projectId: string | null = null
	initLoading = false
	initError: string | null = null

	readonly conversation: AppConversationStore
	readonly projectFilesStore: ProjectFilesStore
	readonly mentionPanelStore: ReturnType<typeof createMentionPanelStore>

	constructor() {
		this.conversation = new AppConversationStore()
		this.projectFilesStore = new ProjectFilesStore()
		this.mentionPanelStore = createMentionPanelStore(this.projectFilesStore)

		makeAutoObservable(
			this,
			{
				conversation: false,
				projectFilesStore: false,
				mentionPanelStore: false,
			},
			{ autoBind: true },
		)
	}

	async initFromProjectId(projectId: string): Promise<void> {
		if (this.initLoading) return

		this.initLoading = true
		this.initError = null
		this.projectId = projectId

		try {
			await this.conversation.loadProjectContext(projectId)

			runInAction(() => {
				this.projectFilesStore.setSelectedProject(this.conversation.selectedProject)
			})
		} catch (error) {
			runInAction(() => {
				this.initError = error instanceof Error ? error.message : "Failed to load project"
			})
		} finally {
			runInAction(() => {
				this.initLoading = false
			})
		}
	}

	reset() {
		this.projectId = null
		this.initLoading = false
		this.initError = null
		this.conversation.reset()
		this.projectFilesStore.setSelectedProject(null)
	}

	dispose() {
		this.reset()
	}
}
