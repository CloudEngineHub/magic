import { makeAutoObservable, runInAction } from "mobx"
import { SuperMagicApi } from "@/apis"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import { getFileContentsByIds } from "@/pages/superMagic/utils/api"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { TaskStatus, WorkspaceStatus } from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	PANELS_DIR,
	PERSONAS_DIR,
	attachmentVersionKey,
	collectStudyAttachments,
	findStudyDir,
	getAttachmentPath,
	listLibraryFiles,
	parseDiscussionFile,
	parseInterviewFile,
	parsePanelFile,
	parsePersonaFile,
	parseStudyFile,
	type StudyAttachments,
} from "../services/researchFiles"
import type {
	DiscussionFile,
	InterviewFile,
	PanelFile,
	ParsedResearchFile,
	PersonaFile,
	ResearchFileRef,
	StudyFile,
} from "../types"

/** One special project per user holds every study (topic) and the shared persona library. */
export const PERSONA_RESEARCH_PROJECT_KEY = "persona_research"

export type ResearchStoreStatus = "idle" | "loading" | "ready" | "error"

interface ParsedCacheEntry {
	versionKey: string
	result: ParsedResearchFile<unknown>
}

/**
 * Page-level store shared by the research home, studio and persona library routes.
 * It lives in the parent route element, so switching between the three pages keeps the
 * conversation state (including optimistic messages sent from the home composer).
 */
export class PersonaResearchStore {
	status: ResearchStoreStatus = "idle"
	error: unknown = null
	selectedProject: ProjectListItem | null = null
	selectedWorkspace: Workspace | null = null
	attachments: AttachmentItem[] = []
	attachmentList: AttachmentItem[] = []
	isCreatingStudy = false
	isConversationGenerating = false

	/** Parsed library and current-study files, refreshed whenever attachments change. */
	personas: ResearchFileRef<PersonaFile>[] = []
	panels: ResearchFileRef<PanelFile>[] = []
	study: StudyFile | null = null
	studyPanel: PanelFile | null = null
	interviews: ResearchFileRef<InterviewFile>[] = []
	discussions: ResearchFileRef<DiscussionFile>[] = []
	/** True when study.json exists but could not be parsed (half-written or wrong schema). */
	studyFileInvalid = false
	/** Bumped after each content reload so list rows re-read titles from the parse cache. */
	contentVersion = 0
	/** Text the home composer fills once it is ready, e.g. "start a study with these personas". */
	pendingComposerText: string | null = null

	private bootstrapGeneration = 0
	private contentGeneration = 0
	private readonly parsedCache = new Map<string, ParsedCacheEntry>()

	readonly topicStore = new TopicStore()
	readonly projectFilesStore = new ProjectFilesStore()
	readonly topicModelStore = createSuperMagicTopicModelStore()
	readonly mentionPanelStore = createMentionPanelStore(this.projectFilesStore)

	constructor() {
		makeAutoObservable<
			PersonaResearchStore,
			"bootstrapGeneration" | "contentGeneration" | "parsedCache"
		>(
			this,
			{
				bootstrapGeneration: false,
				contentGeneration: false,
				parsedCache: false,
				topicStore: false,
				projectFilesStore: false,
				topicModelStore: false,
				mentionPanelStore: false,
			},
			{ autoBind: true },
		)
	}

	get selectedTopic() {
		return this.topicStore.selectedTopic
	}

	/** Study directory of the selected topic, e.g. "studies/ai-recorder-7f3a/". */
	get studyDir(): string | null {
		return findStudyDir(this.attachmentList, this.selectedTopic?.id)
	}

	get studyAttachments(): StudyAttachments | null {
		const dir = this.studyDir
		return dir ? collectStudyAttachments(this.attachmentList, dir) : null
	}

	/**
	 * Topics shown as studies. Blank topics (never sent, no study files) are hidden; the special
	 * project creates one by default and the home composer reuses it instead of creating more.
	 */
	get studies(): Topic[] {
		return this.topicStore.topics
			.filter((topic) => !this.isBlankTopic(topic))
			.slice()
			.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
	}

	/** Title from study.json when available; otherwise the topic name. */
	studyTitleOf(topic: Topic): string {
		const dir = findStudyDir(this.attachmentList, topic.id)
		const cached = dir ? this.peekStudy(`${dir}study.json`) : null
		return cached?.title || topic.topic_name || ""
	}

	/** Parsed study.json of any topic, for list rows; null until it has been read. */
	studyFileOf(topic: Topic): StudyFile | null {
		const dir = findStudyDir(this.attachmentList, topic.id)
		return dir ? this.peekStudy(`${dir}study.json`) : null
	}

	personaById(personaId: string): PersonaFile | null {
		return this.personas.find((ref) => ref.data.id === personaId)?.data ?? null
	}

	/** Personas used by the current study, in panel order; falls back to interviewed personas. */
	get studyPersonas(): PersonaFile[] {
		const ids =
			this.studyPanel?.persona_ids ?? this.interviews.map((ref) => ref.data.persona_id)
		return ids
			.map((id) => this.personaById(id))
			.filter((persona): persona is PersonaFile => persona !== null)
	}

	async bootstrap(): Promise<void> {
		const generation = ++this.bootstrapGeneration
		this.status = "loading"
		this.error = null
		try {
			const [{ project }] = await Promise.all([
				SuperMagicApi.getSpecialProject({
					key: PERSONA_RESEARCH_PROJECT_KEY,
					project_mode: TopicMode.PersonaResearch,
					topic_mode: TopicMode.PersonaResearch,
				}),
				// Research topics are an internal mode without a mode-list entry; the model picker
				// uses the default mode catalog, the same way micro-app topics do.
				superMagicModeService.fetchDefaultModeModelList(),
			])
			if (generation !== this.bootstrapGeneration) return
			if (!project?.id) throw new Error("persona-research-missing-project")

			this.mentionPanelStore.initLoadAttachments(project.id)
			try {
				const [detail, topicsResponse, attachmentsResponse] = await Promise.all([
					SuperMagicApi.getProjectDetail({ id: project.id }),
					SuperMagicApi.getTopicsByProjectId({ id: project.id, page: 1, page_size: 999 }),
					SuperMagicApi.getAttachmentsByProjectId({
						projectId: project.id,
						temporaryToken: "",
					}),
				])
				if (generation !== this.bootstrapGeneration) return
				const processed = AttachmentDataProcessor.processAttachmentData(attachmentsResponse)
				const topics = Array.isArray(topicsResponse?.list) ? topicsResponse.list : []
				runInAction(() => {
					const resolvedProject = detail?.id ? detail : project
					this.selectedProject = resolvedProject
					this.selectedWorkspace = this.createWorkspaceFromProject(resolvedProject)
					this.projectFilesStore.setSelectedProject(resolvedProject)
					this.topicStore.setTopics(topics.map(withResearchTopicFields))
					this.applyAttachments(processed.tree, processed.list)
					this.status = "ready"
				})
			} finally {
				this.mentionPanelStore.finishLoadAttachmentsPromise(project.id)
			}
			await this.reloadParsedContent()
		} catch (error) {
			if (generation !== this.bootstrapGeneration) return
			runInAction(() => {
				this.status = "error"
				this.error = error
			})
		}
	}

	/** Selects the study for a route param; unknown ids leave the selection empty. */
	selectStudy(topicId: string | undefined) {
		const topic = topicId
			? (this.topicStore.topics.find((item) => item.id === topicId) ?? null)
			: null
		if (this.topicStore.selectedTopic?.id === topic?.id) return
		this.topicStore.setSelectedTopic(topic)
		void this.reloadParsedContent()
	}

	/**
	 * Returns a topic for a new study: reuses the blank default topic when present,
	 * otherwise creates one. The caller sends the first message into it.
	 */
	async prepareStudyTopic(): Promise<Topic | null> {
		const projectId = this.selectedProject?.id
		if (!projectId || this.isCreatingStudy) return null
		const blank = this.topicStore.topics.find((topic) => this.isBlankTopic(topic))
		if (blank) return blank

		this.isCreatingStudy = true
		try {
			const created = await SuperMagicApi.createTopic({
				project_id: projectId,
				topic_name: "",
				project_mode: TopicMode.PersonaResearch,
			})
			if (!created?.id) return null
			const topic = withResearchTopicFields(created as Topic)
			runInAction(() => {
				this.topicStore.setTopics([topic, ...this.topicStore.topics])
			})
			return topic
		} finally {
			runInAction(() => {
				this.isCreatingStudy = false
			})
		}
	}

	/** Deletes the topic and its study directory; persona library files are kept. */
	async deleteStudy(topicId: string): Promise<void> {
		const dir = findStudyDir(this.attachmentList, topicId)
		const fileIds = dir ? this.collectDirectoryFileIds(dir) : []
		await SuperMagicApi.deleteTopic({ id: topicId })
		if (fileIds.length > 0 && this.selectedProject?.id) {
			await SuperMagicApi.deleteFiles({
				file_ids: fileIds,
				project_id: this.selectedProject.id,
			})
		}
		runInAction(() => {
			this.topicStore.removeTopic(topicId)
			if (fileIds.length > 0) {
				const removed = new Set(fileIds)
				this.applyAttachments(
					this.attachments,
					this.attachmentList.filter((item) => !removed.has(String(item.file_id))),
				)
			}
		})
	}

	/** Called by realtime file events and polling with the latest raw project attachments. */
	setAttachments(tree: AttachmentItem[], list: AttachmentItem[]) {
		const processed = AttachmentDataProcessor.processAttachmentData({ tree, list })
		this.applyAttachments(processed.tree, processed.list)
		void this.reloadParsedContent()
	}

	/** Re-reads attachments from the server; used after page visibility returns. */
	async refreshAttachments(): Promise<void> {
		const projectId = this.selectedProject?.id
		if (!projectId) return
		const response = await SuperMagicApi.getAttachmentsByProjectId({
			projectId,
			temporaryToken: "",
		})
		if (this.selectedProject?.id !== projectId) return
		this.setAttachments(response?.tree ?? [], response?.list ?? [])
	}

	async refreshTopics(): Promise<void> {
		const projectId = this.selectedProject?.id
		if (!projectId) return
		const response = await SuperMagicApi.getTopicsByProjectId({
			id: projectId,
			page: 1,
			page_size: 999,
		})
		if (this.selectedProject?.id !== projectId) return
		const topics = Array.isArray(response?.list) ? response.list : []
		runInAction(() => {
			const selectedId = this.topicStore.selectedTopic?.id
			this.topicStore.setTopics(topics.map(withResearchTopicFields))
			if (selectedId) {
				this.topicStore.setSelectedTopic(
					this.topicStore.topics.find((topic) => topic.id === selectedId) ?? null,
				)
			}
		})
	}

	setSelectedTopic(topic: Topic | null) {
		this.topicStore.setSelectedTopic(topic ? withResearchTopicFields(topic) : null)
		void this.reloadParsedContent()
	}

	setSelectedProject(project: ProjectListItem | null) {
		this.selectedProject = project
		this.projectFilesStore.setSelectedProject(project)
	}

	setSelectedWorkspace(workspace: Workspace | null) {
		this.selectedWorkspace = workspace
	}

	setPendingComposerText(text: string | null) {
		this.pendingComposerText = text
	}

	/** Returns and clears the pending composer text so it is applied once. */
	consumePendingComposerText(): string | null {
		const text = this.pendingComposerText
		this.pendingComposerText = null
		return text
	}

	setConversationGenerating(isGenerating: boolean) {
		this.isConversationGenerating = isGenerating
	}

	updateTopicStatus(topicId: string, status: TaskStatus) {
		this.topicStore.updateTopicStatus(topicId, status)
	}

	dispose() {
		this.bootstrapGeneration += 1
		this.contentGeneration += 1
		this.parsedCache.clear()
		this.topicStore.reset()
		this.projectFilesStore.setSelectedProject(null)
		this.projectFilesStore.setWorkspaceFileTree([])
		this.topicModelStore.reset()
	}

	/**
	 * Reads library files and the selected study's files, reusing parsed results whose
	 * attachment version is unchanged. Older runs are discarded when a newer one starts,
	 * and already-rendered data is kept until the new read succeeds.
	 */
	async reloadParsedContent(): Promise<void> {
		const generation = ++this.contentGeneration
		const personaItems = listLibraryFiles(this.attachmentList, PERSONAS_DIR)
		const panelItems = listLibraryFiles(this.attachmentList, PANELS_DIR)
		const study = this.studyAttachments
		const studyItems = study
			? [study.study, study.panel, ...study.interviews, ...study.discussions].filter(
					(item): item is AttachmentItem => item !== null,
				)
			: []
		// Study titles for the list come from every study.json, not only the selected one.
		const studyFileItems = this.topicStore.topics
			.map((topic) => findStudyDir(this.attachmentList, topic.id))
			.filter((dir): dir is string => Boolean(dir))
			.map((dir) => collectStudyAttachments(this.attachmentList, dir).study)
			.filter((item): item is AttachmentItem => item !== null)

		await this.ensureParsed([...personaItems, ...panelItems, ...studyItems, ...studyFileItems])
		if (generation !== this.contentGeneration) return

		runInAction(() => {
			this.personas = this.collectRefs(personaItems, parsePersonaFile)
			this.panels = this.collectRefs(panelItems, parsePanelFile)
			const studyResult = study?.study ? this.getParsed(study.study, parseStudyFile) : null
			this.study = studyResult?.ok ? studyResult.data : null
			this.studyFileInvalid = Boolean(studyResult && !studyResult.ok)
			const panelResult = study?.panel ? this.getParsed(study.panel, parsePanelFile) : null
			this.studyPanel = panelResult?.ok ? panelResult.data : null
			this.interviews = study ? this.collectRefs(study.interviews, parseInterviewFile) : []
			this.discussions = study ? this.collectRefs(study.discussions, parseDiscussionFile) : []
			this.contentVersion += 1
		})
	}

	private async ensureParsed(items: AttachmentItem[]) {
		const stale = items.filter((item) => {
			const cached = this.parsedCache.get(getAttachmentPath(item))
			return !cached || cached.versionKey !== attachmentVersionKey(item)
		})
		if (stale.length === 0) return
		const ids = stale.map((item) => String(item.file_id))
		// forceRefresh: the agent overwrites these files in place; never serve a stale copy.
		const { successes } = await getFileContentsByIds(ids, {
			responseType: "text",
			forceRefresh: true,
		})
		for (const item of stale) {
			const content = successes.get(String(item.file_id))
			if (typeof content !== "string") continue
			let raw: unknown = content
			try {
				raw = JSON.parse(content)
			} catch {
				// Keep the raw string; the parser reports invalid_json.
			}
			this.parsedCache.set(getAttachmentPath(item), {
				versionKey: attachmentVersionKey(item),
				result: { ok: true, data: raw },
			})
		}
	}

	private getParsed<T>(
		item: AttachmentItem,
		parser: (raw: unknown) => ParsedResearchFile<T>,
	): ParsedResearchFile<T> | null {
		const cached = this.parsedCache.get(getAttachmentPath(item))
		if (!cached || !cached.result.ok) return null
		return parser(cached.result.data)
	}

	/** Reads an already-fetched study.json for list rows; never triggers a request. */
	private peekStudy(path: string): StudyFile | null {
		void this.contentVersion
		const cached = this.parsedCache.get(path)
		if (!cached?.result.ok) return null
		const parsed = parseStudyFile(cached.result.data)
		return parsed.ok ? parsed.data : null
	}

	private collectRefs<T>(
		items: AttachmentItem[],
		parser: (raw: unknown) => ParsedResearchFile<T>,
	): ResearchFileRef<T>[] {
		return items.flatMap((item) => {
			const parsed = this.getParsed(item, parser)
			return parsed?.ok
				? [
						{
							fileId: String(item.file_id),
							path: getAttachmentPath(item),
							data: parsed.data,
						},
					]
				: []
		})
	}

	private collectDirectoryFileIds(dir: string): string[] {
		const dirPath = dir.replace(/\/$/, "")
		return this.attachmentList
			.filter((item) => {
				const path = getAttachmentPath(item)
				return path === dirPath || path.startsWith(dir)
			})
			.map((item) => String(item.file_id ?? ""))
			.filter(Boolean)
	}

	private isBlankTopic(topic: Topic): boolean {
		const neverRan = !topic.task_status || topic.task_status === TaskStatus.WAITING
		return neverRan && !topic.topic_name && !findStudyDir(this.attachmentList, topic.id)
	}

	private applyAttachments(tree: AttachmentItem[], list: AttachmentItem[]) {
		this.attachments = tree
		this.attachmentList = list
		this.projectFilesStore.setWorkspaceFileTree(tree)
		this.projectFilesStore.workspaceFilesList = list
	}

	private createWorkspaceFromProject(project: ProjectListItem): Workspace {
		return {
			id: project.workspace_id,
			name: project.workspace_name,
			is_archived: 0,
			current_topic_id: project.current_topic_id,
			current_project_id: project.id,
			workspace_status: WorkspaceStatus.FINISHED,
			project_count: 1,
			// The special project lives in a hidden user workspace; "default" keeps shared send
			// and file flows on their normal (non-chat, non-micro-app) path.
			workspace_type: "default",
		}
	}
}

/** Research topics always run the persona-research agent, whatever the server echoes back. */
export function withResearchTopicFields(topic: Topic): Topic {
	return { ...topic, topic_mode: TopicMode.PersonaResearch }
}
