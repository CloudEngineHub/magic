import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	MessageCommittedEvent,
	MessageStreamDeltaEvent,
	MessageStreamEndedEvent,
	MessageStreamStartedEvent,
	TaskCompletedEvent,
	ToolCallSettledEvent,
	TopicExecutionEndedEvent,
} from "@/pages/superMagic/stores/events"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
	type SuperMagicNode,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_ID = "topic-events"
const CORRELATION_ID = "correlation-events"
const SUPER_MESSAGE_ID = "super-message-events"
const FINISH_TASK_APP_MESSAGE_ID = "938540548324491265"
const FINISH_TASK_SUPER_MESSAGE_ID = "super-finish-task-events"
const FINISH_TASK_TOOL_ID = "938540548324491266"
const FINISH_TASK_LEGACY_TOOL_CALL_ID = "call_4d361d6c459b4a93b04767dd"
const FINISH_TASK_CORRELATION_ID = "4d361d6c-459b-4a93-b047-67dd99eedc96"
const FINISH_TASK_TASK_ID = "938538362815287296"
const FINISH_TASK_DETAIL = {
	type: "html",
	data: {
		content: "",
		file_id: "938539108248047617",
		file_name: "index.html",
		metadata: [],
	},
}
const FINISH_TASK_ATTACHMENTS = [
	{
		display_filename: "business-impact.html",
		file_extension: "html",
		file_id: "938540442309406720",
		file_size: 4096,
		filename: "business-impact.html",
	},
]

function createChunk({
	i = 0,
	content = "",
	reasoningContent = "",
	finishReason = null,
	toolCalls = [],
}: {
	i?: number
	content?: string
	reasoningContent?: string
	finishReason?: string | null
	toolCalls?: Array<Record<string, unknown>>
} = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${i}`,
		app_message_id: `app-chunk-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-events",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: "completion-events",
		super_magic_chunk: {
			super_message_id: SUPER_MESSAGE_ID,
			task_id: "task-events",
			i,
			usage: null,
			correlation_id: CORRELATION_ID,
			choices: [
				{
					...({ index: 0 } as const),
					finish_reason: finishReason,
					delta: {
						content,
						role: "assistant",
						tool_calls: toolCalls,
						reasoning_content: reasoningContent,
						index: 0,
					},
				},
			],
		},
	} as SuperMagicChunkMessage
}

function createEnvelope({
	appMessageId,
	seqId,
	node,
	outerStatus = ConversationMessageStatus.Read,
}: {
	appMessageId: string
	seqId: string
	node: SuperMagicNode
	outerStatus?: ConversationMessageStatus
}): RawSuperMagicMessageEnvelope {
	const normalizedNode = {
		...node,
		super_message_id:
			node.role === "user"
				? appMessageId
				: node.super_message_id ||
					(node.role === "assistant" ? SUPER_MESSAGE_ID : `super-${appMessageId}`),
	}
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-events",
			seq_id: seqId,
			message_id: `server-${seqId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-events",
			organization_code: "organization-events",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: node.role === "tool" ? "tool-runner" : "assistant-events",
				send_time: Number(seqId),
				status: outerStatus,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: normalizedNode,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createAssistantEnvelope({
	appMessageId = "assistant-final-events",
	seqId = "100",
	status = "finished",
	outerStatus = ConversationMessageStatus.Read,
	toolCalls = [],
	event,
}: {
	appMessageId?: string
	seqId?: string
	status?: string
	outerStatus?: ConversationMessageStatus
	toolCalls?: Array<Record<string, unknown>>
	event?: string
} = {}) {
	return createEnvelope({
		appMessageId,
		seqId,
		outerStatus,
		node: {
			role: "assistant",
			topic_id: TOPIC_ID,
			message_id: `node-${appMessageId}`,
			correlation_id: CORRELATION_ID,
			content: "canonical response",
			reasoning_content: "",
			tool_calls: toolCalls,
			status,
			...(event ? { event } : {}),
			send_timestamp: Number(seqId),
		},
	})
}

type SharedMessageFixture = Parameters<SuperMagicStore["loadSharedMessages"]>[0][number]

function createSharedAssistantMessage({
	messageId,
	correlationId,
	toolCalls,
}: {
	messageId: string
	correlationId: string
	toolCalls: Array<Record<string, unknown>>
}): SharedMessageFixture {
	return {
		message_id: messageId,
		type: "super_magic_message",
		topic_id: TOPIC_ID,
		raw_content: {
			super_magic_message: {
				role: "assistant",
				topic_id: TOPIC_ID,
				correlation_id: correlationId,
				content: "shared assistant",
				status: "running",
				tool_calls: toolCalls,
			},
		},
	} as SharedMessageFixture
}

function createSharedToolMessage(toolId: string): SharedMessageFixture {
	return {
		message_id: "shared-tool-response",
		type: "super_magic_message",
		topic_id: TOPIC_ID,
		raw_content: {
			super_magic_message: {
				role: "tool",
				topic_id: TOPIC_ID,
				correlation_id: "shared-first-correlation",
				status: "finished",
				tool: {
					id: toolId,
					name: "list_dir",
					status: "finished",
					detail: { type: "json", data: { ok: true } },
				},
			},
		},
	} as SharedMessageFixture
}

function createToolEnvelope({
	appMessageId = "tool-response-events",
	superMessageId = `super-${appMessageId}`,
	toolId = "tool-events",
	name = "update_agent",
	seqId = "101",
	correlationId = CORRELATION_ID,
	taskId,
	legacyToolCallId,
	detail = { type: "json", data: { code: "crew-events" } },
	attachments = [],
	toolAttachments = [],
}: {
	appMessageId?: string
	superMessageId?: string
	toolId?: string
	name?: string
	seqId?: string
	correlationId?: string
	taskId?: string
	legacyToolCallId?: string
	detail?: Record<string, unknown>
	attachments?: Array<Record<string, unknown>>
	toolAttachments?: Array<Record<string, unknown>>
} = {}) {
	return createEnvelope({
		appMessageId,
		seqId,
		node: {
			role: "tool",
			topic_id: TOPIC_ID,
			message_id: `node-${appMessageId}`,
			super_message_id: superMessageId,
			correlation_id: correlationId,
			...(taskId ? { task_id: taskId } : {}),
			content: null,
			reasoning_content: null,
			tool_calls: null,
			...(legacyToolCallId ? { tool_call_id: legacyToolCallId } : {}),
			attachments,
			status: "finished",
			send_timestamp: Number(seqId),
			tool: {
				id: toolId,
				name,
				status: "finished",
				detail,
				attachments: toolAttachments,
			},
		},
	})
}

function createFinishTaskEnvelope() {
	return createToolEnvelope({
		appMessageId: FINISH_TASK_APP_MESSAGE_ID,
		superMessageId: FINISH_TASK_SUPER_MESSAGE_ID,
		toolId: FINISH_TASK_TOOL_ID,
		legacyToolCallId: FINISH_TASK_LEGACY_TOOL_CALL_ID,
		correlationId: FINISH_TASK_CORRELATION_ID,
		taskId: FINISH_TASK_TASK_ID,
		name: "finish_task",
		detail: FINISH_TASK_DETAIL,
		attachments: FINISH_TASK_ATTACHMENTS,
	})
}

function cloneEnvelope(envelope: RawSuperMagicMessageEnvelope): RawSuperMagicMessageEnvelope {
	return JSON.parse(JSON.stringify(envelope)) as RawSuperMagicMessageEnvelope
}

describe("SuperMagic Store typed events", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("starts a stream for an ordered metadata-only chunk without emitting delta", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const started: MessageStreamStartedEvent[] = []
		const deltas: MessageStreamDeltaEvent[] = []
		store.subscribe("message.stream.started", (event) => started.push(event))
		store.subscribe("message.stream.delta", (event) => deltas.push(event))

		store.receiveChunk(createChunk())

		expect(started).toHaveLength(1)
		expect(started[0].payload).toEqual({ chunkIndex: 0, startsWith: "metadata" })
		expect(deltas).toEqual([])
	})

	it("publishes accepted stream changes in started, delta, ended order", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const events: Array<
			MessageStreamStartedEvent | MessageStreamDeltaEvent | MessageStreamEndedEvent
		> = []
		store.subscribe("message.stream.started", (event) => events.push(event))
		store.subscribe("message.stream.delta", (event) => events.push(event))
		store.subscribe("message.stream.ended", (event) => events.push(event))

		store.receiveChunk(createChunk({ content: "hello" }))
		store.receiveChunk(createChunk({ i: 1, content: " world", finishReason: "stop" }))

		expect(events.map((event) => event.type)).toEqual([
			"message.stream.started",
			"message.stream.delta",
			"message.stream.delta",
			"message.stream.ended",
		])
		expect((events[2] as MessageStreamDeltaEvent).payload.contentDelta).toBe(" world")
		expect((events[3] as MessageStreamEndedEvent).payload).toMatchObject({
			reason: "finish_reason",
			finishReason: "stop",
			awaitingCanonicalMessage: true,
		})
	})

	it("publishes committed before the Topic terminal event for a terminal Assistant Final", () => {
		const store = new SuperMagicStore()
		const events: Array<MessageCommittedEvent | TopicExecutionEndedEvent> = []
		store.subscribe("message.committed", (event) => events.push(event))
		store.subscribe("topic.execution.ended", (event) => events.push(event))

		store.enqueueMessage(TOPIC_ID, createAssistantEnvelope())

		expect(events.map((event) => event.type)).toEqual([
			"message.committed",
			"topic.execution.ended",
		])
		expect((events[0] as MessageCommittedEvent).payload.message).toMatchObject({
			imStatus: ConversationMessageStatus.Read,
			superStatus: "finished",
		})
		expect((events[1] as TopicExecutionEndedEvent).payload.status).toBe("finished")
	})

	it("publishes a Topic-level terminal event only when the authoritative Final stops the Topic", () => {
		const store = new SuperMagicStore()
		const topicEvents: TopicExecutionEndedEvent[] = []
		store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-running",
				seqId: "100",
				status: "running",
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-finished",
				seqId: "101",
				status: "finished",
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-finished",
				seqId: "101",
				status: "finished",
			}),
		)

		expect(topicEvents).toEqual([
			expect.objectContaining({
				type: "topic.execution.ended",
				payload: expect.objectContaining({ status: "finished" }),
			}),
		])
	})

	it.each(["running", "waiting", "waiting_for_user", "future_status"])(
		"does not publish a Topic terminal event for nonterminal status %s",
		(status) => {
			const store = new SuperMagicStore()
			const topicEvents: TopicExecutionEndedEvent[] = []
			store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

			store.enqueueMessage(
				TOPIC_ID,
				createAssistantEnvelope({ status, appMessageId: `assistant-${status}` }),
			)

			expect(topicEvents).toEqual([])
		},
	)

	it("allows one Topic terminal event again after a new nonterminal execution generation", () => {
		const store = new SuperMagicStore()
		const topicEvents: TopicExecutionEndedEvent[] = []
		store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({ appMessageId: "assistant-finished-1", seqId: "100" }),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-running-2",
				seqId: "101",
				status: "running",
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-error-2",
				seqId: "102",
				status: "error",
			}),
		)

		expect(topicEvents.map((event) => event.payload.status)).toEqual(["finished", "error"])
	})

	it("publishes a strong tool settlement when the protocol ids match", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				status: "running",
				toolCalls: [
					{
						id: "tool-events",
						index: 0,
						type: "function",
						function: { name: "update_agent", arguments: "{}" },
					},
				],
			}),
		)
		store.enqueueMessage(TOPIC_ID, createToolEnvelope({ legacyToolCallId: "tool-events" }))

		expect(settled).toHaveLength(1)
		expect(settled[0]).toMatchObject({
			meta: { toolCallId: "tool-events" },
			payload: {
				toolCall: { id: "tool-events", name: "update_agent" },
				response: { status: "finished" },
				strength: "strong",
				replaceable: false,
			},
		})
		expect(store.getMessageNode("super-tool-response-events")).toMatchObject({
			tool_call_id: "tool-events",
			tool: { id: "tool-events" },
		})
		expect(Array.from(store.toolResponseMap.get(TOPIC_ID)?.keys() || [])).toEqual([
			"tool-events",
		])
	})

	it("rejects a generic orphan tool result whose numeric tool.id has no matching Assistant call", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createToolEnvelope({
				appMessageId: "generic-orphan-tool-response",
				toolId: FINISH_TASK_TOOL_ID,
				correlationId: "generic-orphan-correlation",
				name: "list_dir",
			}),
		)

		expect(settled).toEqual([])
		expect(store.toolResponseMap.get(TOPIC_ID)?.has(FINISH_TASK_TOOL_ID)).toBe(false)
		expect(store.getMessageNode("super-generic-orphan-tool-response")).toMatchObject({
			role: "tool",
			tool: { id: FINISH_TASK_TOOL_ID, name: "list_dir" },
		})
		expect(store.getMessageNode("super-generic-orphan-tool-response")).not.toHaveProperty(
			"tool_call_id",
		)
	})

	it("keeps an orphan finish_task raw and canonical without an ordinary tool settlement, legacy alias, or Assistant synthesis", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		const legacyScopedEvents: ToolCallSettledEvent[] = []
		const committed: MessageCommittedEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		store.subscribe("toolCall.settled", (event) => settled.push(event))
		store.subscribe("toolCall.settled", (event) => legacyScopedEvents.push(event), {
			scope: { toolCallId: FINISH_TASK_LEGACY_TOOL_CALL_ID },
		})
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

		// The numeric tool.id remains a low-level response identity only. It does not
		// create an Assistant tool call or make the legacy tool_call_id an event alias.
		const finishTaskEnvelope = createFinishTaskEnvelope()
		const replayEnvelope = cloneEnvelope(finishTaskEnvelope)
		store.enqueueMessage(TOPIC_ID, finishTaskEnvelope)
		store.enqueueMessage(TOPIC_ID, replayEnvelope)

		expect(settled).toEqual([])
		expect(legacyScopedEvents).toEqual([])
		expect(committed).toHaveLength(1)
		expect(committed[0].payload.message).toMatchObject({
			appMessageId: FINISH_TASK_APP_MESSAGE_ID,
			correlationId: FINISH_TASK_CORRELATION_ID,
			role: "tool",
			status: ConversationMessageStatus.Read,
			imStatus: ConversationMessageStatus.Read,
			superStatus: "finished",
		})
		expect(topicEnded).toEqual([])

		const rawNode = store.getMessageNode(FINISH_TASK_SUPER_MESSAGE_ID)
		expect(rawNode).toMatchObject({
			role: "tool",
			task_id: FINISH_TASK_TASK_ID,
			tool_call_id: FINISH_TASK_LEGACY_TOOL_CALL_ID,
			tool_calls: null,
			attachments: FINISH_TASK_ATTACHMENTS,
			tool: {
				id: FINISH_TASK_TOOL_ID,
				name: "finish_task",
				status: "finished",
				detail: FINISH_TASK_DETAIL,
				attachments: [],
			},
		})
		expect(rawNode).toHaveProperty("super_message_id", FINISH_TASK_SUPER_MESSAGE_ID)
		expect(
			(store.messages.get(TOPIC_ID) || []).some((message) => message.role === "assistant"),
		).toBe(false)

		const canonical = store.toolResponseMap.get(TOPIC_ID)
		expect(Array.from(canonical?.keys() || [])).toEqual([FINISH_TASK_TOOL_ID])
		expect(canonical?.get(FINISH_TASK_TOOL_ID)).toMatchObject({
			id: FINISH_TASK_TOOL_ID,
			name: "finish_task",
			status: "finished",
			detail: FINISH_TASK_DETAIL,
			attachments: [],
		})
		expect(canonical?.has(FINISH_TASK_LEGACY_TOOL_CALL_ID)).toBe(false)

		// Warning wording is intentionally unconstrained; only the structured conflict
		// diagnostic needs to identify the raw and canonical IDs involved.
		const conflictDiagnostics = warnSpy.mock.calls.filter((call) =>
			call.some((argument) => {
				if (!argument || typeof argument !== "object") return false
				const diagnostic = argument as Record<string, unknown>
				return (
					diagnostic.topicId === TOPIC_ID &&
					diagnostic.toolId === FINISH_TASK_TOOL_ID &&
					diagnostic.toolCallId === FINISH_TASK_LEGACY_TOOL_CALL_ID
				)
			}),
		)
		expect(conflictDiagnostics).toHaveLength(1)
	})

	it("emits task.completed exactly once for an orphan finish_task result", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		vi.spyOn(console, "warn").mockImplementation(() => undefined)

		store.subscribe("task.completed", (event) => taskCompleted.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

		const finishTaskEnvelope = createFinishTaskEnvelope()
		const replayEnvelope = cloneEnvelope(finishTaskEnvelope)
		store.enqueueMessage(TOPIC_ID, finishTaskEnvelope)
		store.enqueueMessage(TOPIC_ID, replayEnvelope)

		expect(topicEnded).toEqual([])
		expect(taskCompleted).toHaveLength(1)
		expect(taskCompleted[0]).toMatchObject({
			type: "task.completed",
			meta: {
				topicId: TOPIC_ID,
				correlationId: FINISH_TASK_CORRELATION_ID,
				appMessageId: FINISH_TASK_APP_MESSAGE_ID,
				taskId: FINISH_TASK_TASK_ID,
			},
			payload: {
				source: "finish_task",
				result: {
					detail: FINISH_TASK_DETAIL,
					attachments: FINISH_TASK_ATTACHMENTS,
				},
			},
		})
	})

	it("ends the old generation before starting an i=0 restart", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const events: Array<MessageStreamStartedEvent | MessageStreamEndedEvent> = []
		store.subscribe("message.stream.started", (event) => events.push(event))
		store.subscribe("message.stream.ended", (event) => events.push(event))

		store.receiveChunk(createChunk({ content: "old" }))
		store.receiveChunk(createChunk({ i: 1, content: " generation" }))
		store.receiveChunk(createChunk({ content: "new" }))

		expect(events.map((event) => [event.type, event.meta.streamGeneration])).toEqual([
			["message.stream.started", 1],
			["message.stream.ended", 1],
			["message.stream.started", 2],
		])
		expect((events[1] as MessageStreamEndedEvent).payload).toMatchObject({
			reason: "restart",
			replacedByGeneration: 2,
		})
	})

	it("keeps cold HTTP hydration silent", () => {
		const store = new SuperMagicStore()
		const committed: MessageCommittedEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		const settled: ToolCallSettledEvent[] = []
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.initializeMessages(TOPIC_ID, [
			createAssistantEnvelope({
				toolCalls: [
					{
						id: "historical-tool-events",
						index: 0,
						type: "function",
						function: { name: "list_dir", arguments: "{}" },
					},
				],
			}),
			createToolEnvelope({ toolId: "historical-tool-events", status: "finished" }),
		])

		expect(committed).toEqual([])
		expect(topicEnded).toEqual([])
		expect(settled).toEqual([])
		expect(store.toolResponseMap.get(TOPIC_ID)?.get("historical-tool-events")).toMatchObject({
			status: "finished",
		})
	})

	it("publishes a live HTTP finish_task arrival exactly once", () => {
		const store = new SuperMagicStore()
		const committed: MessageCommittedEvent[] = []
		const taskCompleted: TaskCompletedEvent[] = []
		const runningAssistant = createAssistantEnvelope({ status: "running" })
		const finishTask = createFinishTaskEnvelope()

		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("task.completed", (event) => taskCompleted.push(event))
		store.initializeMessages(TOPIC_ID, [runningAssistant])

		const reconcileLiveTail = () =>
			store.reconcileAuthoritativeMessages(TOPIC_ID, {
				statusItems: [runningAssistant, finishTask],
				membershipItems: [runningAssistant, finishTask],
				writeOptions: {
					mode: "replace",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
				},
			})

		reconcileLiveTail()
		reconcileLiveTail()

		expect(committed).toHaveLength(1)
		expect(committed[0].payload.message).toMatchObject({
			appMessageId: FINISH_TASK_APP_MESSAGE_ID,
			role: "tool",
			superStatus: "finished",
		})
		expect(taskCompleted).toHaveLength(1)
		expect(taskCompleted[0].meta).toMatchObject({
			topicId: TOPIC_ID,
			appMessageId: FINISH_TASK_APP_MESSAGE_ID,
			taskId: FINISH_TASK_TASK_ID,
		})
	})

	it("publishes HTTP reconciliation when it settles an active stream", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		store.receiveChunk(createChunk({ content: "draft" }))
		const events: Array<
			MessageStreamEndedEvent | MessageCommittedEvent | TopicExecutionEndedEvent
		> = []
		store.subscribe("message.stream.ended", (event) => events.push(event))
		store.subscribe("message.committed", (event) => events.push(event))
		store.subscribe("topic.execution.ended", (event) => events.push(event))

		store.initializeMessages(TOPIC_ID, [createAssistantEnvelope()])

		expect(events.map((event) => event.type)).toEqual([
			"message.stream.ended",
			"message.committed",
			"topic.execution.ended",
		])
		expect((events[0] as MessageStreamEndedEvent).payload.reason).toBe("authoritative_final")
	})

	it("emits committed but not a duplicate Topic terminal event for a higher seq", () => {
		const store = new SuperMagicStore()
		const committed: MessageCommittedEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

		store.enqueueMessage(TOPIC_ID, createAssistantEnvelope({ seqId: "100" }))
		store.enqueueMessage(TOPIC_ID, createAssistantEnvelope({ seqId: "101" }))

		expect(committed).toHaveLength(2)
		expect(topicEnded).toHaveLength(1)
		expect(committed[1].payload.operation).toBe("update")
		expect(committed[1].payload.changedFields).toContain("seqId")
	})

	it("publishes revoked as an IM visibility change without fabricating execution completion", () => {
		const store = new SuperMagicStore()
		const committed: MessageCommittedEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				status: "running",
				outerStatus: ConversationMessageStatus.Revoked,
			}),
		)

		expect(committed).toHaveLength(1)
		expect(committed[0].payload.message).toMatchObject({
			imStatus: ConversationMessageStatus.Revoked,
			superStatus: "running",
		})
		expect(topicEnded).toEqual([])
	})

	it("publishes a replaceable weak settlement before a late strong response", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		store.subscribe("toolCall.settled", (event) => settled.push(event))
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				toolCalls: [
					{
						id: "tool-late",
						index: 0,
						type: "function",
						function: { name: "update_skill", arguments: "{}" },
					},
				],
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createToolEnvelope({ toolId: "tool-late", name: "update_skill", seqId: "102" }),
		)

		expect(settled.map((event) => [event.payload.strength, event.payload.replaceable])).toEqual(
			[
				["weak", true],
				["strong", false],
			],
		)
	})

	it("does not synthesize a settlement for ask_user", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				toolCalls: [
					{
						id: "tool-ask-user",
						index: 0,
						type: "function",
						function: { name: "ask_user", arguments: "{}" },
					},
				],
			}),
		)

		expect(settled).toEqual([])
	})

	it("closes active streams and publishes suspended tool settlements for task suspension", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const events: Array<
			MessageStreamEndedEvent | ToolCallSettledEvent | TopicExecutionEndedEvent
		> = []
		store.subscribe("message.stream.ended", (event) => events.push(event))
		store.subscribe("toolCall.settled", (event) => events.push(event))
		store.subscribe("topic.execution.ended", (event) => events.push(event))

		store.receiveChunk(
			createChunk({
				toolCalls: [
					{
						id: "tool-suspended",
						index: 0,
						type: "function",
						function: { name: "list_dir", arguments: "{}" },
					},
				],
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-suspended-events",
				seqId: "110",
				status: "suspended",
				event: "agent_suspended",
			}),
		)

		expect(events.map((event) => event.type)).toEqual([
			"message.stream.ended",
			"toolCall.settled",
			"topic.execution.ended",
		])
		expect(events[0]).toMatchObject({
			type: "message.stream.ended",
			payload: { reason: "suspended", awaitingCanonicalMessage: false },
		})
		expect(events[1]).toMatchObject({
			type: "toolCall.settled",
			meta: { toolCallId: "tool-suspended" },
			payload: {
				response: { status: "suspended" },
				strength: "strong",
				replaceable: false,
			},
		})
	})

	it("keeps shared replay tool settlements silent", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		const toolId = "shared-tool-events"
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.loadSharedMessages([
			createSharedAssistantMessage({
				messageId: "shared-1000",
				correlationId: "shared-first-correlation",
				toolCalls: [
					{
						id: toolId,
						index: 0,
						type: "function",
						function: { name: "list_dir", arguments: "{}" },
					},
				],
			}),
		])
		store.loadSharedMessages([
			createSharedAssistantMessage({
				messageId: "shared-1001",
				correlationId: "shared-next-correlation",
				toolCalls: [],
			}),
		])
		store.loadSharedMessages([createSharedToolMessage(toolId)])

		expect(settled).toEqual([])
		expect(store.toolResponseMap.get(TOPIC_ID)?.get(toolId)).toMatchObject({
			status: "finished",
		})
	})
})
