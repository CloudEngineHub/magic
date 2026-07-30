import { describe, expect, it } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	MessageCommittedEvent,
	MessageCompletedEvent,
	MessageStreamEndedEvent,
	ToolCallSettledEvent,
} from "@/pages/superMagic/stores/events"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_ID = "topic-events-recovery"
const CORRELATION_ID = "correlation-events-recovery"
const SUPER_MESSAGE_ID = "super-message-events-recovery"

function createChunk(): SuperMagicChunkMessage {
	return {
		magic_message_id: "magic-chunk-events-recovery",
		app_message_id: "app-chunk-events-recovery",
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-events-recovery",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: "completion-events-recovery",
		super_magic_chunk: {
			super_message_id: SUPER_MESSAGE_ID,
			task_id: "task-events-recovery",
			i: 0,
			usage: null,
			correlation_id: CORRELATION_ID,
			choices: [
				{
					finish_reason: null,
					delta: {
						content: "draft removed by authoritative recovery",
						role: "assistant",
						tool_calls: [],
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	} as SuperMagicChunkMessage
}

function createAssistantEnvelope({
	appMessageId,
	seqId,
	toolCallId,
}: {
	appMessageId: string
	seqId: string
	toolCallId?: string
}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: `magic-${appMessageId}`,
			seq_id: seqId,
			message_id: `server-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-events-recovery",
			organization_code: "organization-events-recovery",
			message: {
				magic_message_id: `magic-message-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-events-recovery",
				send_time: Number(seqId),
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "assistant",
					topic_id: TOPIC_ID,
					message_id: `node-${appMessageId}`,
					super_message_id: SUPER_MESSAGE_ID,
					correlation_id: CORRELATION_ID,
					content: `canonical-${seqId}`,
					reasoning_content: "",
					tool_calls: toolCallId
						? [
								{
									id: toolCallId,
									type: "function",
									function: { name: "list_dir", arguments: "{}" },
								},
							]
						: [],
					status: "finished",
					send_timestamp: Number(seqId),
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createToolEnvelope({
	seqId,
	status,
}: {
	seqId: string
	status: "running" | "finished"
}): RawSuperMagicMessageEnvelope {
	const appMessageId = "tool-http-revision"
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: `magic-tool-${seqId}`,
			seq_id: seqId,
			message_id: `server-tool-${seqId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-events-recovery",
			organization_code: "organization-events-recovery",
			message: {
				magic_message_id: `magic-message-tool-${seqId}`,
				app_message_id: appMessageId,
				sender_id: "tool-runner-events-recovery",
				send_time: Number(seqId),
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "tool",
					topic_id: TOPIC_ID,
					message_id: `node-tool-${seqId}`,
					correlation_id: CORRELATION_ID,
					content: null,
					reasoning_content: null,
					tool_calls: null,
					status,
					send_timestamp: Number(seqId),
					tool: {
						id: "tool-http-events",
						name: "list_dir",
						status,
						detail: { type: "json", data: { seqId } },
					},
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

describe("SuperMagic Store recovery events", () => {
	it("ends an active generation when a terminal authoritative snapshot removes it", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId(TOPIC_ID)
		store.receiveChunk(createChunk())
		const ended: MessageStreamEndedEvent[] = []
		store.subscribe("message.stream.ended", (event) => ended.push(event))

		const generation = store.beginTopicSync(TOPIC_ID)
		store.initializeMessages(TOPIC_ID, [], { mode: "replace", syncGeneration: generation })
		store.completeTopicSync(TOPIC_ID, generation, {
			succeeded: true,
			taskStatus: "finished",
		})

		expect(ended).toHaveLength(1)
		expect(ended[0]).toMatchObject({
			meta: {
				source: "recovery",
				correlationId: CORRELATION_ID,
				streamGeneration: 1,
			},
			payload: {
				reason: "recovery_replaced",
				awaitingCanonicalMessage: false,
			},
		})
	})

	it("publishes an HTTP revision of an existing Assistant logical message", () => {
		const store = new SuperMagicStore()
		const committed: MessageCommittedEvent[] = []
		const completed: MessageCompletedEvent[] = []

		store.initializeMessages(TOPIC_ID, [
			createAssistantEnvelope({ appMessageId: "assistant-http-100", seqId: "100" }),
		])
		store.subscribe("message.committed", (event) => committed.push(event))
		store.subscribe("message.completed", (event) => completed.push(event))

		store.initializeMessages(TOPIC_ID, [
			createAssistantEnvelope({ appMessageId: "assistant-http-101", seqId: "101" }),
		])

		expect(committed).toHaveLength(1)
		expect(committed[0]).toMatchObject({
			meta: { source: "http", correlationId: CORRELATION_ID },
			payload: {
				operation: "update",
				message: { appMessageId: "assistant-http-101", seqId: "101" },
			},
		})
		expect(committed[0].payload.changedFields).toEqual(
			expect.arrayContaining(["appMessageId", "seqId"]),
		)
		expect(completed).toEqual([])
	})

	it("publishes a terminal tool settlement when HTTP updates existing canonical tool state", () => {
		const store = new SuperMagicStore()
		const settled: ToolCallSettledEvent[] = []
		const owner = createAssistantEnvelope({
			appMessageId: "assistant-http-tool-owner",
			seqId: "199",
			toolCallId: "tool-http-events",
		})

		store.initializeMessages(TOPIC_ID, [
			owner,
			createToolEnvelope({ seqId: "200", status: "running" }),
		])
		store.subscribe("toolCall.settled", (event) => settled.push(event))

		store.initializeMessages(TOPIC_ID, [
			owner,
			createToolEnvelope({ seqId: "201", status: "finished" }),
		])

		expect(settled).toHaveLength(1)
		expect(settled[0]).toMatchObject({
			meta: { source: "http", toolCallId: "tool-http-events" },
			payload: {
				response: { status: "finished", detail: { type: "json", data: { seqId: "201" } } },
				strength: "strong",
				replaceable: false,
			},
		})
	})
})
