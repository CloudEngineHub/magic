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
	correlationId = CORRELATION_ID,
	superMessageId = SUPER_MESSAGE_ID,
	taskId = "task-events",
}: {
	i?: number
	content?: string
	reasoningContent?: string
	finishReason?: string | null
	toolCalls?: Array<Record<string, unknown>>
	correlationId?: string
	superMessageId?: string
	taskId?: string
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
			super_message_id: superMessageId,
			task_id: taskId,
			i,
			usage: null,
			correlation_id: correlationId,
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
	correlationId = CORRELATION_ID,
	superMessageId = SUPER_MESSAGE_ID,
	taskId,
	event,
}: {
	appMessageId?: string
	seqId?: string
	status?: string
	outerStatus?: ConversationMessageStatus
	toolCalls?: Array<Record<string, unknown>>
	correlationId?: string
	superMessageId?: string
	taskId?: string
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
			super_message_id: superMessageId,
			correlation_id: correlationId,
			...(taskId ? { task_id: taskId } : {}),
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
	status = "finished",
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
	status?: string
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
			status,
			send_timestamp: Number(seqId),
			tool: {
				id: toolId,
				name,
				status,
				detail,
				attachments: toolAttachments,
			},
		},
	})
}

function createFinishTaskEnvelope(overrides: Parameters<typeof createToolEnvelope>[0] = {}) {
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
		...overrides,
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
		const topicEnded: TopicExecutionEndedEvent[] = []
		store.subscribe("message.stream.started", (event) => events.push(event))
		store.subscribe("message.stream.delta", (event) => events.push(event))
		store.subscribe("message.stream.ended", (event) => events.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

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
		expect(topicEnded).toEqual([])
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

	it("allows one Topic terminal event again after an explicit new task execution", () => {
		const store = new SuperMagicStore()
		const topicEvents: TopicExecutionEndedEvent[] = []
		store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-finished-1",
				seqId: "100",
				correlationId: "explicit-generation-1-correlation",
				superMessageId: "explicit-generation-1-super",
				taskId: "explicit-generation-1-task",
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-running-2",
				seqId: "101",
				status: "running",
				correlationId: "explicit-generation-2-correlation",
				superMessageId: "explicit-generation-2-super",
				taskId: "explicit-generation-2-task",
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "assistant-error-2",
				seqId: "102",
				status: "error",
				correlationId: "explicit-generation-2-correlation",
				superMessageId: "explicit-generation-2-super",
				taskId: "explicit-generation-2-task",
			}),
		)

		expect(topicEvents.map((event) => event.payload.status)).toEqual(["finished", "error"])
	})

	it("publishes one Topic terminal event for each stream-started execution without requiring a canonical nonterminal message", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const topicEvents: TopicExecutionEndedEvent[] = []
		store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

		const settleLiveExecution = ({
			correlationId,
			superMessageId,
			taskId,
			appMessageId,
			seqId,
		}: {
			correlationId: string
			superMessageId: string
			taskId: string
			appMessageId: string
			seqId: string
		}) => {
			store.receiveChunk(
				createChunk({ content: "draft", correlationId, superMessageId, taskId }),
			)
			store.initializeMessages(
				TOPIC_ID,
				[
					createAssistantEnvelope({
						appMessageId,
						seqId,
						status: "finished",
						correlationId,
						superMessageId,
						taskId,
					}),
				],
				{
					mode: "merge",
					assistantSnapshotPolicy: "canonical_final",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
					canonicalCommitContext: {
						source: "http",
						lifecycleEventPolicy: "live",
						trigger: "websocket",
					},
				},
			)
		}

		settleLiveExecution({
			correlationId: "execution-correlation-1",
			superMessageId: "execution-super-1",
			taskId: "execution-task-1",
			appMessageId: "execution-final-1",
			seqId: "100",
		})
		settleLiveExecution({
			correlationId: "execution-correlation-2",
			superMessageId: "execution-super-2",
			taskId: "execution-task-2",
			appMessageId: "execution-final-2",
			seqId: "200",
		})

		expect(topicEvents).toHaveLength(2)
		expect(topicEvents.map((event) => event.payload.status)).toEqual(["finished", "finished"])
		expect(
			topicEvents.map(
				(event) =>
					(event.payload as { executionId?: string; generation?: number }).executionId,
			),
		).toEqual(["task:execution-task-1", "task:execution-task-2"])
		expect(
			topicEvents.map((event) => (event.payload as { generation?: number }).generation),
		).toEqual([1, 2])
	})

	it("keeps historical pagination order from changing the next live Topic execution", () => {
		const runScenario = (history: RawSuperMagicMessageEnvelope[]) => {
			const store = new SuperMagicStore()
			store.setActiveTopicId(TOPIC_ID)
			const topicEvents: TopicExecutionEndedEvent[] = []
			store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

			history.forEach((message) =>
				store.initializeMessages(TOPIC_ID, [message], { mode: "merge" }),
			)
			expect(topicEvents).toEqual([])

			store.receiveChunk(
				createChunk({
					content: "live generation",
					correlationId: "history-order-live-correlation",
					superMessageId: "history-order-live-super",
					taskId: "history-order-live-task",
				}),
			)
			store.initializeMessages(
				TOPIC_ID,
				[
					createAssistantEnvelope({
						appMessageId: "history-order-live-final",
						seqId: "300",
						correlationId: "history-order-live-correlation",
						superMessageId: "history-order-live-super",
						taskId: "history-order-live-task",
					}),
				],
				{
					mode: "merge",
					assistantSnapshotPolicy: "canonical_final",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
					canonicalCommitContext: {
						source: "http",
						lifecycleEventPolicy: "live",
						trigger: "websocket",
					},
				},
			)

			return topicEvents
		}

		const oldRunning = createAssistantEnvelope({
			appMessageId: "history-old-running",
			seqId: "100",
			status: "running",
			correlationId: "history-old-correlation",
			superMessageId: "history-old-super",
			taskId: "history-old-task",
		})
		const newTerminal = createAssistantEnvelope({
			appMessageId: "history-new-terminal",
			seqId: "200",
			status: "finished",
			correlationId: "history-new-correlation",
			superMessageId: "history-new-super",
			taskId: "history-new-task",
		})

		const newestFirstEvents = runScenario([newTerminal, oldRunning])
		const oldestFirstEvents = runScenario([oldRunning, newTerminal])

		expect(newestFirstEvents).toHaveLength(1)
		expect(oldestFirstEvents).toHaveLength(1)
		expect(
			newestFirstEvents.map(
				(event) => (event.payload as { executionId?: string }).executionId,
			),
		).toEqual(["task:history-order-live-task"])
		expect(
			oldestFirstEvents.map(
				(event) => (event.payload as { executionId?: string }).executionId,
			),
		).toEqual(["task:history-order-live-task"])
	})

	it("ignores late generation-one statuses after generation two has started", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const topicEvents: TopicExecutionEndedEvent[] = []
		store.subscribe("topic.execution.ended", (event) => topicEvents.push(event))

		store.receiveChunk(
			createChunk({
				content: "generation one",
				correlationId: "late-generation-1-correlation",
				superMessageId: "late-generation-1-super",
				taskId: "late-generation-1-task",
			}),
		)
		store.initializeMessages(
			TOPIC_ID,
			[
				createAssistantEnvelope({
					appMessageId: "late-generation-1-final",
					seqId: "100",
					correlationId: "late-generation-1-correlation",
					superMessageId: "late-generation-1-super",
					taskId: "late-generation-1-task",
				}),
			],
			{
				mode: "merge",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "live",
					trigger: "websocket",
				},
			},
		)
		topicEvents.length = 0

		store.receiveChunk(
			createChunk({
				content: "generation two",
				correlationId: "late-generation-2-correlation",
				superMessageId: "late-generation-2-super",
				taskId: "late-generation-2-task",
			}),
		)
		store.initializeMessages(TOPIC_ID, [
			createAssistantEnvelope({
				appMessageId: "late-generation-1-running",
				seqId: "90",
				status: "running",
				correlationId: "late-generation-1-correlation",
				superMessageId: "late-generation-1-running-super",
				taskId: "late-generation-1-task",
			}),
		])
		store.initializeMessages(
			TOPIC_ID,
			[
				createAssistantEnvelope({
					appMessageId: "late-generation-1-terminal-revision",
					seqId: "110",
					status: "finished",
					correlationId: "late-generation-1-correlation",
					superMessageId: "late-generation-1-running-super",
					taskId: "late-generation-1-task",
				}),
			],
			{
				mode: "merge",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "live",
					trigger: "websocket",
				},
			},
		)
		store.initializeMessages(
			TOPIC_ID,
			[
				createAssistantEnvelope({
					appMessageId: "late-generation-2-final",
					seqId: "200",
					status: "error",
					correlationId: "late-generation-2-correlation",
					superMessageId: "late-generation-2-super",
					taskId: "late-generation-2-task",
				}),
			],
			{
				mode: "merge",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "live",
					trigger: "websocket",
				},
			},
		)

		expect(topicEvents).toHaveLength(1)
		expect(topicEvents[0]).toMatchObject({
			meta: { correlationId: "late-generation-2-correlation" },
			payload: {
				status: "error",
				executionId: "task:late-generation-2-task",
				generation: 2,
			},
		})
	})

	it.each(["running", "waiting", "waiting_for_user", "future_status"])(
		"settles a live Final carrying nonterminal status %s without ending the Topic execution",
		(status) => {
			const store = new SuperMagicStore()
			store.setActiveTopicId(TOPIC_ID)
			const events: Array<
				MessageStreamEndedEvent | MessageCommittedEvent | TopicExecutionEndedEvent
			> = []
			const correlationId = `nonterminal-${status}-correlation`
			const superMessageId = `nonterminal-${status}-super`
			store.subscribe("message.stream.ended", (event) => events.push(event))
			store.subscribe("message.committed", (event) => events.push(event))
			store.subscribe("topic.execution.ended", (event) => events.push(event))
			store.receiveChunk(
				createChunk({
					content: "draft",
					correlationId,
					superMessageId,
					taskId: `nonterminal-${status}-task`,
				}),
			)

			store.initializeMessages(
				TOPIC_ID,
				[
					createAssistantEnvelope({
						appMessageId: `nonterminal-${status}-final`,
						seqId: "250",
						status,
						correlationId,
						superMessageId,
						taskId: `nonterminal-${status}-task`,
					}),
				],
				{
					mode: "merge",
					assistantSnapshotPolicy: "canonical_final",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
					canonicalCommitContext: {
						source: "http",
						lifecycleEventPolicy: "live",
						trigger: "websocket",
					},
				},
			)

			expect(events.map((event) => event.type)).toEqual([
				"message.stream.ended",
				"message.committed",
			])
			expect(store.getStreamState(TOPIC_ID, superMessageId)).toBeUndefined()
		},
	)

	it("keeps a live progress snapshot open without publishing a canonical Final event", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		const events: Array<MessageStreamEndedEvent | MessageCommittedEvent> = []
		store.subscribe("message.stream.ended", (event) => events.push(event))
		store.subscribe("message.committed", (event) => events.push(event))
		store.receiveChunk(createChunk({ content: "draft" }))

		store.initializeMessages(
			TOPIC_ID,
			[createAssistantEnvelope({ status: "running", seqId: "251" })],
			{
				mode: "merge",
				assistantSnapshotPolicy: "progress_snapshot",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "silent",
					trigger: "recovery",
				},
			},
		)

		expect(events.map((event) => event.type)).toEqual(["message.committed"])
		expect(store.getStreamState(TOPIC_ID, SUPER_MESSAGE_ID)).toBeDefined()
	})

	it("publishes a strong tool settlement when the protocol ids match", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		const topicEnded: TopicExecutionEndedEvent[] = []
		store.subscribe("toolCall.settled", (event) => settled.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

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
		expect(topicEnded).toEqual([])
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

	it("emits task.completed exactly once for a numeric ownerless finish_task result", () => {
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

	it("emits task.completed for an ownerless finish_task whose tool.id is not numeric", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		store.subscribe("task.completed", (event) => taskCompleted.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createFinishTaskEnvelope({
				toolId: "call_finish_task_events",
				legacyToolCallId: undefined,
			}),
		)

		expect(taskCompleted).toHaveLength(1)
		expect(taskCompleted[0].meta.taskId).toBe(FINISH_TASK_TASK_ID)
	})

	it("projects task.completed independently when ordinary Tool canonical association rejects an empty tool.id", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		vi.spyOn(console, "warn").mockImplementation(() => undefined)
		store.subscribe("task.completed", (event) => taskCompleted.push(event))

		store.enqueueMessage(TOPIC_ID, createFinishTaskEnvelope({ toolId: "" }))

		expect(store.toolResponseMap.get(TOPIC_ID)?.size || 0).toBe(0)
		expect(taskCompleted).toHaveLength(1)
	})

	it("deduplicates task.completed by taskId across different canonical messages", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		store.subscribe("task.completed", (event) => taskCompleted.push(event))

		store.enqueueMessage(TOPIC_ID, createFinishTaskEnvelope())
		store.enqueueMessage(
			TOPIC_ID,
			createFinishTaskEnvelope({
				appMessageId: "finish-task-events-revision",
				superMessageId: "super-finish-task-events-revision",
				seqId: "102",
			}),
		)

		expect(taskCompleted).toHaveLength(1)
	})

	it.each(["running", "error", "suspended"])(
		"does not complete a task when finish_task tool.status is %s",
		(status) => {
			const store = new SuperMagicStore()
			const taskCompleted: TaskCompletedEvent[] = []
			store.subscribe("task.completed", (event) => taskCompleted.push(event))

			store.enqueueMessage(TOPIC_ID, createFinishTaskEnvelope({ status }))

			expect(taskCompleted).toEqual([])
		},
	)

	it.each([
		["task_id", { taskId: undefined }],
		["correlation_id", { correlationId: "" }],
		["app_message_id", { appMessageId: "", superMessageId: "missing-app-message-id" }],
	] as const)(
		"rejects finish_task missing %s with a structured diagnostic",
		(field, overrides) => {
			const store = new SuperMagicStore()
			const taskCompleted: TaskCompletedEvent[] = []
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
			store.subscribe("task.completed", (event) => taskCompleted.push(event))

			store.enqueueMessage(TOPIC_ID, createFinishTaskEnvelope({ ...overrides }))

			expect(taskCompleted).toEqual([])
			expect(warnSpy).toHaveBeenCalledWith(
				"[SuperMagicStore] invalid finish_task lifecycle message",
				expect.objectContaining({
					code: "finish-task-missing-required-fields",
					missingFields: expect.arrayContaining([field]),
				}),
			)
		},
	)

	it("rejects an owned finish_task with a structured protocol-conflict diagnostic", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const toolId = "owned-finish-task-events"
		store.subscribe("task.completed", (event) => taskCompleted.push(event))
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				status: "running",
				toolCalls: [
					{
						id: toolId,
						index: 0,
						type: "function",
						function: { name: "finish_task", arguments: "{}" },
					},
				],
			}),
		)

		store.enqueueMessage(
			TOPIC_ID,
			createFinishTaskEnvelope({ toolId, legacyToolCallId: undefined }),
		)

		expect(taskCompleted).toEqual([])
		expect(warnSpy).toHaveBeenCalledWith(
			"[SuperMagicStore] invalid finish_task lifecycle message",
			expect.objectContaining({
				code: "finish-task-owner-conflict",
				toolId,
			}),
		)
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
		const taskCompleted: TaskCompletedEvent[] = []
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))
		store.subscribe("toolCall.settled", (event) => settled.push(event))
		store.subscribe("task.completed", (event) => taskCompleted.push(event))

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
		expect(taskCompleted).toEqual([])
		expect(store.toolResponseMap.get(TOPIC_ID)?.get("historical-tool-events")).toMatchObject({
			status: "finished",
		})
	})

	it("seeds a historical finish_task so a later live canonical message cannot replay the task", () => {
		const store = new SuperMagicStore()
		const taskCompleted: TaskCompletedEvent[] = []
		store.subscribe("task.completed", (event) => taskCompleted.push(event))
		store.initializeMessages(TOPIC_ID, [createFinishTaskEnvelope()])

		store.reconcileAuthoritativeMessages(TOPIC_ID, {
			statusItems: [
				createFinishTaskEnvelope({
					appMessageId: "finish-task-after-history",
					superMessageId: "super-finish-task-after-history",
					seqId: "102",
				}),
			],
			membershipItems: [
				createFinishTaskEnvelope({
					appMessageId: "finish-task-after-history",
					superMessageId: "super-finish-task-after-history",
					seqId: "102",
				}),
			],
			writeOptions: {
				mode: "merge",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "live",
					trigger: "websocket",
				},
			},
		})

		expect(taskCompleted).toEqual([])
	})

	it.each(["history", "recovery", "polling"] as const)(
		"keeps %s authoritative finish_task reconciliation silent",
		(trigger) => {
			const store = new SuperMagicStore()
			const taskCompleted: TaskCompletedEvent[] = []
			store.subscribe("task.completed", (event) => taskCompleted.push(event))
			const finishTask = createFinishTaskEnvelope({
				appMessageId: `finish-task-${trigger}`,
				superMessageId: `super-finish-task-${trigger}`,
			})

			store.reconcileAuthoritativeMessages(TOPIC_ID, {
				statusItems: [finishTask],
				membershipItems: [finishTask],
				writeOptions: {
					mode: "merge",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
					canonicalCommitContext: {
						source: "http",
						lifecycleEventPolicy: "silent",
						trigger,
					},
				},
			})

			expect(taskCompleted).toEqual([])
		},
	)

	it("publishes a live HTTP finish_task arrival exactly once", () => {
		const store = new SuperMagicStore()
		const events: Array<MessageCommittedEvent | TaskCompletedEvent> = []
		const runningAssistant = createAssistantEnvelope({ status: "running" })
		const finishTask = createFinishTaskEnvelope()

		store.subscribe("message.committed", (event) => events.push(event))
		store.subscribe("task.completed", (event) => events.push(event))
		store.initializeMessages(TOPIC_ID, [runningAssistant])

		const reconcileLiveTail = () =>
			store.reconcileAuthoritativeMessages(TOPIC_ID, {
				statusItems: [runningAssistant, finishTask],
				membershipItems: [runningAssistant, finishTask],
				writeOptions: {
					mode: "replace",
					eventPolicy: "live_arrival",
					toolProjectionPolicy: "preserve_live",
					canonicalCommitContext: {
						source: "http",
						lifecycleEventPolicy: "live",
						trigger: "websocket",
					},
				},
			})

		reconcileLiveTail()
		reconcileLiveTail()

		expect(events.map((event) => event.type)).toEqual(["message.committed", "task.completed"])
		expect((events[0] as MessageCommittedEvent).payload.message).toMatchObject({
			appMessageId: FINISH_TASK_APP_MESSAGE_ID,
			role: "tool",
			superStatus: "finished",
		})
		expect((events[1] as TaskCompletedEvent).meta).toMatchObject({
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

		store.initializeMessages(TOPIC_ID, [createAssistantEnvelope()], {
			mode: "merge",
			eventPolicy: "live_arrival",
			toolProjectionPolicy: "preserve_live",
			canonicalCommitContext: {
				source: "http",
				lifecycleEventPolicy: "live",
				trigger: "websocket",
			},
		})

		expect(events.map((event) => event.type)).toEqual([
			"message.stream.ended",
			"message.committed",
			"topic.execution.ended",
		])
		expect((events[0] as MessageStreamEndedEvent).payload.reason).toBe("authoritative_final")
	})

	it("publishes a background Topic terminal only after canonical commit and stream cleanup", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("another-active-topic")
		const correlationId = "background-execution-correlation"
		const superMessageId = "background-execution-super"
		const taskId = "background-execution-task"
		const order: string[] = []
		store.subscribe("message.stream.ended", () => order.push("message.stream.ended"))
		store.subscribe("message.committed", () => order.push("message.committed"))
		store.subscribe("topic.execution.ended", (event) => {
			order.push("topic.execution.ended")
			expect(event.payload.executionId).toBe(`task:${taskId}`)
			expect(store.getMessageNode(superMessageId)).toMatchObject({
				status: "finished",
				task_id: taskId,
			})
			expect(store.getStreamState(TOPIC_ID, superMessageId)).toBeUndefined()
			expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		})

		store.receiveChunk(
			createChunk({ content: "background draft", correlationId, superMessageId, taskId }),
		)
		store.initializeMessages(
			TOPIC_ID,
			[
				createAssistantEnvelope({
					appMessageId: "background-execution-final",
					seqId: "300",
					correlationId,
					superMessageId,
					taskId,
				}),
			],
			{
				mode: "merge",
				eventPolicy: "live_arrival",
				toolProjectionPolicy: "preserve_live",
				canonicalCommitContext: {
					source: "http",
					lifecycleEventPolicy: "live",
					trigger: "websocket",
				},
			},
		)

		expect(order).toEqual([
			"message.stream.ended",
			"message.committed",
			"topic.execution.ended",
		])
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

	it("does not republish a conflicting terminal revision for the same execution", () => {
		const store = new SuperMagicStore()
		const topicEnded: TopicExecutionEndedEvent[] = []
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		store.subscribe("topic.execution.ended", (event) => topicEnded.push(event))

		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({ taskId: "terminal-conflict-task", seqId: "100" }),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createAssistantEnvelope({
				appMessageId: "terminal-conflict-revision",
				status: "error",
				taskId: "terminal-conflict-task",
				seqId: "101",
			}),
		)

		expect(topicEnded).toHaveLength(1)
		expect(topicEnded[0].payload.status).toBe("finished")
		expect(warnSpy).toHaveBeenCalledWith(
			"[SuperMagicStore] conflicting Topic execution terminal revision",
			expect.objectContaining({
				code: "topic-execution-terminal-conflict",
				executionId: "task:terminal-conflict-task",
				previousStatus: "finished",
				status: "error",
			}),
		)
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
