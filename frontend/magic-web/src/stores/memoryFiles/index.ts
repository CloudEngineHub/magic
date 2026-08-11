import { makeAutoObservable, observable } from "mobx"
import { userStore } from "@/models/user"
import { configStore } from "@/models/config"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

export interface MemoryFilesIdentity {
	userId?: string
	organizationCode?: string
	clusterCode?: string
}

export interface MemoryFilesSnapshot {
	attachments: AttachmentItem[]
	hasLoaded: boolean
	loading: boolean
	loadError: boolean
}

type MemoryFilesLoader = (
	publishAttachments: (attachments: AttachmentItem[]) => void,
) => Promise<AttachmentItem[]>
type MemoryFilesIdentityKeyResolver = () => string | null

const EMPTY_ATTACHMENTS: AttachmentItem[] = []
const PENDING_SNAPSHOT: MemoryFilesSnapshot = {
	attachments: EMPTY_ATTACHMENTS,
	hasLoaded: false,
	loading: true,
	loadError: false,
}

export function createMemoryFilesIdentityKey(identity: MemoryFilesIdentity) {
	const { userId, organizationCode, clusterCode } = identity
	return [clusterCode, organizationCode, userId].join(":")
}

function resolveCurrentMemoryFilesIdentityKey() {
	const userInfo = userStore.user.userInfo
	return createMemoryFilesIdentityKey({
		userId: userInfo?.user_id,
		organizationCode: userStore.user.organizationCode || userInfo?.organization_code,
		clusterCode: configStore.cluster.clusterCode || "global",
	})
}

/** Memory file state and request lifecycle. */
export class MemoryFilesStore {
	private loadedIdentityKey: string | null = null
	private requestVersion = 0
	attachments: AttachmentItem[] = []
	hasLoaded = false
	loading = false
	loadError = false

	constructor(
		private readonly resolveIdentityKey: MemoryFilesIdentityKeyResolver = resolveCurrentMemoryFilesIdentityKey,
	) {
		makeAutoObservable(
			this,
			{
				attachments: observable.ref,
				resolveIdentityKey: false,
			},
			{ autoBind: true },
		)
	}

	/** Identity used by attachment requests. */
	get currentIdentityKey() {
		return this.resolveIdentityKey()
	}

	/** Read data only for the active identity. */
	getSnapshot(): MemoryFilesSnapshot {
		const identityKey = this.currentIdentityKey
		if (!identityKey || this.loadedIdentityKey !== identityKey) return PENDING_SNAPSHOT

		return {
			attachments: this.attachments,
			hasLoaded: this.hasLoaded,
			loading: this.loading,
			loadError: this.loadError,
		}
	}

	/** Update the active identity's tree. */
	setAttachments(attachments: AttachmentItem[]) {
		const identityKey = this.currentIdentityKey
		if (!identityKey || this.loadedIdentityKey !== identityKey) return
		this.commitAttachments(attachments)
	}

	/** Load the tree and handle silent refresh and stale requests. */
	async load(loader: MemoryFilesLoader, options?: { silent?: boolean }): Promise<void> {
		const identityKey = this.currentIdentityKey
		this.activateIdentity(identityKey)
		if (!identityKey) return

		const requestVersion = ++this.requestVersion
		const silent = options?.silent ?? this.hasLoaded
		this.loading = !silent
		this.loadError = false

		const publishAttachments = (attachments: AttachmentItem[]) => {
			if (!this.isCurrentRequest(identityKey, requestVersion)) return
			this.commitAttachments(attachments)
		}

		try {
			const attachments = await loader(publishAttachments)
			publishAttachments(attachments)
		} catch (error) {
			const isAbortError = (error as { name?: string })?.name === "AbortError"
			if (this.isCurrentRequest(identityKey, requestVersion) && !silent && !isAbortError) {
				this.loadError = true
			}
			throw error
		} finally {
			if (this.isCurrentRequest(identityKey, requestVersion)) this.loading = false
		}
	}

	private activateIdentity(identityKey: string | null) {
		if (this.loadedIdentityKey === identityKey) return
		this.loadedIdentityKey = identityKey
		this.requestVersion += 1
		this.attachments = []
		this.hasLoaded = false
		this.loading = false
		this.loadError = false
	}

	private isCurrentRequest(identityKey: string, requestVersion: number) {
		return (
			this.currentIdentityKey === identityKey &&
			this.loadedIdentityKey === identityKey &&
			this.requestVersion === requestVersion
		)
	}

	private commitAttachments(attachments: AttachmentItem[]) {
		this.attachments = attachments
		this.hasLoaded = true
	}
}

const memoryFilesStore = new MemoryFilesStore()

export default memoryFilesStore
