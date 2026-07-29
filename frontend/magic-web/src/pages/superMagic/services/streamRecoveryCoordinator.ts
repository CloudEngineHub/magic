import { superMagicStore } from "@/pages/superMagic/stores"
import type { StreamRecoveryRequestPayload } from "@/pages/superMagic/stores/types"

export type StreamRecoveryOwnerToken = symbol

export interface StreamRecoveryResult {
	didPullSucceed: boolean
}

export interface StreamRecoveryContext extends StreamRecoveryRequestPayload {
	conversationId: string
	syncGeneration: number
}

export interface StreamRecoveryOwnerRegistration {
	ownerToken: StreamRecoveryOwnerToken
	topicId: string
	conversationId: string
	getTaskStatus: () => string | undefined
	recover: (context: StreamRecoveryContext) => Promise<StreamRecoveryResult>
}

interface StreamRecoveryStore {
	registerOnStreamRecoveryRequested: (
		callback: (payload: StreamRecoveryRequestPayload) => void,
	) => () => void
	beginTopicSync: (topicId: string) => number
	isTopicSyncCurrent: (topicId: string, generation: number) => boolean
	completeTopicSync: (
		topicId: string,
		generation: number,
		result: { succeeded: boolean; taskStatus?: string; latestSeqId?: string },
	) => boolean
	cancelTopicSync: (topicId: string, generation: number) => void
	getLatestMessageSeqId: (topicId: string) => string
}

interface RegisteredRecoveryOwner extends StreamRecoveryOwnerRegistration {
	registrationOrder: number
}

interface InFlightRecovery {
	topicId: string
	generation: number
	owner: RegisteredRecoveryOwner
}

/**
 * Store watchdog 与 React Hook 之间的单例协调器。
 *
 * Store listener 在模块生命周期内只注册一次；每个 Hook 只登记当前可用的
 * topic/conversation 上下文。同一 topic 同时只能存在一个 HTTP recovery generation。
 */
export class StreamRecoveryCoordinator {
	private listenerRegistered = false
	private registrationOrder = 0
	private readonly owners = new Map<StreamRecoveryOwnerToken, RegisteredRecoveryOwner>()
	private readonly inFlightRecoveries = new Map<string, InFlightRecovery>()

	constructor(private readonly store: StreamRecoveryStore) {}

	registerOwner(registration: StreamRecoveryOwnerRegistration): () => void {
		this.ensureStoreListenerRegistered()

		const previousOwner = this.owners.get(registration.ownerToken)
		if (previousOwner) this.unregisterOwner(previousOwner)

		const registeredOwner: RegisteredRecoveryOwner = {
			...registration,
			registrationOrder: ++this.registrationOrder,
		}
		this.owners.set(registration.ownerToken, registeredOwner)
		const inFlightRecovery = this.inFlightRecoveries.get(registration.topicId)
		if (inFlightRecovery && inFlightRecovery.owner !== registeredOwner) {
			this.inFlightRecoveries.delete(registration.topicId)
			this.store.cancelTopicSync(registration.topicId, inFlightRecovery.generation)
		}

		return () => {
			if (this.owners.get(registration.ownerToken) !== registeredOwner) return
			this.unregisterOwner(registeredOwner)
		}
	}

	private ensureStoreListenerRegistered() {
		if (this.listenerRegistered) return
		this.store.registerOnStreamRecoveryRequested((payload) => {
			this.handleRecoveryRequested(payload)
		})
		this.listenerRegistered = true
	}

	private unregisterOwner(owner: RegisteredRecoveryOwner) {
		if (this.owners.get(owner.ownerToken) === owner) {
			this.owners.delete(owner.ownerToken)
		}

		const inFlightRecovery = this.inFlightRecoveries.get(owner.topicId)
		if (inFlightRecovery?.owner !== owner) return
		this.inFlightRecoveries.delete(owner.topicId)
		this.store.cancelTopicSync(owner.topicId, inFlightRecovery.generation)
	}

	private handleRecoveryRequested(payload: StreamRecoveryRequestPayload) {
		if (this.inFlightRecoveries.has(payload.topicId)) return

		const owner = this.selectCurrentOwner(payload.topicId)
		if (!owner) return

		// Must happen before recover() reaches its first await so Store can merge later watchdogs.
		const generation = this.store.beginTopicSync(payload.topicId)
		const inFlightRecovery: InFlightRecovery = {
			topicId: payload.topicId,
			generation,
			owner,
		}
		this.inFlightRecoveries.set(payload.topicId, inFlightRecovery)

		void this.executeRecovery(inFlightRecovery, payload)
	}

	private selectCurrentOwner(topicId: string): RegisteredRecoveryOwner | undefined {
		let selectedOwner: RegisteredRecoveryOwner | undefined
		this.owners.forEach((owner) => {
			if (owner.topicId !== topicId) return
			if (!selectedOwner || owner.registrationOrder > selectedOwner.registrationOrder) {
				selectedOwner = owner
			}
		})
		return selectedOwner
	}

	private isRecoveryCurrent(recovery: InFlightRecovery): boolean {
		return (
			this.inFlightRecoveries.get(recovery.topicId) === recovery &&
			this.owners.get(recovery.owner.ownerToken) === recovery.owner &&
			this.selectCurrentOwner(recovery.topicId) === recovery.owner
		)
	}

	private async executeRecovery(
		recovery: InFlightRecovery,
		payload: StreamRecoveryRequestPayload,
	) {
		try {
			const pullResult = await recovery.owner.recover({
				...payload,
				conversationId: recovery.owner.conversationId,
				syncGeneration: recovery.generation,
			})
			if (!this.isRecoveryCurrent(recovery)) return
			if (!this.store.isTopicSyncCurrent(recovery.topicId, recovery.generation)) return

			const taskStatus = recovery.owner.getTaskStatus()
			if (!pullResult.didPullSucceed) {
				this.store.completeTopicSync(recovery.topicId, recovery.generation, {
					succeeded: false,
					taskStatus,
				})
				return
			}

			this.store.completeTopicSync(recovery.topicId, recovery.generation, {
				succeeded: true,
				taskStatus,
				latestSeqId: this.store.getLatestMessageSeqId(recovery.topicId),
			})
		} catch {
			if (this.isRecoveryCurrent(recovery)) {
				this.store.cancelTopicSync(recovery.topicId, recovery.generation)
			}
		} finally {
			if (this.inFlightRecoveries.get(recovery.topicId) === recovery) {
				this.inFlightRecoveries.delete(recovery.topicId)
			}
		}
	}
}

const streamRecoveryCoordinator = new StreamRecoveryCoordinator(superMagicStore)

export function registerStreamRecoveryOwner(registration: StreamRecoveryOwnerRegistration) {
	return streamRecoveryCoordinator.registerOwner(registration)
}
