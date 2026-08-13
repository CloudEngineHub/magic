interface StreamTransitionState {
	active: boolean
	generation: number
	lastEndReason?: string
}

interface MessageTransitionSnapshot {
	[key: string]: unknown
	imStatus?: string
	superStatus?: string
	status?: string
}

interface ToolSettlementSnapshot {
	status: string
	strength: "strong" | "weak"
}

export type TopicExecutionPhase = "idle" | "active" | "terminal"

export type TopicExecutionAuthority = "history" | "stream" | "assistant_final" | "topic_status"

export interface TopicExecutionState {
	generation: number
	phase: TopicExecutionPhase
	executionId: string
	status?: string
	lastSeqId?: string
	correlationId?: string
	taskId?: string
	authority: TopicExecutionAuthority
}

interface TopicExecutionObservation {
	executionId: string
	status?: string
	seqId?: string
	correlationId?: string
	taskId?: string
	authority: TopicExecutionAuthority
}

interface TopicExecutionSeed extends TopicExecutionObservation {
	isTerminal: boolean
}

export interface TopicExecutionEndTransition {
	ended: boolean
	state: TopicExecutionState
	previousStatus?: string
	statusConflict: boolean
	stale: boolean
}

function compareExecutionSeqId(left?: string, right?: string): number {
	if (!left && !right) return 0
	if (!left) return -1
	if (!right) return 1
	const normalizedLeft = left.replace(/^0+/, "") || "0"
	const normalizedRight = right.replace(/^0+/, "") || "0"
	if (normalizedLeft.length !== normalizedRight.length) {
		return normalizedLeft.length > normalizedRight.length ? 1 : -1
	}
	return normalizedLeft === normalizedRight ? 0 : normalizedLeft > normalizedRight ? 1 : -1
}

function getTopicExecutionAuthorityRank(authority: TopicExecutionAuthority): number {
	switch (authority) {
		case "topic_status":
			return 3
		case "assistant_final":
			return 2
		case "stream":
			return 1
		case "history":
			return 0
	}
}

/**
 * 保存事件层所需的最小过渡状态，不复制消息正文、附件或累计工具参数。
 * 该 ledger 只负责版本与去重，canonical 事实仍由 SuperMagicStore 持有。
 */
export class SuperMagicEventTransitionLedger {
	private eventSequence = 0
	private entityRevisions = new Map<string, number>()
	private streamStates = new Map<string, StreamTransitionState>()
	private messageSnapshots = new Map<string, MessageTransitionSnapshot>()
	private topicExecutionStates = new Map<string, TopicExecutionState>()
	/** Canonical Final is a second, independent close barrier after finish_reason. */
	private canonicalFinals = new Set<string>()
	private toolSettlements = new Map<string, ToolSettlementSnapshot>()
	private completedTasks = new Set<string>()

	nextSequence() {
		this.eventSequence += 1
		return this.eventSequence
	}

	nextRevision(entityKey: string) {
		const revision = (this.entityRevisions.get(entityKey) || 0) + 1
		this.entityRevisions.set(entityKey, revision)
		return revision
	}

	startStream(streamKey: string) {
		const current = this.streamStates.get(streamKey)
		if (current?.active) return { generation: current.generation, started: false }
		const generation = (current?.generation || 0) + 1
		this.streamStates.set(streamKey, { active: true, generation })
		return { generation, started: true }
	}

	endStream(streamKey: string, reason?: string) {
		const current = this.streamStates.get(streamKey)
		if (!current?.active) return undefined
		current.active = false
		current.lastEndReason = reason
		return current.generation
	}

	getStreamGeneration(streamKey: string) {
		return this.streamStates.get(streamKey)?.generation
	}

	ensureStreamGeneration(streamKey: string) {
		const current = this.streamStates.get(streamKey)
		if (current) return current.generation
		this.streamStates.set(streamKey, { active: false, generation: 1 })
		return 1
	}

	recordCanonicalFinal(finalKey: string) {
		if (this.canonicalFinals.has(finalKey)) return false
		this.canonicalFinals.add(finalKey)
		return true
	}

	isStreamActive(streamKey: string) {
		return this.streamStates.get(streamKey)?.active === true
	}

	getLastStreamEndReason(streamKey: string) {
		return this.streamStates.get(streamKey)?.lastEndReason
	}

	seedMessage(messageKey: string, snapshot: MessageTransitionSnapshot) {
		if (!this.messageSnapshots.has(messageKey)) {
			this.messageSnapshots.set(messageKey, { ...snapshot })
		}
	}

	recordMessage(messageKey: string, snapshot: MessageTransitionSnapshot) {
		const previous = this.messageSnapshots.get(messageKey)
		const changedFields = previous
			? Object.keys(snapshot).filter((field) => !Object.is(previous[field], snapshot[field]))
			: Object.keys(snapshot).filter((field) => snapshot[field] !== undefined)
		if (previous && changedFields.length === 0) return undefined
		this.messageSnapshots.set(messageKey, { ...snapshot })
		return {
			operation: previous ? ("update" as const) : ("insert" as const),
			changedFields,
			previousStatus: previous?.superStatus,
		}
	}

	seedTopicExecution(topicKey: string, seed: TopicExecutionSeed) {
		const current = this.topicExecutionStates.get(topicKey)
		// Historical pages may arrive in either direction. Once a live execution exists,
		// hydration cannot replace it; among historical facts only the highest seq/authority wins.
		if (current?.authority !== undefined && current.authority !== "history") return current
		if (current) {
			const seqOrder = compareExecutionSeqId(seed.seqId, current.lastSeqId)
			if (seqOrder < 0) return current
			if (seqOrder === 0) {
				const authorityOrder =
					getTopicExecutionAuthorityRank(seed.authority) -
					getTopicExecutionAuthorityRank(current.authority)
				if (authorityOrder < 0) return current
				if (authorityOrder === 0) {
					if (current.phase === "terminal" && !seed.isTerminal) return current
					if (
						current.phase === (seed.isTerminal ? "terminal" : "idle") &&
						current.executionId >= seed.executionId
					)
						return current
				}
			}
		}

		const state: TopicExecutionState = {
			generation: current?.generation || 1,
			phase: seed.isTerminal ? "terminal" : "idle",
			executionId: seed.executionId,
			status: seed.status,
			lastSeqId: seed.seqId,
			correlationId: seed.correlationId,
			taskId: seed.taskId,
			authority: "history",
		}
		this.topicExecutionStates.set(topicKey, state)
		return state
	}

	beginTopicExecution(topicKey: string, observation: TopicExecutionObservation) {
		const current = this.topicExecutionStates.get(topicKey)
		if (current?.executionId === observation.executionId) {
			if (current.phase === "active") {
				const seqOrder = compareExecutionSeqId(observation.seqId, current.lastSeqId)
				if (seqOrder < 0) return { started: false, state: current }
				if (observation.status) current.status = observation.status
				if (observation.seqId) current.lastSeqId = observation.seqId
				if (
					getTopicExecutionAuthorityRank(observation.authority) >=
					getTopicExecutionAuthorityRank(current.authority)
				) {
					current.authority = observation.authority
				}
				return { started: false, state: current }
			}
			// A terminal execution with the same stable task identity is replay, not a new round.
			if (current.phase === "terminal") return { started: false, state: current }
			const state: TopicExecutionState = {
				...current,
				phase: "active",
				status: observation.status || current.status,
				lastSeqId: observation.seqId || current.lastSeqId,
				correlationId: observation.correlationId || current.correlationId,
				taskId: observation.taskId || current.taskId,
				authority: observation.authority,
			}
			this.topicExecutionStates.set(topicKey, state)
			return { started: true, state }
		}
		if (
			current &&
			observation.authority !== "stream" &&
			compareExecutionSeqId(observation.seqId, current.lastSeqId) <= 0
		) {
			// A lower/equal-seq live status for another identity is a delayed observation of an
			// older execution. Only an admitted stream start may advance without a message seq.
			return { started: false, state: current }
		}

		const state: TopicExecutionState = {
			generation: (current?.generation || 0) + 1,
			phase: "active",
			executionId: observation.executionId,
			status: observation.status,
			lastSeqId: observation.seqId,
			correlationId: observation.correlationId,
			taskId: observation.taskId,
			authority: observation.authority,
		}
		this.topicExecutionStates.set(topicKey, state)
		return { started: true, state }
	}

	endTopicExecution(
		topicKey: string,
		observation: TopicExecutionObservation,
	): TopicExecutionEndTransition {
		const current = this.topicExecutionStates.get(topicKey)
		const hasStableIdentity = Boolean(
			observation.executionId || observation.taskId || observation.correlationId,
		)
		const matchesCurrent = Boolean(
			current &&
			(observation.executionId === current.executionId ||
				(Boolean(observation.taskId) && observation.taskId === current.taskId) ||
				(Boolean(observation.correlationId) &&
					observation.correlationId === current.correlationId)),
		)

		if (current?.phase === "active" && hasStableIdentity && !matchesCurrent) {
			return {
				ended: false,
				state: current,
				previousStatus: current.status,
				statusConflict: false,
				stale: true,
			}
		}

		if (current?.phase === "terminal") {
			if (!matchesCurrent && hasStableIdentity) {
				const seqOrder = compareExecutionSeqId(observation.seqId, current.lastSeqId)
				if (seqOrder <= 0) {
					return {
						ended: false,
						state: current,
						previousStatus: current.status,
						statusConflict: false,
						stale: true,
					}
				}
			} else {
				const previousStatus = current.status
				const statusConflict = Boolean(
					previousStatus && observation.status && previousStatus !== observation.status,
				)
				if (compareExecutionSeqId(observation.seqId, current.lastSeqId) >= 0) {
					current.status = observation.status || current.status
					current.lastSeqId = observation.seqId || current.lastSeqId
					if (
						getTopicExecutionAuthorityRank(observation.authority) >=
						getTopicExecutionAuthorityRank(current.authority)
					) {
						current.authority = observation.authority
					}
				}
				return {
					ended: false,
					state: current,
					previousStatus,
					statusConflict,
					stale: false,
				}
			}
		}

		const previousStatus = current?.status
		const usesCurrentExecution = Boolean(current && (!hasStableIdentity || matchesCurrent))
		const currentExecution = usesCurrentExecution ? current : undefined
		const state: TopicExecutionState = {
			generation: currentExecution?.generation || (current?.generation || 0) + 1,
			phase: "terminal",
			executionId:
				currentExecution?.executionId || observation.executionId || `implicit:${topicKey}`,
			status: observation.status,
			lastSeqId: observation.seqId || currentExecution?.lastSeqId,
			correlationId: observation.correlationId || currentExecution?.correlationId,
			taskId: observation.taskId || currentExecution?.taskId,
			authority: observation.authority,
		}
		this.topicExecutionStates.set(topicKey, state)
		return {
			ended: true,
			state,
			previousStatus,
			statusConflict: false,
			stale: false,
		}
	}

	recordToolSettlement(
		toolKey: string,
		status: string,
		strength: ToolSettlementSnapshot["strength"],
	) {
		const current = this.toolSettlements.get(toolKey)
		if (current?.status === status && current.strength === strength) return false
		if (current?.strength === "strong" && strength === "weak") return false
		this.toolSettlements.set(toolKey, { status, strength })
		return true
	}

	recordTaskCompleted(taskKey: string) {
		if (this.completedTasks.has(taskKey)) return false
		this.completedTasks.add(taskKey)
		return true
	}

	seedTaskCompleted(taskKey: string) {
		this.completedTasks.add(taskKey)
	}
}
