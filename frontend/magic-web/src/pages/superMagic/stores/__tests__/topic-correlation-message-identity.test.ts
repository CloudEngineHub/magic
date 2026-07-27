import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	RawSuperMagicMessageEnvelope,
	StreamRecoveryRequestPayload,
	TopicMessageListenerPayload,
} from "@/pages/superMagic/stores/types"
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

const TOPIC_A = "topic-a"
const TOPIC_B = "topic-b"
const CORRELATION_ID = "correlation-shared"
const RENDER_SETTLE_MS = 2_000

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type ChunkToolCall = ChunkChoice["delta"]["tool_calls"][number]

interface ProjectedToolCall {
	id?: string
	index?: number
	type?: string
	function?: {
		name?: string
		arguments?: string
	}
	tool?: {
		id?: string
		status?: string
	}
}

interface ProjectedNode {
	role?: string
	topic_id?: string
	correlation_id?: string
	content?: string | null
	status?: string
	tool_calls?: ProjectedToolCall[] | null
	tool?: {
		id?: string
		status?: string
	} | null
}

interface ChunkOptions {
	topicId?: string
	chatTopicId?: string
	correlationId?: string
	i?: number
	content?: string
	finishReason?: ChunkChoice["finish_reason"]
	toolCalls?: ChunkToolCall[]
}

interface EnvelopeOptions {
	topicId?: string
	nodeTopicId?: string
	appMessageId?: string
	correlationId?: string
	includeCorrelationId?: boolean
	seqId?: string
	role?: "assistant" | "tool" | "user"
	content?: string | null
	status?: string
	toolCalls?: ProjectedToolCall[] | null
	tool?: ProjectedNode["tool"]
	toolCallId?: string
}

interface MutableProtocolChunk {
	topic_id?: string
	chat_topic_id?: string
	super_magic_chunk: {
		correlation_id?: string
	}
}

function createChunk({
	topicId = TOPIC_A,
	chatTopicId = topicId,
	correlationId = CORRELATION_ID,
	i = 0,
	content = "",
	finishReason = null,
	toolCalls = [],
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${topicId}-${i}`,
		app_message_id: `app-chunk-${topicId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: chatTopicId,
		message_id: `completion-${topicId}`,
		super_magic_chunk: {
			i,
			usage: null,
			correlation_id: correlationId,
			choices: [
				{
					finish_reason: finishReason,
					delta: {
						content,
						role: "assistant",
						tool_calls: toolCalls,
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	}
}

function mutateProtocolChunk(
	chunk: SuperMagicChunkMessage,
	mutate: (draft: MutableProtocolChunk) => void,
): SuperMagicChunkMessage {
	const draft = JSON.parse(JSON.stringify(chunk)) as MutableProtocolChunk
	mutate(draft)
	// These fixtures intentionally model malformed wire data at the protocol boundary.
	return draft as unknown as SuperMagicChunkMessage
}

function createToolCall({
	id = "tool-1",
	status = "running",
}: {
	id?: string
	status?: string
} = {}): ProjectedToolCall {
	return {
		id,
		index: 0,
		type: "function",
		function: {
			name: "read_file",
			arguments: '{"path":"README.md"}',
		},
		tool: {
			id,
			status,
		},
	}
}

function createEnvelope({
	topicId = TOPIC_A,
	nodeTopicId = topicId,
	appMessageId = "assistant-app-1",
	correlationId = CORRELATION_ID,
	includeCorrelationId = true,
	seqId = "100",
	role = "assistant",
	content = "canonical",
	status = role === "tool" ? "running" : "finished",
	toolCalls = role === "assistant" ? [] : null,
	tool = null,
	toolCallId,
}: EnvelopeOptions = {}): RawSuperMagicMessageEnvelope {
	const node: SuperMagicNode = {
		role,
		topic_id: nodeTopicId,
		message_id: `node-${appMessageId}`,
		content,
		reasoning_content: null,
		tool_calls: toolCalls,
		tool_call_id: toolCallId,
		tool,
		status,
		send_timestamp: Number(seqId) || 1,
	}

	if (includeCorrelationId) node.correlation_id = correlationId

	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-1",
			seq_id: seqId,
			message_id: `server-${seqId}-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: role === "user" ? "user-1" : "assistant-1",
				send_time: Number(seqId) || 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// Runtime accepts V2, while RawSuperMagicMessageEnvelope still omits that variant.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(activeTopicId: string | null = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(activeTopicId)
	return store
}

function getNode(store: SuperMagicStore, id: string): ProjectedNode | undefined {
	const node = store.getMessageNode(id)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function advanceRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function collectTopicArrivals(
	store: SuperMagicStore,
	topicId: string,
): {
	events: TopicMessageListenerPayload[]
	unsubscribe: () => void
} {
	const events: TopicMessageListenerPayload[] = []
	const unsubscribe = store.registerTopicMessageListener({
		topicId,
		callback: (payload) => events.push(payload),
	})
	return { events, unsubscribe }
}

function collectRecoveryRequests(store: SuperMagicStore): {
	events: StreamRecoveryRequestPayload[]
	unsubscribe: () => void
} {
	const events: StreamRecoveryRequestPayload[] = []
	const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => events.push(payload))
	return { events, unsubscribe }
}

describe("SuperMagicStore / Topic、Correlation 和消息身份", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("chunk 缺少 `topic_id`。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const chunk = mutateProtocolChunk(createChunk(), (draft) => {
			delete draft.topic_id
		})

		store.receiveChunk(chunk)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(getNode(store, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("chunk 缺少 `correlation_id`。", () => {
		const store = createStore()
		const chunk = mutateProtocolChunk(createChunk(), (draft) => {
			delete draft.super_magic_chunk.correlation_id
		})

		store.receiveChunk(chunk)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(getNode(store, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("chunk 的 `topic_id` 与当前激活话题不一致。", () => {
		const store = createStore(TOPIC_A)

		store.receiveChunk(createChunk({ topicId: TOPIC_B, content: "background" }))

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.getStreamState(TOPIC_B, CORRELATION_ID)?.content).toBe("background")
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(store.isTopicStreaming(TOPIC_B)).toBe(true)
	})

	it("`topic_id`、`chat_topic_id` 和 Super Magic 内部 topicId 不一致。", () => {
		const store = createStore(TOPIC_A)

		store.receiveChunk(
			createChunk({
				topicId: TOPIC_A,
				chatTopicId: TOPIC_B,
				content: "must-not-be-routed",
			}),
		)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.getStreamState(TOPIC_B, CORRELATION_ID)).toBeUndefined()
		expect(getNode(store, CORRELATION_ID)).toBeUndefined()
	})

	it("同一个 correlationId 被不同 topic 使用。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, content: "topic A" }))
		store.receiveChunk(createChunk({ topicId: TOPIC_B, content: "topic B" }))

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.content).toBe("topic A")
		expect(store.getStreamState(TOPIC_B, CORRELATION_ID)?.content).toBe("topic B")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).not.toBe(
			store.getStreamState(TOPIC_B, CORRELATION_ID),
		)
	})

	it("HTTP Final 不从另一 topic 的同 correlation Assistant 继承 arguments。", () => {
		const store = createStore(TOPIC_A)
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const streamedArguments = '{"path":"topic-a-only.md"}'
		const streamedTool: ChunkToolCall = {
			id: "tool-1",
			index: 0,
			type: "function",
			function: { name: "read_file", arguments: streamedArguments },
		}
		const finalWithoutArguments: ProjectedToolCall = {
			id: "tool-1",
			type: "function",
			function: { name: "read_file" },
		}

		try {
			store.receiveChunk(createChunk({ topicId: TOPIC_A, toolCalls: [streamedTool] }))
			const generation = store.beginTopicSync(TOPIC_B)
			store.initializeMessages(TOPIC_B, [
				createEnvelope({
					topicId: TOPIC_B,
					nodeTopicId: TOPIC_B,
					appMessageId: "assistant-topic-b",
					toolCalls: [finalWithoutArguments],
					content: "topic B canonical",
				}),
			])
			expect(
				store.completeTopicSync(TOPIC_B, generation, {
					succeeded: true,
					taskStatus: "finished",
					latestSeqId: "100",
				}),
			).toBe(true)

			const topicBNode = getNode(store, "assistant-topic-b")
			const topicBArguments = topicBNode?.tool_calls?.[0]?.function?.arguments
			expect(topicBNode).toMatchObject({
				role: "assistant",
				topic_id: TOPIC_B,
				correlation_id: CORRELATION_ID,
			})
			expect(topicBArguments ?? "").toBe("")
			expect(topicBArguments).not.toBe(streamedArguments)
			expect(
				store.getStreamState(TOPIC_A, CORRELATION_ID)?.tool_calls?.[0]?.function?.arguments,
			).toBe(streamedArguments)
			expect(consoleWarn).toHaveBeenCalledWith(
				"[SuperMagicStore] assistant correlation alias conflict",
				expect.objectContaining({
					topicId: TOPIC_B,
					correlationId: CORRELATION_ID,
					conflictingTopicId: TOPIC_A,
					resolution: "preserve-existing-correlation-canonical",
				}),
			)
			expect(consoleWarn).toHaveBeenCalledTimes(1)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("IM Final 不从另一 topic 的同 correlation Assistant 继承或覆盖 alias。", () => {
		const store = createStore(TOPIC_A)
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const streamedArguments = '{"path":"topic-a-im-only.md"}'
		const streamedTool: ChunkToolCall = {
			id: "tool-1",
			index: 0,
			type: "function",
			function: { name: "read_file", arguments: streamedArguments },
		}
		const finalWithoutArguments: ProjectedToolCall = {
			id: "tool-1",
			type: "function",
			function: { name: "read_file" },
		}

		try {
			store.receiveChunk(createChunk({ topicId: TOPIC_A, toolCalls: [streamedTool] }))
			store.enqueueMessage(
				TOPIC_B,
				createEnvelope({
					topicId: TOPIC_B,
					nodeTopicId: TOPIC_B,
					appMessageId: "assistant-topic-b-im",
					toolCalls: [finalWithoutArguments],
					content: "topic B IM canonical",
				}),
			)
			advanceRendering()

			const topicANode = getNode(store, CORRELATION_ID)
			const topicBNode = getNode(store, "assistant-topic-b-im")
			expect(topicANode).toMatchObject({
				role: "assistant",
				topic_id: TOPIC_A,
				correlation_id: CORRELATION_ID,
			})
			expect(topicBNode).toMatchObject({
				role: "assistant",
				topic_id: TOPIC_B,
				correlation_id: CORRELATION_ID,
				content: "topic B IM canonical",
			})
			expect(topicBNode?.tool_calls?.[0]?.function?.arguments ?? "").toBe("")
			expect(topicBNode).not.toBe(topicANode)
			expect(consoleWarn).toHaveBeenCalledWith(
				"[SuperMagicStore] assistant correlation alias conflict",
				expect.objectContaining({
					topicId: TOPIC_B,
					correlationId: CORRELATION_ID,
					conflictingTopicId: TOPIC_A,
					resolution: "preserve-existing-correlation-canonical",
				}),
			)
			expect(consoleWarn).toHaveBeenCalledTimes(1)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("HTTP Final 在两个 topic 都有同 correlation StreamState 时只继承目标 topic。", () => {
		const store = createStore(TOPIC_A)
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const topicAArguments = '{"path":"topic-a-active.md"}'
		const topicBArguments = '{"path":"topic-b-active.md"}'

		try {
			store.receiveChunk(
				createChunk({
					topicId: TOPIC_A,
					toolCalls: [
						{
							id: "tool-1",
							index: 0,
							type: "function",
							function: { name: "read_file", arguments: topicAArguments },
						},
					],
				}),
			)
			store.receiveChunk(
				createChunk({
					topicId: TOPIC_B,
					toolCalls: [
						{
							id: "tool-1",
							index: 0,
							type: "function",
							function: { name: "read_file", arguments: topicBArguments },
						},
					],
				}),
			)
			const generation = store.beginTopicSync(TOPIC_B)
			store.initializeMessages(TOPIC_B, [
				createEnvelope({
					topicId: TOPIC_B,
					nodeTopicId: TOPIC_B,
					appMessageId: "assistant-topic-b-http-active",
					toolCalls: [
						{
							id: "tool-1",
							type: "function",
							function: { name: "read_file" },
						},
					],
					content: "topic B HTTP final",
				}),
			])
			expect(
				store.completeTopicSync(TOPIC_B, generation, {
					succeeded: true,
					taskStatus: "finished",
					latestSeqId: "100",
				}),
			).toBe(true)

			expect(getNode(store, CORRELATION_ID)?.topic_id).toBe(TOPIC_A)
			expect(
				getNode(store, "assistant-topic-b-http-active")?.tool_calls?.[0]?.function
					?.arguments,
			).toBe(topicBArguments)
			expect(consoleWarn).toHaveBeenCalledTimes(1)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("IM Final 在两个 topic 都有同 correlation StreamState 时只继承目标 topic。", () => {
		const store = createStore(TOPIC_A)
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const topicAArguments = '{"path":"topic-a-im-active.md"}'
		const topicBArguments = '{"path":"topic-b-im-active.md"}'

		try {
			store.receiveChunk(
				createChunk({
					topicId: TOPIC_A,
					toolCalls: [
						{
							id: "tool-1",
							index: 0,
							type: "function",
							function: { name: "read_file", arguments: topicAArguments },
						},
					],
				}),
			)
			store.receiveChunk(
				createChunk({
					topicId: TOPIC_B,
					toolCalls: [
						{
							id: "tool-1",
							index: 0,
							type: "function",
							function: { name: "read_file", arguments: topicBArguments },
						},
					],
				}),
			)
			store.enqueueMessage(
				TOPIC_B,
				createEnvelope({
					topicId: TOPIC_B,
					nodeTopicId: TOPIC_B,
					appMessageId: "assistant-topic-b-im-active",
					toolCalls: [
						{
							id: "tool-1",
							type: "function",
							function: { name: "read_file" },
						},
					],
					content: "topic B IM final",
				}),
			)
			advanceRendering()

			expect(getNode(store, CORRELATION_ID)?.topic_id).toBe(TOPIC_A)
			expect(
				getNode(store, "assistant-topic-b-im-active")?.tool_calls?.[0]?.function?.arguments,
			).toBe(topicBArguments)
			expect(consoleWarn).toHaveBeenCalledTimes(1)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("IM Final 不覆盖 correlation key 已被 Tool 占用的 canonical。", () => {
		const store = createStore(TOPIC_A)
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: CORRELATION_ID,
					role: "tool",
					content: null,
					toolCallId: "tool-1",
					tool: { id: "tool-1", status: "finished" },
				}),
			)
			store.receiveChunk(
				createChunk({
					toolCalls: [
						{
							id: "tool-1",
							index: 0,
							type: "function",
							function: { name: "read_file", arguments: "streamed" },
						},
					],
				}),
			)
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: "assistant-role-key",
					role: "assistant",
					content: "assistant final",
					toolCalls: [
						{
							id: "tool-1",
							type: "function",
							function: { name: "read_file", arguments: "final" },
						},
					],
				}),
			)
			advanceRendering()

			expect(getNode(store, CORRELATION_ID)).toMatchObject({
				role: "tool",
				tool: { id: "tool-1", status: "finished" },
			})
			expect(getNode(store, "assistant-role-key")).toMatchObject({
				role: "assistant",
				content: "assistant final",
				tool_calls: [expect.objectContaining({ id: "tool-1" })],
			})
			expect(consoleWarn).toHaveBeenCalledWith(
				"[SuperMagicStore] assistant correlation alias conflict",
				expect.objectContaining({
					topicId: TOPIC_A,
					correlationId: CORRELATION_ID,
					conflictingAppMessageId: CORRELATION_ID,
					conflictingRole: "tool",
					resolution: "preserve-existing-correlation-canonical",
				}),
			)
			expect(consoleWarn).toHaveBeenCalledTimes(1)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("同 correlation 的流重启不得清空已占用 key 的 Tool canonical。", () => {
		const store = createStore(TOPIC_A)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: CORRELATION_ID,
				role: "tool",
				content: "tool audit payload",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		store.receiveChunk(createChunk({ i: 0, content: "first" }))
		store.receiveChunk(createChunk({ i: 1, content: "second" }))
		store.receiveChunk(createChunk({ i: 0, content: "restart" }))

		expect(getNode(store, CORRELATION_ID)).toMatchObject({
			role: "tool",
			content: "tool audit payload",
			tool: { id: "tool-1", status: "finished" },
		})
	})

	it.each(["tool", "user"] as const)(
		"HTTP Final 不覆盖 correlation key 已被 %s 占用的 canonical。",
		(role) => {
			const store = createStore(TOPIC_A)
			const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
			const nonAssistantAppMessageId = CORRELATION_ID

			try {
				const generation = store.beginTopicSync(TOPIC_A)
				store.initializeMessages(TOPIC_A, [
					createEnvelope({
						appMessageId: "assistant-http-role-key",
						seqId: "101",
						role: "assistant",
						content: "assistant HTTP final",
						toolCalls: [
							{
								id: "tool-1",
								type: "function",
								function: { name: "read_file", arguments: "final" },
							},
						],
					}),
					createEnvelope({
						appMessageId: nonAssistantAppMessageId,
						seqId: "100",
						role,
						content: role === "user" ? "user audit payload" : null,
						toolCallId: role === "tool" ? "tool-1" : undefined,
						tool: role === "tool" ? { id: "tool-1", status: "finished" } : undefined,
					}),
				])

				expect(
					store.completeTopicSync(TOPIC_A, generation, {
						succeeded: true,
						taskStatus: "finished",
						latestSeqId: "101",
					}),
				).toBe(true)

				expect(getNode(store, CORRELATION_ID)).toMatchObject({
					role,
					content: role === "user" ? "user audit payload" : null,
				})
				expect(getNode(store, "assistant-http-role-key")).toMatchObject({
					role: "assistant",
					content: "assistant HTTP final",
				})
				expect(
					(store.messages.get(TOPIC_A) ?? []).map((message) => message.app_message_id),
				).toEqual(expect.arrayContaining([CORRELATION_ID, "assistant-http-role-key"]))
				expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
				expect(consoleWarn).toHaveBeenCalledWith(
					"[SuperMagicStore] assistant correlation alias conflict",
					expect.objectContaining({
						topicId: TOPIC_A,
						correlationId: CORRELATION_ID,
						conflictingAppMessageId: CORRELATION_ID,
						conflictingRole: role,
						resolution: "preserve-existing-correlation-canonical",
					}),
				)
				expect(consoleWarn).toHaveBeenCalledTimes(1)
			} finally {
				consoleWarn.mockRestore()
			}
		},
	)

	it("suspended 结算不得把 Assistant 流式工具写入已占用 key 的 Tool canonical。", () => {
		const store = createStore(TOPIC_A)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: CORRELATION_ID,
				role: "tool",
				content: null,
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "running" },
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					{
						id: "tool-1",
						index: 0,
						type: "function",
						function: { name: "read_file", arguments: "streamed" },
					},
				],
			}),
		)
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "suspended",
				latestSeqId: "100",
			}),
		).toBe(true)

		expect(getNode(store, CORRELATION_ID)).toMatchObject({
			role: "tool",
			tool_calls: null,
			tool: { id: "tool-1", status: "running" },
		})
	})

	it("suspended 完成不得用共享 correlation 的 Tool node 覆盖已有 Assistant appMessageId。", () => {
		const store = createStore(TOPIC_A)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "assistant-before-role-collision",
				seqId: "100",
				content: "assistant canonical",
			}),
		)
		advanceRendering()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: CORRELATION_ID,
				seqId: "101",
				role: "tool",
				content: null,
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "running" },
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					{
						id: "tool-1",
						index: 0,
						type: "function",
						function: { name: "read_file", arguments: "streamed" },
					},
				],
			}),
		)
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "suspended",
				latestSeqId: "101",
			}),
		).toBe(true)

		expect(getNode(store, CORRELATION_ID)?.role).toBe("tool")
		expect(getNode(store, "assistant-before-role-collision")).toMatchObject({
			role: "assistant",
			correlation_id: CORRELATION_ID,
		})
	})

	it("终态快照结算不得把 Assistant 流式内容写入已占用 key 的 Tool canonical。", () => {
		const store = createStore(TOPIC_A)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: CORRELATION_ID,
				role: "tool",
				content: "tool audit payload",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		store.receiveChunk(createChunk({ i: 0, content: "assistant draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "error",
				latestSeqId: "100",
			}),
		).toBe(true)

		expect(getNode(store, CORRELATION_ID)).toMatchObject({
			role: "tool",
			content: "tool audit payload",
			tool: { id: "tool-1", status: "finished" },
		})
	})

	it("不可见话题的完成流刷写不得覆盖已占用 key 的 Tool canonical。", () => {
		const store = createStore(TOPIC_B)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				topicId: TOPIC_A,
				nodeTopicId: TOPIC_A,
				appMessageId: CORRELATION_ID,
				role: "tool",
				content: "tool audit payload",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 0, content: "assistant draft" }))
		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 1, finishReason: "stop" }))

		expect(getNode(store, CORRELATION_ID)).toMatchObject({
			role: "tool",
			content: "tool audit payload",
			tool: { id: "tool-1", status: "finished" },
		})
	})

	it("同一个 topic 中 correlationId 被不同 assistant 消息复用。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "assistant-old", seqId: "100", content: "old" }),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "assistant-new", seqId: "101", content: "new" }),
		)
		advanceRendering()

		const canonical = getNode(store, CORRELATION_ID)
		expect(canonical).toMatchObject({ content: "new", correlation_id: CORRELATION_ID })
		expect(getNode(store, "assistant-old")).toBe(canonical)
		expect(getNode(store, "assistant-new")).toBe(canonical)
	})

	it("correlationId 与某个真实 `app_message_id` 相同。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "identity-collision",
				correlationId: "original-correlation",
				content: "existing message",
			}),
		)
		advanceRendering()

		store.receiveChunk(
			createChunk({ correlationId: "identity-collision", content: "unrelated stream" }),
		)

		expect(getNode(store, "identity-collision")?.content).toBe("existing message")
		expect(store.getStreamState(TOPIC_A, "identity-collision")).toBeUndefined()
	})

	it("correlationId 与其他话题的 `app_message_id` 冲突。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				topicId: TOPIC_A,
				appMessageId: "cross-topic-id",
				correlationId: "topic-a-correlation",
				content: "topic A final",
			}),
		)
		advanceRendering()
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_B,
				correlationId: "cross-topic-id",
				content: "topic B draft",
			}),
		)

		expect(getNode(store, "topic-a-correlation")?.content).toBe("topic A final")
		expect(store.getStreamState(TOPIC_B, "cross-topic-id")?.content).toBe("topic B draft")
		expect(store.getStreamState(TOPIC_A, "cross-topic-id")).toBeUndefined()
	})

	it("chunk 使用 correlationId，最终 message 使用另一个 correlationId。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ correlationId: "stream-correlation", content: "draft" }))
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "final-app",
				correlationId: "final-correlation",
				content: "final",
			}),
		)
		advanceRendering()

		expect(getNode(store, "final-correlation")?.content).toBe("final")
		expect(getNode(store, "final-app")).toBe(getNode(store, "final-correlation"))
		expect(store.getStreamState(TOPIC_A, "stream-correlation")?.content).toBe("draft")
	})

	it("tool response 的 correlationId 与所属 assistant 不一致。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "assistant-with-tool",
				correlationId: "assistant-correlation",
				toolCalls: [createToolCall()],
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "tool-response",
				correlationId: "wrong-correlation",
				seqId: "101",
				role: "tool",
				content: null,
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		advanceRendering()

		expect(getNode(store, "assistant-with-tool")?.tool_calls?.[0]?.tool?.status).toBe("running")
		expect(getNode(store, "tool-response")?.tool?.status).toBe("finished")
	})

	it.each(["tool", "user"] as const)(
		"Assistant Final 不覆盖共享 correlation 的 %s 消息身份。",
		(role) => {
			const store = createStore()
			const nonAssistantAppMessageId = `${role}-shared-correlation`

			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: nonAssistantAppMessageId,
					seqId: "100",
					role,
					content: role === "user" ? "user fact" : null,
					toolCallId: role === "tool" ? "tool-1" : undefined,
					tool: role === "tool" ? { id: "tool-1", status: "finished" } : undefined,
				}),
			)
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: "assistant-final",
					seqId: "101",
					role: "assistant",
					content: "assistant canonical",
				}),
			)
			advanceRendering()

			expect(getNode(store, nonAssistantAppMessageId)?.role).toBe(role)
			if (role === "tool") {
				expect(getNode(store, nonAssistantAppMessageId)?.tool).toMatchObject({
					id: "tool-1",
					status: "finished",
				})
			} else {
				expect(getNode(store, nonAssistantAppMessageId)?.content).toBe("user fact")
			}
			expect(getNode(store, CORRELATION_ID)).toMatchObject({
				role: "assistant",
				content: "assistant canonical",
			})
			expect(getNode(store, "assistant-final")).toEqual(getNode(store, CORRELATION_ID))
			expect(
				(store.messages.get(TOPIC_A) ?? []).filter(
					(message) => message.role === "assistant",
				),
			).toHaveLength(1)
		},
	)

	it.each(["tool", "user"] as const)(
		"找不到 Assistant 目标时保留 correlation canonical，不向共享 correlation 的 %s 回退。",
		(role) => {
			const store = createStore()
			const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
			const nonAssistantAppMessageId = `${role}-only-shared-correlation`

			try {
				store.enqueueMessage(
					TOPIC_A,
					createEnvelope({
						appMessageId: nonAssistantAppMessageId,
						seqId: "100",
						role,
						content: role === "user" ? "user fact" : null,
						toolCallId: role === "tool" ? "tool-1" : undefined,
						tool: role === "tool" ? { id: "tool-1", status: "finished" } : undefined,
					}),
				)
				store.receiveChunk(
					createChunk({
						i: 0,
						finishReason: "stop",
						toolCalls: [
							{
								index: 0,
								type: "function",
								function: { arguments: "provisional" },
							},
						],
					}),
				)
				const generation = store.beginTopicSync(TOPIC_A)

				expect(
					store.completeTopicSync(TOPIC_A, generation, {
						succeeded: true,
						taskStatus: "error",
					}),
				).toBe(true)

				expect(getNode(store, CORRELATION_ID)).toMatchObject({
					role: "assistant",
					correlation_id: CORRELATION_ID,
				})
				expect(getNode(store, nonAssistantAppMessageId)?.role).toBe(role)
				if (role === "tool") {
					expect(getNode(store, nonAssistantAppMessageId)?.tool).toMatchObject({
						id: "tool-1",
						status: "finished",
					})
				} else {
					expect(getNode(store, nonAssistantAppMessageId)?.content).toBe("user fact")
				}
				expect(consoleWarn).toHaveBeenCalledWith(
					"[SuperMagicStore] assistant alias target missing",
					expect.objectContaining({
						topicId: TOPIC_A,
						correlationId: CORRELATION_ID,
						conflictingAppMessageId: nonAssistantAppMessageId,
						conflictingRole: role,
						resolution: "preserve-correlation-canonical",
					}),
				)
				expect(consoleWarn).toHaveBeenCalledTimes(1)
			} finally {
				consoleWarn.mockRestore()
			}
		},
	)

	it("最终 message 缺少 correlationId。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "final-without-correlation",
				includeCorrelationId: false,
				content: "still addressable",
			}),
		)
		advanceRendering()

		expect(getNode(store, "final-without-correlation")).toMatchObject({
			content: "still addressable",
			role: "assistant",
		})
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("最终 message 的 appMessageId 在列表中已经存在。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "same-app", content: "old", seqId: "100" }),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "same-app", content: "updated", seqId: "101" }),
		)
		advanceRendering()

		expect(getNode(store, "same-app")?.content).toBe("updated")
		expect(getNode(store, "same-app")).toBe(getNode(store, CORRELATION_ID))
	})

	it("同一最终 message 使用不同 seqId 重复到达。", () => {
		const store = createStore()
		const arrivals = collectTopicArrivals(store, TOPIC_A)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "duplicate-final", seqId: "100" }),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "duplicate-final", seqId: "101" }),
		)
		advanceRendering()

		expect(
			arrivals.events.filter((event) => event.message.app_message_id === CORRELATION_ID),
		).toHaveLength(1)
		expect(getNode(store, "duplicate-final")).toBe(getNode(store, CORRELATION_ID))
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
		arrivals.unsubscribe()
	})

	it("同一 seqId 对应两个不同 appMessageId。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "seq-owner",
				correlationId: "correlation-owner",
				seqId: "100",
				content: "first",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "seq-conflict",
				correlationId: "correlation-conflict",
				seqId: "100",
				content: "second",
			}),
		)
		advanceRendering()

		expect(getNode(store, "seq-owner")?.content).toBe("first")
		expect(getNode(store, "seq-conflict")).toBeUndefined()
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
	})

	it("`messageMap` 的全局 key 在不同 topic 之间发生冲突。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				topicId: TOPIC_A,
				appMessageId: "same-global-app",
				correlationId: "correlation-a",
				content: "A",
			}),
		)
		store.enqueueMessage(
			TOPIC_B,
			createEnvelope({
				topicId: TOPIC_B,
				appMessageId: "same-global-app",
				correlationId: "correlation-b",
				content: "B",
			}),
		)
		advanceRendering()

		expect(getNode(store, "correlation-a")?.content).toBe("A")
		expect(getNode(store, "correlation-b")?.content).toBe("B")
		expect(getNode(store, "correlation-a")).not.toBe(getNode(store, "correlation-b"))
	})

	it("`topicMap` 尚未建立时 chunk 已经到达。", () => {
		const store = createStore(null)

		store.receiveChunk(createChunk({ i: 0, content: "before map" }))
		store.receiveChunk(createChunk({ i: 1, content: " complete", finishReason: "stop" }))
		advanceRendering()

		expect(getNode(store, CORRELATION_ID)?.content).toBe("before map complete")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
	})

	it("topic 映射更新后，旧 topicId 的 chunk 继续到达。", () => {
		const store = createStore(TOPIC_A)

		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 0, content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, i: 1, content: "B", finishReason: "stop" }),
		)
		advanceRendering()

		expect(getNode(store, CORRELATION_ID)?.content).toBe("AB")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_B)).toBe(false)
	})

	it("服务端返回的 topicId 与测试或回放时重写的 topicId 不一致。", () => {
		const store = createStore(TOPIC_A)
		const arrivalsA = collectTopicArrivals(store, TOPIC_A)
		const arrivalsB = collectTopicArrivals(store, TOPIC_B)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				topicId: TOPIC_B,
				nodeTopicId: TOPIC_B,
				appMessageId: "rewritten-topic-message",
				content: "replayed",
			}),
		)
		advanceRendering()

		expect(arrivalsA.events).toHaveLength(1)
		expect(arrivalsB.events).toHaveLength(0)
		expect(getNode(store, "rewritten-topic-message")?.topic_id).toBe(TOPIC_A)
		arrivalsA.unsubscribe()
		arrivalsB.unsubscribe()
	})

	it("后续流式 Final 使用内层 Agent topic 时，已回补的前序消息不会永久留在 buffer。", () => {
		const store = createStore(TOPIC_A)
		const arrivals = collectTopicArrivals(store, TOPIC_A)

		store.receiveChunk(
			createChunk({
				correlationId: "message-3-correlation",
				content: "message 3 draft",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "message-2",
				correlationId: "message-2-correlation",
				seqId: "101",
				content: "message 2 final",
			}),
		)

		expect(getNode(store, "message-2-correlation")?.content).toBe("message 2 final")
		expect(store.getStreamState(TOPIC_A, "message-2-correlation")).toBeUndefined()
		expect(store.getStreamState(TOPIC_A, "message-3-correlation")).toBeDefined()
		expect(
			arrivals.events.filter((event) => event.message.app_message_id === "message-2"),
		).toHaveLength(1)

		store.receiveChunk(
			createChunk({
				correlationId: "message-2-correlation",
				content: "late message 2 chunk",
			}),
		)

		expect(getNode(store, "message-2-correlation")?.content).toBe("message 2 final")
		expect(store.getStreamState(TOPIC_A, "message-2-correlation")).toBeUndefined()
		expect(store.getStreamState(TOPIC_A, "message-3-correlation")).toBeDefined()
		expect(
			arrivals.events.filter((event) => event.message.app_message_id === "message-2"),
		).toHaveLength(1)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				topicId: TOPIC_A,
				nodeTopicId: TOPIC_B,
				appMessageId: "message-3",
				correlationId: "message-3-correlation",
				seqId: "102",
				content: "message 3 final",
			}),
		)
		advanceRendering()

		expect(getNode(store, "message-2-correlation")?.content).toBe("message 2 final")
		expect(getNode(store, "message-3-correlation")?.content).toBe("message 3 final")
		expect(store.getStreamState(TOPIC_A, "message-2-correlation")).toBeUndefined()
		expect(store.getStreamState(TOPIC_A, "message-3-correlation")).toBeUndefined()
		arrivals.unsubscribe()
	})
})
