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

interface TopicExecutionState {
	isTerminal: boolean
	status?: string
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

	seedTopicExecution(topicKey: string, status: string, isTerminal: boolean) {
		this.topicExecutionStates.set(topicKey, { isTerminal, status })
	}

	recordTopicExecutionStatus(topicKey: string, status: string, isTerminal: boolean) {
		const previous = this.topicExecutionStates.get(topicKey)
		if (!isTerminal) {
			this.topicExecutionStates.set(topicKey, { isTerminal: false, status })
			return undefined
		}
		if (previous?.isTerminal) return undefined
		this.topicExecutionStates.set(topicKey, { isTerminal: true, status })
		return { previousStatus: previous?.status }
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
}
