import { makeAutoObservable, runInAction } from "mobx"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { AppConversationStore } from "./conversation-store"
import { SuperMagicApi } from "@/apis"
import type { ProjectListItem } from "../../Workspace/types"

export type MicroAppConversationType = "development" | "usage"

export class AppRootStore {
	projectId: string | null = null
	initLoading = false
	initError: string | null = null

	readonly developmentConversation: AppConversationStore
	readonly usageConversation: AppConversationStore
	conversationType: MicroAppConversationType = "development"
	runtimeProject: ProjectListItem | null = null
	runtimeProjectState: "unknown" | "absent" | "ready" = "unknown"
	runtimeProjectPromise: Promise<{
		selectedProject: ProjectListItem
		topicStore: AppConversationStore["topicStore"]
	}> | null = null
	readonly projectFilesStore: ProjectFilesStore
	readonly mentionPanelStore: ReturnType<typeof createMentionPanelStore>

	constructor() {
		this.developmentConversation = new AppConversationStore()
		this.usageConversation = new AppConversationStore()
		this.projectFilesStore = new ProjectFilesStore()
		this.mentionPanelStore = createMentionPanelStore(this.projectFilesStore)

		makeAutoObservable(
			this,
			{
				developmentConversation: false,
				usageConversation: false,
				runtimeProjectPromise: false,
				projectFilesStore: false,
				mentionPanelStore: false,
			},
			{ autoBind: true },
		)
	}

	get conversation(): AppConversationStore {
		return this.conversationType === "usage"
			? this.usageConversation
			: this.developmentConversation
	}

	setConversationType(type: MicroAppConversationType) {
		this.conversationType = type
	}

	async loadRuntimeProject(appId: string): Promise<void> {
		this.runtimeProjectState = "unknown"
		try {
			const result = await SuperMagicApi.getMicroAppRuntimeProject(appId, {
				enableErrorMessagePrompt: false,
			})
			if (this.runtimeProject) return
			if (result.exists && result.project) {
				await this.usageConversation.loadProjectContext(result.project.id)
				const loadedProject = this.usageConversation.selectedProject
				if (!loadedProject) throw new Error("Runtime project could not be loaded")
				runInAction(() => {
					this.runtimeProject = loadedProject
					this.runtimeProjectState = "ready"
				})
			} else {
				runInAction(() => {
					this.runtimeProject = null
					this.runtimeProjectState = "absent"
				})
			}
		} catch {
			runInAction(() => {
				this.runtimeProject = null
				this.runtimeProjectState = "absent"
			})
		}
	}

	async ensureUsageProject(appId: string): Promise<{
		selectedProject: ProjectListItem
		topicStore: AppConversationStore["topicStore"]
	}> {
		if (this.runtimeProjectPromise) return this.runtimeProjectPromise
		if (this.runtimeProject) {
			this.conversationType = "usage"
			return {
				selectedProject: this.runtimeProject,
				topicStore: this.usageConversation.topicStore,
			}
		}
		this.runtimeProjectPromise = (async () => {
			const result = await SuperMagicApi.ensureMicroAppRuntimeProject(appId)
			await this.usageConversation.loadProjectContext(result.project.id)
			const loadedProject = this.usageConversation.selectedProject
			if (!loadedProject) throw new Error("Runtime project could not be loaded")
			runInAction(() => {
				this.runtimeProject = loadedProject
				this.runtimeProjectState = "ready"
				this.conversationType = "usage"
			})
			return {
				selectedProject: loadedProject,
				topicStore: this.usageConversation.topicStore,
			}
		})()
		try {
			return await this.runtimeProjectPromise
		} finally {
			this.runtimeProjectPromise = null
		}
	}

	async initFromProjectId(projectId: string): Promise<void> {
		if (this.initLoading) return

		this.initLoading = true
		this.initError = null
		this.projectId = projectId

		try {
			await this.developmentConversation.loadProjectContext(projectId)

			runInAction(() => {
				this.projectFilesStore.setSelectedProject(
					this.developmentConversation.selectedProject,
				)
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
		this.developmentConversation.reset()
		this.usageConversation.reset()
		this.conversationType = "development"
		this.runtimeProject = null
		this.runtimeProjectState = "unknown"
		this.runtimeProjectPromise = null
		this.projectFilesStore.setSelectedProject(null)
	}

	dispose() {
		this.reset()
	}
}
