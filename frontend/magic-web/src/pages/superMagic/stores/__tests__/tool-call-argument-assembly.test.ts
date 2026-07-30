import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
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

const TOPIC_ID = "topic-tool-arguments"
const CORRELATION_ID = "correlation-tool-arguments"
const SUPER_MESSAGE_ID = "super-message-tool-arguments"
const RENDER_SETTLE_MS = 2_500

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type ChunkToolCall = ChunkChoice["delta"]["tool_calls"][number]

interface ProjectedToolState {
	id?: string
	name?: string
	status?: string
}

interface ToolCallOptions {
	id?: string
	name?: string
	arguments?: string
	index?: number
	type?: string
	tool?: ProjectedToolState
}

interface ChunkOptions {
	i?: number
	correlationId?: string
	toolCalls?: ChunkToolCall[]
	finishReason?: ChunkChoice["finish_reason"]
}

interface ProjectedToolCall {
	id?: string
	type?: string
	index?: number
	function?: {
		name?: string
		arguments?: string
	}
	tool?: ProjectedToolState
}

interface ProjectedNode {
	tool_calls?: Array<ProjectedToolCall | null | undefined> | null
}

interface StoredAssistantMessage {
	app_message_id?: string
	correlation_id?: string
	role?: string
	topic_id?: string
	seq_id?: string
}

function cloneFixture<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function protocolToolCall(value: Record<string, unknown>): ChunkToolCall {
	// Malformed wire payloads deliberately cross the declared protocol boundary only here.
	return value as unknown as ChunkToolCall
}

function createToolCall({
	id = "tool-1",
	name = "read_file",
	arguments: argumentsValue = "",
	index = 0,
	type = "function",
}: ToolCallOptions = {}): ChunkToolCall {
	return {
		id,
		type,
		index,
		function: {
			name,
			arguments: argumentsValue,
		},
	}
}

function createFinalToolCall({
	id = "tool-1",
	name = "read_file",
	arguments: argumentsValue = "",
	type = "function",
	tool,
}: Omit<ToolCallOptions, "index"> = {}): ProjectedToolCall {
	// Final tool calls are canonical snapshots; transport-only delta.index is rebuilt by Store.
	return {
		id,
		type,
		function: {
			name,
			arguments: argumentsValue,
		},
		...(tool ? { tool } : {}),
	}
}

function createArgumentsFragment(argumentsValue: string, index = 0): ChunkToolCall {
	return protocolToolCall({
		index,
		type: "function",
		function: { arguments: argumentsValue },
	})
}

function createChunk({
	i = 0,
	correlationId = CORRELATION_ID,
	toolCalls = [],
	finishReason = null,
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${correlationId}-${i}`,
		app_message_id: `app-chunk-${correlationId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: `completion-${correlationId}`,
		super_magic_chunk: {
			super_message_id:
				correlationId === CORRELATION_ID ? SUPER_MESSAGE_ID : `super-${correlationId}`,
			task_id: `task-${correlationId}`,
			i,
			usage: null,
			correlation_id: correlationId,
			choices: [
				{
					...({ index: 0 } as const),
					finish_reason: finishReason,
					delta: {
						content: "",
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

function createFinalEnvelope({
	toolCalls = [],
	correlationId = CORRELATION_ID,
	appMessageId = `final-${correlationId}`,
	seqId = "100",
	includeToolCalls = true,
}: {
	toolCalls?: unknown
	correlationId?: string
	appMessageId?: string
	seqId?: string
	includeToolCalls?: boolean
} = {}): RawSuperMagicMessageEnvelope {
	const node: SuperMagicConversationMessageV2["super_magic_message"] = {
		role: "assistant",
		topic_id: TOPIC_ID,
		message_id: `node-${appMessageId}`,
		super_message_id:
			correlationId === CORRELATION_ID ? SUPER_MESSAGE_ID : `super-${correlationId}`,
		correlation_id: correlationId,
		content: "",
		reasoning_content: "",
		status: "finished",
		send_timestamp: 1,
	}
	if (includeToolCalls) node.tool_calls = toolCalls

	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-1",
			seq_id: seqId,
			message_id: `server-${seqId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-1",
				send_time: 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// ConversationQueryMessage has not yet been widened to the V2 node at this API boundary.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_ID)
	return store
}

function getProjectedNode(
	store: SuperMagicStore,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedNode | undefined {
	const node = store.getMessageNode(superMessageId)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function getProjectedTools(
	store: SuperMagicStore,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedToolCall[] {
	return (getProjectedNode(store, superMessageId)?.tool_calls ?? []).filter(
		(tool): tool is ProjectedToolCall => Boolean(tool && typeof tool === "object"),
	)
}

function getStreamTools(
	store: SuperMagicStore,
	correlationId = CORRELATION_ID,
): ProjectedToolCall[] {
	return getStreamToolSlots(store, correlationId).filter((tool): tool is ProjectedToolCall =>
		Boolean(tool && typeof tool === "object"),
	)
}

function getStreamToolSlots(
	store: SuperMagicStore,
	correlationId = CORRELATION_ID,
): Array<ProjectedToolCall | undefined> {
	return store.getStreamState(TOPIC_ID, correlationId)?.tool_calls ?? []
}

function getArguments(tool: ProjectedToolCall | undefined): string | undefined {
	return tool?.function?.arguments
}

function getCorrelationMessages(
	store: SuperMagicStore,
	correlationId = CORRELATION_ID,
): StoredAssistantMessage[] {
	return Array.from(store.messages.get(TOPIC_ID) ?? []).filter((message) => {
		const candidate = message as StoredAssistantMessage
		return candidate.role === "assistant" && candidate.correlation_id === correlationId
	}) as StoredAssistantMessage[]
}

function expectSingleFinalMessage(
	store: SuperMagicStore,
	{
		correlationId = CORRELATION_ID,
		appMessageId = `final-${correlationId}`,
		seqId = "100",
	}: {
		correlationId?: string
		appMessageId?: string
		seqId?: string
	} = {},
): void {
	const messages = getCorrelationMessages(store, correlationId)
	expect(messages).toHaveLength(1)
	expect(messages[0]).toMatchObject({
		app_message_id: appMessageId,
		correlation_id: correlationId,
		role: "assistant",
		topic_id: TOPIC_ID,
		seq_id: seqId,
	})
}

function settleRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function enqueueFinal(
	store: SuperMagicStore,
	toolCalls: unknown,
	options: Omit<Parameters<typeof createFinalEnvelope>[0], "toolCalls"> = {},
): void {
	store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ ...options, toolCalls }))
	settleRendering()
}

describe("SuperMagicStore / Tool call 创建与参数拼接", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("arguments 片段先于工具头到达。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createArgumentsFragment('{"path":"a.txt"}')] }),
		)
		expect(getStreamTools(store)).toEqual([])

		store.receiveChunk(createChunk({ i: 0, toolCalls: [createToolCall()] }))

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]).toMatchObject({
			id: "tool-1",
			function: { name: "read_file", arguments: '{"path":"a.txt"}' },
		})
	})

	it("工具头到达，但缺少 tool call id。", () => {
		const store = createStore()
		const anonymousHeader = protocolToolCall({
			index: 0,
			type: "function",
			function: { name: "read_file", arguments: "" },
		})

		store.receiveChunk(createChunk({ toolCalls: [anonymousHeader] }))

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]?.id).toBeUndefined()
		expect(getStreamTools(store)[0]?.id).not.toBe("0")
	})

	it("工具头到达，但缺少 `function.name`。", () => {
		const store = createStore()
		const missingName = protocolToolCall({
			id: "tool-1",
			index: 0,
			type: "function",
			function: { arguments: '{"path":"a.txt"}' },
		})

		store.receiveChunk(createChunk({ toolCalls: [missingName] }))
		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]).toMatchObject({ id: "tool-1" })
		expect(getStreamTools(store)[0]?.function?.name || "").toBe("")

		enqueueFinal(store, [createFinalToolCall({ arguments: '{"path":"a.txt"}' })])

		expect(getProjectedTools(store)).toEqual([
			expect.objectContaining({
				id: "tool-1",
				function: expect.objectContaining({ name: "read_file" }),
			}),
		])
		expectSingleFinalMessage(store)
	})

	it("工具头只有 id，没有 function。", () => {
		const store = createStore()
		const missingFunction = protocolToolCall({ id: "tool-1", index: 0, type: "function" })

		expect(() =>
			store.receiveChunk(createChunk({ toolCalls: [missingFunction] })),
		).not.toThrow()
		expect(getStreamTools(store)).toEqual([])
		expect(getProjectedTools(store)).toEqual([])
		expect(getCorrelationMessages(store)).toEqual([])

		enqueueFinal(store, [createFinalToolCall({ arguments: "{}" })])

		expect(getProjectedTools(store)[0]).toMatchObject({
			id: "tool-1",
			function: { name: "read_file", arguments: "{}" },
		})
		expectSingleFinalMessage(store)
	})

	it("arguments chunk 缺少 id 和 name，仅有 index。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, toolCalls: [createToolCall()] }))
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createArgumentsFragment('{"path":"a.txt"}')] }),
		)

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"a.txt"}')
	})

	it("arguments chunk 缺少 index，但提供 id 时按 id 绑定。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0, arguments: '{"a":"' }),
					createToolCall({ id: "tool-b", index: 1, arguments: '{"b":"' }),
				],
			}),
		)
		const missingIndex = protocolToolCall({
			id: "tool-b",
			type: "function",
			function: { arguments: 'value"}' },
		})

		expect(() =>
			store.receiveChunk(createChunk({ i: 1, toolCalls: [missingIndex] })),
		).not.toThrow()

		expect
			.soft(getArguments(getStreamTools(store).find((tool) => tool.id === "tool-a")))
			.toBe('{"a":"')
		expect
			.soft(getArguments(getStreamTools(store).find((tool) => tool.id === "tool-b")))
			.toBe('{"b":"value"}')
	})

	it("arguments chunk 同时缺少 index 和 id 时丢弃且不污染已有工具。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0, arguments: '{"a":"old"}' }),
					createToolCall({ id: "tool-b", index: 1, arguments: '{"b":"old"}' }),
				],
			}),
		)
		const missingIdentity = protocolToolCall({
			type: "function",
			function: { arguments: "should-not-bind" },
		})

		expect(() =>
			store.receiveChunk(createChunk({ i: 1, toolCalls: [missingIdentity] })),
		).not.toThrow()

		expect
			.soft(getArguments(getStreamTools(store).find((tool) => tool.id === "tool-a")))
			.toBe('{"a":"old"}')
		expect
			.soft(getArguments(getStreamTools(store).find((tool) => tool.id === "tool-b")))
			.toBe('{"b":"old"}')
	})

	it("arguments 不是字符串时忽略并保留旧值。", () => {
		const store = createStore()
		const objectArguments = protocolToolCall({
			index: 0,
			type: "function",
			function: { arguments: { path: "a.txt" } },
		})

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"old.txt"}' })],
			}),
		)
		expect(() =>
			store.receiveChunk(createChunk({ i: 1, toolCalls: [objectArguments] })),
		).not.toThrow()
		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"old.txt"}')
	})

	it("arguments 为 `null` 时忽略并保留旧值。", () => {
		const store = createStore()
		const nullArguments = protocolToolCall({
			index: 0,
			type: "function",
			function: { arguments: null },
		})

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"old.txt"}' })],
			}),
		)
		expect(() =>
			store.receiveChunk(createChunk({ i: 1, toolCalls: [nullArguments] })),
		).not.toThrow()
		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"old.txt"}')
	})

	it("streamed arguments 为空字符串时 no-op，Final 空字符串仍权威。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"old.txt"}' })],
			}),
		)
		store.receiveChunk(createChunk({ i: 1, toolCalls: [createArgumentsFragment("")] }))

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"old.txt"}')

		enqueueFinal(store, [createFinalToolCall({ arguments: "" })])
		expect(getArguments(getProjectedTools(store)[0])).toBe("")
		expectSingleFinalMessage(store)
	})

	it("arguments 片段丢包。", () => {
		const store = createStore()
		const canonicalArguments = '{"path":"a.txt"}'

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ arguments: '{"path":"' })] }),
		)
		store.receiveChunk(createChunk({ i: 2, toolCalls: [createArgumentsFragment('txt"}')] }))
		enqueueFinal(store, [createFinalToolCall({ arguments: canonicalArguments })])

		expect(getArguments(getProjectedTools(store)[0])).toBe(canonicalArguments)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("arguments 片段重复。", () => {
		const store = createStore()
		const fragment = createChunk({ i: 1, toolCalls: [createArgumentsFragment('a.txt"}')] })

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ arguments: '{"path":"' })] }),
		)
		store.receiveChunk(fragment)
		store.receiveChunk(cloneFixture(fragment))

		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"a.txt"}')
	})

	it("arguments 片段乱序。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ arguments: '{"path":"' })] }),
		)
		store.receiveChunk(createChunk({ i: 2, toolCalls: [createArgumentsFragment('txt"}')] }))
		store.receiveChunk(createChunk({ i: 1, toolCalls: [createArgumentsFragment("a.")] }))

		expect(getArguments(getStreamTools(store)[0])).toBe('{"path":"a.txt"}')
	})

	it("arguments 重复拼接后仍然是合法 JSON，但业务值错误。", () => {
		const store = createStore()
		const canonicalArguments = '{"path":"a.txt"}'

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"a.txta.txt"}' })],
			}),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: canonicalArguments })])

		expect(getArguments(getProjectedTools(store)[0])).toBe(canonicalArguments)
	})

	it("arguments 重复拼接后变成非法 JSON。", () => {
		const store = createStore()
		const canonicalArguments = '{"path":"a.txt"}'

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ arguments: canonicalArguments })] }),
		)
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createArgumentsFragment(canonicalArguments)] }),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: canonicalArguments })])

		expect(getArguments(getProjectedTools(store)[0])).toBe(canonicalArguments)
	})

	it("arguments 最终只有半个 JSON。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"a' })],
				finishReason: "tool_calls",
			}),
		)
		settleRendering(100)

		expect(getStreamToolSlots(store)).toEqual([])
		expect(getArguments(getProjectedTools(store)[0])).toBe('{"path":"a')
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("final arguments 比流式 arguments 更短。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ arguments: '{"path":"alphabetical.txt"}' })],
			}),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: '{"path":"a.txt"}' })])

		expect(getArguments(getProjectedTools(store)[0])).toBe('{"path":"a.txt"}')
	})

	it("final arguments 与流式 arguments 长度相同但内容不同。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ toolCalls: [createToolCall({ arguments: '{"path":"a.txt"}' })] }),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: '{"path":"b.txt"}' })])

		expect(getArguments(getProjectedTools(store)[0])).toBe('{"path":"b.txt"}')
	})

	it("流式 arguments 比 canonical Final 更长时整体替换。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ toolCalls: [createToolCall({ arguments: '{"path":"too-long.txt"}' })] }),
		)
		settleRendering(500)
		enqueueFinal(store, [createFinalToolCall({ arguments: "{}" })])

		expect(getArguments(getProjectedTools(store)[0])).toBe("{}")
		expectSingleFinalMessage(store)
	})

	it("当前 arguments 不是 final arguments 的前缀。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ toolCalls: [createToolCall({ arguments: '{"path":"wrong"}' })] }),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: '{"path":"right"}' })])

		expect(getArguments(getProjectedTools(store)[0])).toBe('{"path":"right"}')
	})

	it("final arguments 是空对象，但流式 arguments 非空。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ toolCalls: [createToolCall({ arguments: '{"path":"a.txt"}' })] }),
		)
		enqueueFinal(store, [createFinalToolCall({ arguments: "{}" })])

		expect(getArguments(getProjectedTools(store)[0])).toBe("{}")
	})

	it("final assistant 缺少 arguments。", () => {
		const store = createStore()
		const finalWithoutArguments: ProjectedToolCall = {
			id: "tool-1",
			type: "function",
			function: { name: "read_file" },
		}

		store.receiveChunk(
			createChunk({ toolCalls: [createToolCall({ arguments: '{"path":"a.txt"}' })] }),
		)
		enqueueFinal(store, [finalWithoutArguments])

		expect(getArguments(getProjectedTools(store)[0])).toBe('{"path":"a.txt"}')
		expectSingleFinalMessage(store)
	})

	it("Final 真实 tool id 缺少 arguments 时不继承匿名 index 槽位。", () => {
		const store = createStore()
		const anonymousArguments = '{"path":"anonymous-only.txt"}'
		const finalWithoutArguments: ProjectedToolCall = {
			id: "real-tool",
			type: "function",
			function: { name: "read_file" },
		}

		store.receiveChunk(
			createChunk({ toolCalls: [createArgumentsFragment(anonymousArguments, 0)] }),
		)
		enqueueFinal(store, [finalWithoutArguments])

		expect(getProjectedTools(store)).toHaveLength(1)
		expect(getProjectedTools(store)[0]).toMatchObject({
			id: "real-tool",
			function: { name: "read_file", arguments: "" },
		})
		expect(getArguments(getProjectedTools(store)[0])).not.toBe(anonymousArguments)
		expectSingleFinalMessage(store)
	})

	it("一个 chunk 内包含多个 tool call。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [
					createToolCall({ id: "tool-a", name: "search", index: 0, arguments: "{}" }),
					createToolCall({ id: "tool-b", name: "read_file", index: 1, arguments: "{}" }),
				],
			}),
		)

		expect(getStreamTools(store).map((tool) => tool.id)).toEqual(["tool-a", "tool-b"])
	})

	it("多个 tool call 的 arguments 在不同 chunk 中交错到达。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0, arguments: '{"q":"' }),
					createToolCall({ id: "tool-b", index: 1, arguments: '{"path":"' }),
				],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				toolCalls: [
					createArgumentsFragment("hello", 0),
					createArgumentsFragment("a.txt", 1),
				],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 2,
				toolCalls: [createArgumentsFragment('"}', 1), createArgumentsFragment('"}', 0)],
			}),
		)

		expect(getArguments(getStreamTools(store)[0])).toBe('{"q":"hello"}')
		expect(getArguments(getStreamTools(store)[1])).toBe('{"path":"a.txt"}')
	})

	it("tool index 出现空洞，例如直接收到 index 2。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "tool-2", index: 2, arguments: "{}" })],
			}),
		)

		const slots = getStreamToolSlots(store)
		expect(slots).toHaveLength(3)
		expect(slots[0]).toBeUndefined()
		expect(slots[1]).toBeUndefined()
		expect(slots[2]).toMatchObject({ id: "tool-2", index: 2 })
		expect(getStreamTools(store)).toEqual([expect.objectContaining({ id: "tool-2", index: 2 })])
	})

	it("index 0 的工具头丢失，只收到 index 1。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "tool-1", index: 1, arguments: "{}" })],
			}),
		)

		const slots = getStreamToolSlots(store)
		expect(slots).toHaveLength(2)
		expect(slots[0]).toBeUndefined()
		expect(slots[1]).toMatchObject({ id: "tool-1", index: 1 })
		expect(getStreamTools(store).map((tool) => tool.id)).toEqual(["tool-1"])
		expect(getStreamTools(store).some((tool) => tool.id === "0")).toBe(false)
	})

	it("同一 index 收到新 id 时流式保留首个工具，Final 再权威覆盖。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ id: "tool-a", index: 0 })] }),
		)
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createToolCall({ id: "tool-b", index: 0 })] }),
		)

		expect
			.soft(getStreamTools(store))
			.toEqual([expect.objectContaining({ id: "tool-a", index: 0 })])

		enqueueFinal(store, [createFinalToolCall({ id: "tool-b", arguments: "{}" })])

		expect(getProjectedTools(store).map((tool) => tool.id)).toEqual(["tool-b"])
		expectSingleFinalMessage(store)
	})

	it("同一个 tool id 在后续 chunk 中改变 index。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ id: "tool-a", index: 0 })] }),
		)
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createToolCall({ id: "tool-a", index: 2 })] }),
		)

		const slots = getStreamToolSlots(store)
		expect.soft(slots[0]).toBeUndefined()
		expect.soft(slots[2]).toMatchObject({ id: "tool-a", index: 2 })
		expect.soft(getStreamTools(store).filter((tool) => tool.id === "tool-a")).toHaveLength(1)
	})

	it("同一个 tool id 在后续 chunk 中改变 name。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ id: "tool-a", name: "search" })] }),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				toolCalls: [createToolCall({ id: "tool-a", name: "write_file" })],
			}),
		)

		expect(getStreamTools(store)[0]?.function?.name).toBe("write_file")

		enqueueFinal(store, [createFinalToolCall({ id: "tool-a", name: "read_file" })])

		expect(getProjectedTools(store)[0]?.function?.name).toBe("read_file")
		expectSingleFinalMessage(store)
	})

	it("同 Topic 已建立关联的 tool.id 不得再关联到其他 correlation。", () => {
		const store = createStore()
		const firstCorrelation = "correlation-a"
		const secondCorrelation = "correlation-b"

		store.receiveChunk(
			createChunk({
				correlationId: firstCorrelation,
				toolCalls: [createToolCall({ id: "shared-tool", arguments: '{"value":"A"' })],
			}),
		)
		store.receiveChunk(
			createChunk({
				correlationId: secondCorrelation,
				toolCalls: [createToolCall({ id: "shared-tool", arguments: '{"value":"B"}' })],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				correlationId: secondCorrelation,
				toolCalls: [createToolCall({ id: "shared-tool" })],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				correlationId: firstCorrelation,
				toolCalls: [createArgumentsFragment("}")],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 2,
				correlationId: secondCorrelation,
				toolCalls: [createToolCall({ id: "tool-b", arguments: '{"value":"B"}' })],
			}),
		)

		expect(getArguments(getStreamTools(store, firstCorrelation)[0])).toBe('{"value":"A"}')
		expect(getStreamTools(store, secondCorrelation).map((tool) => tool.id)).toEqual(["tool-b"])
	})

	it("未进入 canonical 的 malformed tool id 不得抢占 Topic owner。", () => {
		const store = createStore()
		const malformedCorrelation = "correlation-malformed"
		const validCorrelation = "correlation-valid"

		store.receiveChunk(
			createChunk({
				correlationId: malformedCorrelation,
				toolCalls: [
					protocolToolCall({
						id: "shared-tool",
						type: "function",
						function: { name: "read_file", arguments: "{}" },
					}),
				],
			}),
		)
		store.receiveChunk(
			createChunk({
				correlationId: validCorrelation,
				toolCalls: [createToolCall({ id: "shared-tool", arguments: "{}" })],
			}),
		)

		expect(getStreamTools(store, malformedCorrelation)).toEqual([])
		expect(getStreamTools(store, validCorrelation)).toEqual([
			expect.objectContaining({ id: "shared-tool" }),
		])
	})

	it("工具头重复到达。", () => {
		const store = createStore()
		const header = createToolCall({ id: "tool-a" })

		store.receiveChunk(createChunk({ i: 0, toolCalls: [header] }))
		store.receiveChunk(createChunk({ i: 1, toolCalls: [cloneFixture(header)] }))

		expect(getStreamTools(store).filter((tool) => tool.id === "tool-a")).toHaveLength(1)
	})

	it("重复工具头内容完全相同。", () => {
		const store = createStore()
		const headerChunk = createChunk({ toolCalls: [createToolCall({ id: "tool-a" })] })

		store.receiveChunk(headerChunk)
		store.receiveChunk(cloneFixture(headerChunk))

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]?.id).toBe("tool-a")
	})

	it("重复工具头的空 name 不覆盖同 id 已有非空 name。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createToolCall({ id: "tool-a", name: "search" })] }),
		)
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createToolCall({ id: "tool-a", name: "" })] }),
		)

		expect.soft(getStreamTools(store)).toHaveLength(1)
		expect.soft(getStreamTools(store)[0]?.function?.name).toBe("search")

		enqueueFinal(store, [createFinalToolCall({ id: "tool-a", name: "read_file" })])

		expect(getProjectedTools(store)).toHaveLength(1)
		expect(getProjectedTools(store)[0]?.function?.name).toBe("read_file")
		expectSingleFinalMessage(store)
	})

	it("arguments-first 匿名 index 槽位在合法工具头到达后原位升级。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ i: 0, toolCalls: [createArgumentsFragment('{"path":"a.txt"}')] }),
		)
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createToolCall({ id: "real-tool", index: 0 })] }),
		)

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]).toMatchObject({
			id: "real-tool",
			function: { arguments: '{"path":"a.txt"}' },
		})
	})

	it("Final 合法工具替换匿名槽位且不产生重复 canonical 工具。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ toolCalls: [createArgumentsFragment('{"path":"a.txt"}')] }),
		)
		enqueueFinal(store, [
			createFinalToolCall({ id: "real-tool", arguments: '{"path":"a.txt"}' }),
		])

		expect(getProjectedTools(store)).toHaveLength(1)
		expect(getProjectedTools(store)[0]?.id).toBe("real-tool")
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expectSingleFinalMessage(store)
	})

	it("Final canonical projection 清除流式空洞，并按 Final 位置重建 index。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createArgumentsFragment("{}", 2)] }))
		enqueueFinal(store, [createFinalToolCall({ id: "valid-tool", arguments: "{}" })])

		expect(getProjectedTools(store)).toEqual([
			expect.objectContaining({ id: "valid-tool", index: 0 }),
		])
		expectSingleFinalMessage(store)
	})

	it("Store 不为匿名工具生成伪造 id。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createArgumentsFragment("{}", 0)] }))
		settleRendering(100)

		const streamedTools = getStreamTools(store)
		expect(streamedTools).toHaveLength(1)
		expect(streamedTools.every((tool) => tool.id === undefined)).toBe(true)
		expect(streamedTools.some((tool) => typeof tool.id === "string")).toBe(false)
		expect(getProjectedTools(store)).toEqual([])
		expect(getCorrelationMessages(store)).toEqual([])
	})

	it("匿名槽位在真实工具头到达后升级为真实 id。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, toolCalls: [createArgumentsFragment("{}", 0)] }))
		store.receiveChunk(
			createChunk({ i: 1, toolCalls: [createToolCall({ id: "real-tool", index: 0 })] }),
		)

		expect(getStreamTools(store)).toHaveLength(1)
		expect(getStreamTools(store)[0]?.id).toBe("real-tool")
	})

	it("Final 数组顺序覆盖流式首现顺序并重建 canonical index。", () => {
		const store = createStore()
		const streamToolA = createToolCall({ id: "tool-a", index: 0 })
		const streamToolB = createToolCall({ id: "tool-b", index: 1 })
		const streamToolC = createToolCall({ id: "tool-c", index: 2 })

		store.receiveChunk(createChunk({ i: 0, toolCalls: [streamToolA] }))
		store.receiveChunk(createChunk({ i: 1, toolCalls: [streamToolB] }))
		store.receiveChunk(createChunk({ i: 2, toolCalls: [streamToolC] }))
		enqueueFinal(store, [
			createFinalToolCall({ id: "tool-c" }),
			createFinalToolCall({ id: "tool-a" }),
			createFinalToolCall({ id: "tool-b" }),
		])

		expect.soft(getProjectedTools(store).map(({ id, index }) => ({ id, index }))).toEqual([
			{ id: "tool-c", index: 0 },
			{ id: "tool-a", index: 1 },
			{ id: "tool-b", index: 2 },
		])
		expectSingleFinalMessage(store)
	})

	it("final tool call 数量比流式阶段多。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ id: "tool-a" })] }))
		enqueueFinal(store, [
			createFinalToolCall({ id: "tool-a" }),
			createFinalToolCall({ id: "tool-b" }),
		])

		expect(getProjectedTools(store).map((tool) => tool.id)).toEqual(["tool-a", "tool-b"])
		expectSingleFinalMessage(store)
	})

	it("final tool call 数量比流式阶段少。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0 }),
					createToolCall({ id: "tool-b", index: 1 }),
				],
			}),
		)
		enqueueFinal(store, [createFinalToolCall({ id: "tool-a" })])

		expect(getProjectedTools(store).map((tool) => tool.id)).toEqual(["tool-a"])
		expectSingleFinalMessage(store)
	})

	it("final message 显式 tool_calls=[] 时清空流式阶段工具。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createToolCall()] }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ toolCalls: [] }))
		settleRendering()

		expect(getProjectedTools(store)).toEqual([])
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expectSingleFinalMessage(store)
	})

	it("final message 新增了流式阶段从未出现的工具。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ id: "tool-a" })] }))
		enqueueFinal(store, [
			createFinalToolCall({ id: "tool-a" }),
			createFinalToolCall({ id: "tool-new" }),
		])

		expect(getProjectedTools(store).map((tool) => tool.id)).toContain("tool-new")
		expectSingleFinalMessage(store)
	})

	it("final message 删除了流式阶段出现的工具。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0 }),
					createToolCall({ id: "tool-deleted", index: 1 }),
				],
			}),
		)
		enqueueFinal(store, [createFinalToolCall({ id: "tool-a" })])

		expect(getProjectedTools(store).map((tool) => tool.id)).not.toContain("tool-deleted")
		expectSingleFinalMessage(store)
	})

	it("final message 包含重复 tool id 时末项胜出并记录日志。", () => {
		const store = createStore()
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			enqueueFinal(store, [
				createFinalToolCall({ id: "tool-a", arguments: '{"value":1}' }),
				createFinalToolCall({ id: "tool-a", arguments: '{"value":2}' }),
			])

			expect.soft(getProjectedTools(store)).toEqual([
				expect.objectContaining({
					id: "tool-a",
					index: 0,
					function: expect.objectContaining({ arguments: '{"value":2}' }),
				}),
			])
			expect.soft(consoleWarn).toHaveBeenCalledWith(
				"[SuperMagicStore] duplicate final tool call id",
				expect.objectContaining({
					toolCallId: "tool-a",
					previousIndex: 0,
					incomingIndex: 1,
					resolution: "last-write-wins",
				}),
			)
			expect.soft(consoleWarn).toHaveBeenCalledTimes(1)
			expectSingleFinalMessage(store)
		} finally {
			consoleWarn.mockRestore()
		}
	})

	it("MCP tool call 保持 function type，并保留 MCP sentinel。", () => {
		const store = createStore()

		enqueueFinal(store, [
			createFinalToolCall({
				id: "tool-mcp",
				type: "function",
				name: "call_tool",
				arguments: '{"name":"mcp.browser.search"}',
				tool: {
					id: "tool-mcp",
					name: "mcp_tool_call",
					status: "running",
				},
			}),
		])

		expect(getProjectedTools(store)[0]).toMatchObject({
			id: "tool-mcp",
			type: "function",
			function: { name: "call_tool" },
			tool: { name: "mcp_tool_call" },
		})
		expectSingleFinalMessage(store)
	})

	it("`function` 意外为数组而不是对象。", () => {
		const store = createStore()
		const arrayFunction = protocolToolCall({
			id: "tool-a",
			index: 0,
			type: "function",
			function: [{ name: "read_file", arguments: "{}" }],
		})

		expect(() => store.receiveChunk(createChunk({ toolCalls: [arrayFunction] }))).not.toThrow()
		expect(getStreamTools(store)).toEqual([])
		expect(getProjectedTools(store)).toEqual([])
		expect(getCorrelationMessages(store)).toEqual([])

		enqueueFinal(store, [createFinalToolCall({ id: "tool-a", arguments: "{}" })])
		expect(getProjectedTools(store)[0]).toMatchObject({
			id: "tool-a",
			function: { name: "read_file", arguments: "{}" },
		})
		expectSingleFinalMessage(store)
	})

	it("单个超大工具参数在 Store 中不截断。", () => {
		const store = createStore()
		const html = `<html><body>${"x".repeat(250_000)}</body></html>`

		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ arguments: html })] }))

		expect(getArguments(getStreamTools(store)[0])).toBe(html)
		expect(getStreamTools(store)).toHaveLength(1)
	})

	it("多个超大工具参数同时流式时保持内容隔离。", () => {
		const store = createStore()
		const firstArguments = `{"html":"${"a".repeat(150_000)}"}`
		const secondArguments = `{"html":"${"b".repeat(150_000)}"}`

		store.receiveChunk(
			createChunk({
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0, arguments: firstArguments }),
					createToolCall({ id: "tool-b", index: 1, arguments: secondArguments }),
				],
			}),
		)

		expect(getStreamTools(store)).toHaveLength(2)
		expect(getArguments(getStreamTools(store)[0])).toBe(firstArguments)
		expect(getArguments(getStreamTools(store)[1])).toBe(secondArguments)
	})
})
