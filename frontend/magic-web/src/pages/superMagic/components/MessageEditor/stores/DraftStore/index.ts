import { makeAutoObservable, runInAction, reaction } from "mobx"
import type { JSONContent } from "@/infrastructure/editors/tiptap/react"
import type { DraftData, DraftKey, QueueDraftMetadata, QueueDraftSnapshot } from "../../types"
import type { DataService } from "@/components/business/MentionPanel/types"
import { draftManager } from "../../services/draftService"
import { hasMeaningfulData } from "../../services/draftService/utils"
import {
	filterPendingCanvasMentionsFromContent,
	filterUploadFileMentionsFromContent,
	hasLoadingMarkerInContent,
} from "../../utils/mention"
import { cloneDeep, isEqual } from "lodash-es"
import i18next from "i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { userStore } from "@/models/user"
import { transformInspectorContent } from "../../extensions/inspector-detail"
import { collectMentionItemsFromContent } from "../../services/uploadMentionService"
import { EditorStore } from "../EditorStore"
import { syncDraftMarkersToSuperMagicManager } from "./lazy-super-magic-marker-manager"

interface MentionPanelStoreLike extends DataService {
	getInitLoadAttachmentsPromise?: (projectId: string) => Promise<unknown>
}

interface LoadDraftOptions {
	isClearContent?: boolean
	replaceDirectly?: boolean
	mentionPanelStore?: MentionPanelStoreLike
}

interface SaveDraftOptions {
	value: JSONContent | undefined
	mentionPanelStore?: DataService
	shouldReloadDraftBox?: boolean
}

interface SaveDraftOnBlurOptions {
	value: JSONContent | undefined
	mentionPanelStore?: DataService
	onError?: (error: unknown) => void
}

interface CreateSentDraftOptions {
	value: JSONContent | undefined
	onError?: (error: unknown) => void
}

export class DraftStore {
	editorStore: EditorStore
	draftKey: DraftKey | null = null
	isDraftReady = false
	isSendingGuard = false
	loadDraftPromise: Promise<void> | null = null
	isDraftsLoading = false
	drafts: DraftData[] = []
	queueDraft: QueueDraftMetadata | undefined = undefined

	private loadRevision = 0

	private clearContentHandler: (() => void) | null = null
	private mentionPanelStore: MentionPanelStoreLike | null = null

	constructor(editorStore: EditorStore) {
		this.editorStore = editorStore

		makeAutoObservable(
			this,
			{},
			{
				autoBind: true,
			},
		)
	}

	setDraftKey(draftKey: DraftKey | null) {
		const nextKey = draftKey
			? {
					...draftKey,
					userId: userStore.user.userInfo?.user_id,
					organizationCode: userStore.user.userInfo?.organization_code,
				}
			: null
		if (!isEqual(this.draftKey, nextKey)) {
			this.loadRevision += 1
			this.queueDraft = undefined
			this.isDraftReady = false
		}
		this.draftKey = nextKey
	}

	/** Enables normal draft saving when the initial restore is skipped or fails. */
	markDraftReady() {
		this.isDraftReady = true
	}

	setClearContentHandler(handler: () => void) {
		this.clearContentHandler = handler
	}

	setMentionPanelStore(store: MentionPanelStoreLike) {
		this.mentionPanelStore = store
	}

	startSendingGuard() {
		this.isSendingGuard = true
	}

	resetSendingGuard() {
		this.isSendingGuard = false
	}

	handleContentChange({
		value,
		mentionPanelStore,
		isComposing,
	}: {
		value: JSONContent | undefined
		mentionPanelStore?: DataService
		isComposing: boolean
	}) {
		if (!this.isDraftReady || this.isSendingGuard || isComposing) return
		this.saveDraft({ value, mentionPanelStore })
	}

	saveDraft({ value, mentionPanelStore, shouldReloadDraftBox = true }: SaveDraftOptions) {
		if (hasLoadingMarkerInContent(value)) return

		const draftKey = this.getDraftKey()
		if (!draftKey) return

		const dataService = mentionPanelStore ?? this.mentionPanelStore ?? undefined
		const valueWithoutPending = filterPendingCanvasMentionsFromContent(value)
		const filteredValue =
			valueWithoutPending && dataService
				? filterUploadFileMentionsFromContent(valueWithoutPending, dataService, {
						preserveMentionValidation: this.editorStore.preserveMentionContent,
					})
				: valueWithoutPending

		draftManager.saveDraft({
			...draftKey,
			value: filteredValue,
			queueDraft: this.queueDraft,
			mentionItems: collectMentionItemsFromContent(filteredValue),
		})

		if (shouldReloadDraftBox) {
			this.reloadDraftBoxIfHidden()
		}
	}

	async saveDraftOnBlur({ value, mentionPanelStore, onError }: SaveDraftOnBlurOptions) {
		if (this.isSendingGuard || (this.queueDraft && !this.isDraftReady)) return
		if (hasLoadingMarkerInContent(value)) return

		const draftKey = this.getDraftKey()
		if (!draftKey) return

		const dataService = mentionPanelStore ?? this.mentionPanelStore ?? undefined
		const valueWithoutPending = filterPendingCanvasMentionsFromContent(value)
		const filteredValue =
			valueWithoutPending && dataService
				? filterUploadFileMentionsFromContent(valueWithoutPending, dataService, {
						preserveMentionValidation: this.editorStore.preserveMentionContent,
					})
				: valueWithoutPending

		try {
			await draftManager.saveDraft({
				...draftKey,
				value: filteredValue,
				queueDraft: this.queueDraft,
				mentionItems: collectMentionItemsFromContent(filteredValue),
			})
		} catch (error) {
			onError?.(error)
		}
	}

	async createSentDraft({ value, onError }: CreateSentDraftOptions) {
		const draftKey = this.getDraftKey()
		if (!draftKey) {
			this.scheduleSendingGuardReset()
			return
		}

		try {
			const valueWithoutPending = filterPendingCanvasMentionsFromContent(value)
			await draftManager.createSentDraft({
				...draftKey,
				value: valueWithoutPending,
			})
			await this.loadDraftVersions({ loading: false })
		} catch (error) {
			onError?.(error)
		} finally {
			this.scheduleSendingGuardReset()
		}
	}

	async loadLatestDraft(options: LoadDraftOptions = {}) {
		const draftKey = this.getDraftKey()
		if (!draftKey) return

		const loadPromise = this.loadLatestDraftInternal(draftKey, options)
		this.loadDraftPromise = loadPromise.finally(() => {
			runInAction(() => {
				this.loadDraftPromise = null
			})
		})

		return this.loadDraftPromise
	}

	waitForLoadDraft() {
		return this.loadDraftPromise ?? Promise.resolve()
	}

	async useDraft(selectedDraft: DraftData, mentionPanelStore?: MentionPanelStoreLike) {
		let draft = selectedDraft
		if (draft.queueDraft) {
			if (
				!this.matchesDraftScope(
					this.pinQueueDraft({ ...draft, queueDraft: draft.queueDraft }),
				)
			) {
				magicToast.warning(i18next.t("messageQueue.draftTopicMismatch", { ns: "super" }))
				return
			}
			const canonical = await draftManager.loadDraftByVersion(
				this.pinQueueDraft({ ...draft, queueDraft: draft.queueDraft }),
				`queue/${draft.queueDraft.clientSyncId}`,
			)
			// 历史版本可以复用正文，但提交状态以这一份队列草稿的最新记录为准。
			if (canonical) draft = { ...draft, queueDraft: canonical.queueDraft }
		}
		if (draft.queueDraft && this.draftKey) {
			if (
				!this.matchesDraftScope(
					this.pinQueueDraft({ ...draft, queueDraft: draft.queueDraft }),
				)
			)
				throw new Error("queue_draft_scope_changed")
			await draftManager.saveDraftStrict(
				{
					...this.draftKey,
					value: this.editorStore.value,
					mentionItems: collectMentionItemsFromContent(this.editorStore.value),
					queueDraft: this.queueDraft,
				},
				true,
			)
		}
		await this.loadDraft(draft, {
			isClearContent: false,
			replaceDirectly: false,
			mentionPanelStore,
		})
		this.editorStore.focus()
	}

	async loadDraftVersions(options: { loading?: boolean } = { loading: true }) {
		const draftKey = this.getDraftKey()
		if (!draftKey) return

		if (options.loading) {
			this.isDraftsLoading = true
		}

		try {
			const versions = await draftManager.loadProjectDraftVersions({
				workspaceId: draftKey.workspaceId,
				projectId: draftKey.projectId,
			})

			const allDrafts: DraftData[] = []

			for (const version of versions) {
				const versionKey = {
					workspaceId: draftKey.workspaceId,
					projectId: draftKey.projectId,
					topicId: version.topicId || draftKey.topicId,
				}
				const versionData = await draftManager.loadDraftByVersion(
					versionKey,
					version.versionId,
				)
				if (versionData && hasMeaningfulData(versionData)) {
					allDrafts.push(versionData)
				}
			}

			allDrafts.sort((a, b) => b.updatedAt - a.updatedAt)
			runInAction(() => {
				this.drafts = allDrafts
			})
		} catch (error) {
			console.error("Failed to load drafts:", error)
		} finally {
			if (options.loading) {
				runInAction(() => {
					this.isDraftsLoading = false
				})
			}
		}
	}

	async deleteDraftVersion(draft: DraftData) {
		if (!draft.versionId) return

		const baseKey = this.getDraftKey()
		const draftKey = {
			workspaceId: draft.workspaceId || baseKey?.workspaceId || "global",
			projectId: draft.projectId || baseKey?.projectId || "",
			topicId: draft.topicId || baseKey?.topicId || "",
		}

		if (!draftKey.projectId || !draftKey.topicId) return

		try {
			await draftManager.deleteDraftVersion(draftKey, draft.versionId)
			await this.loadDraftVersions({ loading: false })
		} catch (error) {
			console.error("Failed to delete draft:", error)
		}
	}

	getQueueDraft(): QueueDraftSnapshot | null {
		if (!this.draftKey || !this.queueDraft) return null
		return {
			...this.draftKey,
			value: this.editorStore.value,
			mentionItems: collectMentionItemsFromContent(this.editorStore.value),
			queueDraft: this.queueDraft,
		}
	}

	subscribeQueueDraft(listener: (draft: QueueDraftSnapshot | null) => void) {
		return reaction(
			() => this.queueDraft,
			() => listener(this.getQueueDraft()),
			{ fireImmediately: true },
		)
	}

	async prepareQueueDraft(draft: QueueDraftSnapshot): Promise<void> {
		await this.waitForLoadDraft()
		if (!this.matchesDraftScope(draft)) throw new Error("queue_draft_scope_changed")
		if (hasLoadingMarkerInContent(this.editorStore.value))
			throw new Error("queue_draft_not_ready")
		await draftManager.saveDraftStrict(
			{
				...draft,
				value: this.editorStore.value,
				mentionItems: collectMentionItemsFromContent(this.editorStore.value),
				queueDraft: this.queueDraft,
			},
			true,
		)
		await draftManager.saveDraftStrict(this.pinQueueDraft(draft))
	}

	async restoreQueueDraft(draft: QueueDraftSnapshot, activate = true): Promise<void> {
		const previousValue = cloneDeep(this.editorStore.value)
		if (
			!activate &&
			this.matchesDraftScope(draft) &&
			this.queueDraft?.clientSyncId === draft.queueDraft.clientSyncId
		) {
			this.queueDraft = cloneDeep(draft.queueDraft)
		}
		await draftManager.saveDraftStrict(this.pinQueueDraft(draft))
		if (
			!this.matchesDraftScope(draft) ||
			!activate ||
			!isEqual(previousValue, this.editorStore.value)
		)
			return
		await this.loadDraft({ ...draft, createdAt: Date.now(), updatedAt: Date.now() })
		this.editorStore.focus()
	}

	async keepQueueDraft(): Promise<void> {
		const draft = this.getQueueDraft()
		if (!draft) return
		await draftManager.saveDraftStrict(this.pinQueueDraft(draft))
		if (
			!this.matchesDraftScope(draft) ||
			this.queueDraft?.clientSyncId !== draft.queueDraft.clientSyncId ||
			!isEqual(this.editorStore.value, draft.value)
		)
			return
		// 保留已有版本，再写空输入；不调用任何重新入队接口。
		await draftManager.saveDraftStrict(
			{ ...draft, value: undefined, mentionItems: [], queueDraft: undefined },
			true,
		)
		if (!this.matchesDraftScope(draft) || !isEqual(this.editorStore.value, draft.value)) return
		runInAction(() => {
			this.queueDraft = undefined
			this.clearContentHandler?.()
		})
		await this.loadDraftVersions({ loading: false })
	}

	async completeQueueDraft(syncId: string, submittedValue?: JSONContent): Promise<boolean> {
		const draft = this.getQueueDraft()
		if (!draft || draft.queueDraft.clientSyncId !== syncId) return false
		const valueAtConfirmation = cloneDeep(this.editorStore.value)
		const shouldClear = isEqual(valueAtConfirmation, submittedValue)
		// 覆盖这一份队列草稿的来源信息，草稿箱再次恢复只复用内容。
		// 先停止给新输入附加旧来源，再排入严格保存，避免后续自动保存恢复旧提交意图。
		this.queueDraft = undefined
		try {
			await draftManager.saveDraftStrict({
				...this.pinQueueDraft(draft),
				queueDraft: undefined,
				versionId: `queue/${syncId}`,
			})
		} catch (error) {
			if (this.matchesDraftScope(draft) && this.queueDraft === undefined) {
				runInAction(() => {
					this.queueDraft = draft.queueDraft
				})
			}
			throw error
		}
		if (!this.matchesDraftScope(draft) || this.queueDraft !== undefined) return false
		runInAction(() => {
			this.queueDraft = undefined
		})
		if (shouldClear && isEqual(this.editorStore.value, valueAtConfirmation)) {
			await draftManager.saveDraftStrict(
				{ ...draft, value: undefined, mentionItems: [], queueDraft: undefined },
				true,
			)
			return (
				this.matchesDraftScope(draft) &&
				isEqual(this.editorStore.value, valueAtConfirmation)
			)
		}
		await draftManager.saveDraftStrict(
			{
				...draft,
				value: this.editorStore.value,
				mentionItems: collectMentionItemsFromContent(this.editorStore.value),
				queueDraft: undefined,
			},
			true,
		)
		return false
	}

	private pinQueueDraft(draft: QueueDraftSnapshot): QueueDraftSnapshot {
		return {
			...draft,
			userId: draft.queueDraft.userId,
			organizationCode: draft.queueDraft.organizationCode,
		}
	}

	private matchesDraftScope(draft: DraftKey): boolean {
		return Boolean(
			this.draftKey &&
			this.draftKey.projectId === draft.projectId &&
			this.draftKey.topicId === draft.topicId &&
			this.draftKey.workspaceId === draft.workspaceId &&
			(!draft.userId || draft.userId === userStore.user.userInfo?.user_id) &&
			(!draft.organizationCode ||
				draft.organizationCode === userStore.user.userInfo?.organization_code),
		)
	}

	dispose() {
		this.loadRevision += 1
		this.clearContentHandler = null
		this.mentionPanelStore = null
		this.loadDraftPromise = null
	}

	private async loadLatestDraftInternal(draftKey: DraftKey, options: LoadDraftOptions) {
		const draft = await draftManager.loadLatestDraftVersion(draftKey)
		if (this.matchesDraftScope(draftKey)) await this.loadDraft(draft, options)
	}

	private async loadDraft(
		draft: DraftData | null,
		{ isClearContent = true, replaceDirectly = true, mentionPanelStore }: LoadDraftOptions = {},
	) {
		const revision = ++this.loadRevision
		const previousValue = cloneDeep(this.editorStore.value)
		this.isDraftReady = false

		if (!draft) {
			this.queueDraft = undefined
			if (isClearContent) {
				this.clearContentHandler?.()
			}
			this.isDraftReady = true
			return
		}

		const loadScope = this.draftKey
		const dataService = mentionPanelStore ?? this.mentionPanelStore ?? undefined
		try {
			const projectId = this.draftKey?.projectId || draft.projectId
			const preloadPromise = dataService?.getInitLoadAttachmentsPromise?.(projectId)

			if (preloadPromise) {
				const result = await Promise.race([
					Promise.all([preloadPromise]),
					new Promise((resolve) =>
						setTimeout(() => {
							resolve("timeout")
						}, 2000),
					),
				])

				if (result === "timeout")
					console.warn("Preload mention list timed out, continuing with draft loading...")
			}
		} catch (error) {
			console.error("Failed to preload mention list:", error)
		}
		if (!loadScope || !this.matchesDraftScope(loadScope) || this.loadRevision !== revision)
			return
		if (
			draft.queueDraft &&
			!this.matchesDraftScope(this.pinQueueDraft({ ...draft, queueDraft: draft.queueDraft }))
		)
			return
		if (replaceDirectly ? draft.value : true) {
			await syncDraftMarkersToSuperMagicManager(draft)
			if (!this.matchesDraftScope(loadScope) || this.loadRevision !== revision) return

			const valueWithoutPending = filterPendingCanvasMentionsFromContent(draft.value)
			const filteredContent =
				valueWithoutPending && dataService
					? filterUploadFileMentionsFromContent(valueWithoutPending, dataService, {
							preserveMentionValidation: true,
						})
					: valueWithoutPending
			if (draft.queueDraft && !isEqual(previousValue, this.editorStore.value)) {
				this.markDraftReady()
				return
			}
			runInAction(() => {
				this.queueDraft = draft.queueDraft ? cloneDeep(draft.queueDraft) : undefined
			})
			this.editorStore.updateContent(
				draft.queueDraft && filteredContent
					? transformInspectorContent(filteredContent)
					: filteredContent,
				{ preserveMentionValidation: true },
			)
		}

		runInAction(() => {
			if (!draft.queueDraft) this.queueDraft = undefined
			this.isDraftReady = true
		})
	}

	getDraftKey() {
		if (!this.draftKey) return null
		return this.draftKey
	}

	private reloadDraftBoxIfHidden() {
		if (this.drafts.length > 0) return

		setTimeout(() => {
			this.loadDraftVersions({ loading: false })
		}, 1000)
	}

	private scheduleSendingGuardReset() {
		// Keep delayed reset to avoid blur save race
		setTimeout(() => {
			this.resetSendingGuard()
		}, 1000)
	}
}
