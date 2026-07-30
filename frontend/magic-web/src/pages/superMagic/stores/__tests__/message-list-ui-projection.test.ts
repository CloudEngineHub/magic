import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import {
	getMessageNodeKey,
	messagesConverter,
} from "@/pages/superMagic/components/MessageList/helpers"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	RawSuperMagicMessageEnvelope,
	ToolCall,
	ToolResponseState,
} from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_A = "topic-a"
const TOPIC_B = "topic-b"
const CORRELATION_ID = "correlation-ui"
const SUPER_MESSAGE_ID = "super-message-ui"
const SETTLE_MS = 2_000
const RECOVERY_MS = 5_100

interface ProjectedToolCall {
	id?: string
	type?: string
	index?: number
	function?: {
		name?: string
		arguments?: string
	}
	tool?: ToolResponseState
}

interface ProjectedNode {
	app_message_id?: string
	super_message_id?: string
	role?: string
	content?: string | null
	correlation_id?: string
	status?: string
	tool_call_id?: string
	tool_calls?: ProjectedToolCall[] | null
	tool?: ToolResponseState | null
}

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]

function createToolCall({
	id = "tool-1",
	index = 0,
	name = "read_file",
	arguments: argumentsValue = "{}",
	tool,
}: {
	id?: string
	index?: number
	name?: string
	arguments?: string
	tool?: ToolResponseState
} = {}): ToolCall {
	return {
		id,
		index,
		type: "function",
		function: {
			name,
			arguments: argumentsValue,
		},
		...(tool ? { tool } : {}),
	}
}

function createAnonymousTool(index = 0, argumentsValue = "{}"): ToolCall {
	const tool = createToolCall({ index, arguments: argumentsValue }) as Partial<ToolCall>
	delete tool.id
	if (tool.function) delete tool.function.name
	return tool as ToolCall
}

function createChunk({
	topicId = TOPIC_A,
	correlationId = CORRELATION_ID,
	superMessageId = SUPER_MESSAGE_ID,
	i = 0,
	content = "",
	toolCalls = [],
	finishReason = null,
}: {
	topicId?: string
	correlationId?: string
	superMessageId?: string
	i?: number
	content?: string
	toolCalls?: ToolCall[]
	finishReason?: ChunkChoice["finish_reason"]
} = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${topicId}-${correlationId}-${i}`,
		app_message_id: `chunk-${topicId}-${correlationId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${correlationId}`,
		super_magic_chunk: {
			super_message_id: superMessageId,
			task_id: `task-${correlationId}`,
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

function createEnvelope({
	topicId = TOPIC_A,
	appMessageId = "assistant-app",
	correlationId = CORRELATION_ID,
	superMessageId,
	seqId = "100",
	role = "assistant",
	content = "",
	outerStatus = ConversationMessageStatus.Read,
	nodeStatus = "finished",
	toolCalls = [],
	tool,
	toolCallId,
}: {
	topicId?: string
	appMessageId?: string
	correlationId?: string
	superMessageId?: string
	seqId?: string
	role?: "assistant" | "user" | "tool"
	content?: string
	outerStatus?: ConversationMessageStatus
	nodeStatus?: string
	toolCalls?: ToolCall[]
	tool?: ToolResponseState | null
	toolCallId?: string
} = {}): RawSuperMagicMessageEnvelope {
	const resolvedSuperMessageId =
		role === "user"
			? appMessageId
			: superMessageId || (role === "assistant" ? SUPER_MESSAGE_ID : `super-${appMessageId}`)
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
				sender_id: role === "user" ? "user-1" : "assistant-1",
				send_time: Number(seqId) || 1,
				status: outerStatus,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role,
					topic_id: topicId,
					message_id: `node-${appMessageId}`,
					super_message_id: resolvedSuperMessageId,
					correlation_id: correlationId,
					content,
					status: nodeStatus,
					send_timestamp: Number(seqId) || 1,
					tool_calls: toolCalls,
					...(toolCallId ? { tool_call_id: toolCallId } : {}),
					...(tool !== undefined ? { tool } : {}),
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// RawSuperMagicMessageEnvelope has not yet included the V2 conversation variant.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(topicId = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(topicId)
	return store
}

function getNode(
	store: SuperMagicStore,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedNode | undefined {
	const directNode = store.getMessageNode(superMessageId)
	const node = directNode
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function getEffectiveToolStatus(
	store: SuperMagicStore,
	toolId = "tool-1",
	topicId = TOPIC_A,
): string | undefined {
	// Match ToolCall.tsx: the canonical response map wins while the Assistant snapshot remains raw history.
	const embeddedStatus = getNode(store)?.tool_calls?.find((tool) => tool.id === toolId)?.tool
		?.status
	return store.toolResponseMap.get(topicId)?.get(toolId)?.status ?? embeddedStatus
}

function getStoredAssistantDebugToolCalls(store: SuperMagicStore): unknown[] | undefined {
	const storedMessage = store.messages
		.get(TOPIC_A)
		?.find(
			(message) =>
				message.role === "assistant" && message.super_message_id === SUPER_MESSAGE_ID,
		)
	return (storedMessage?.debug as { tool_calls?: unknown[] } | undefined)?.tool_calls
}

function getAssistantCards(
	store: SuperMagicStore,
	topicId = TOPIC_A,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedNode[] {
	const records = Array.from(store.messages.get(topicId) ?? []) as Array<Record<string, unknown>>
	return messagesConverter(records).filter(
		(message) => message.role === "assistant" && message.super_message_id === superMessageId,
	) as ProjectedNode[]
}

function getRenderableToolIds(node: ProjectedNode | undefined): string[] {
	return (node?.tool_calls ?? [])
		.filter(
			(tool) =>
				typeof tool.id === "string" &&
				tool.id.length > 0 &&
				typeof tool.function?.name === "string" &&
				tool.function.name.length > 0,
		)
		.map((tool) => tool.id as string)
}

function getCanonicalNodeForCard(
	store: SuperMagicStore,
	card: ProjectedNode | undefined,
): ProjectedNode | undefined {
	// MessageList cards carry identity; canonical tools are resolved through the public Store API.
	const identity = card?.super_message_id
	return typeof identity === "string" ? getNode(store, identity) : undefined
}

function settle(milliseconds = SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function enqueueAssistant(
	store: SuperMagicStore,
	options: Parameters<typeof createEnvelope>[0] = {},
): void {
	const topicId = options.topicId ?? TOPIC_A
	store.enqueueMessage(topicId, createEnvelope(options))
	settle()
}

describe("SuperMagicStore / MessageList 和 UI 投影", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it("UI projection 不渲染缺少 id 的匿名工具。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ toolCalls: [createAnonymousTool()] }))

		expect(getNode(store)?.tool_calls ?? []).toHaveLength(0)
		expect(getAssistantCards(store).flatMap(getRenderableToolIds)).toEqual([])

		enqueueAssistant(store, { toolCalls: [createToolCall()] })
		expect(getNode(store)?.tool_calls).toEqual([expect.objectContaining({ id: "tool-1" })])
		const cards = getAssistantCards(store)
		expect(cards).toHaveLength(1)
		expect(getRenderableToolIds(getCanonicalNodeForCard(store, cards[0]))).toEqual(["tool-1"])
		expect(getMessageNodeKey(cards[0])).toBe(SUPER_MESSAGE_ID)
	})

	it("多个匿名工具不会产生重复 UI key。", () => {
		const store = createStore()
		store.receiveChunk(
			createChunk({ toolCalls: [createAnonymousTool(0), createAnonymousTool(1)] }),
		)

		expect(getNode(store)?.tool_calls ?? []).toHaveLength(0)

		enqueueAssistant(store, {
			toolCalls: [
				createToolCall({ id: "tool-a", index: 0 }),
				createToolCall({ id: "tool-b", index: 1 }),
			],
		})
		const ids = getNode(store)?.tool_calls?.map((tool) => tool.id)
		expect(ids).toEqual(["tool-a", "tool-b"])
		expect(new Set(ids).size).toBe(2)
		const cards = getAssistantCards(store)
		expect(cards).toHaveLength(1)
		expect(getRenderableToolIds(getCanonicalNodeForCard(store, cards[0]))).toEqual([
			"tool-a",
			"tool-b",
		])
		expect(getMessageNodeKey(cards[0])).toBe(SUPER_MESSAGE_ID)
	})

	it("匿名槽位升级真实 id 后 UI 卡片保持 super_message_id key。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ toolCalls: [createAnonymousTool(0, '{"path":"a"}')] }))
		enqueueAssistant(store, {
			toolCalls: [createToolCall({ id: "real-tool", arguments: '{"path":"a"}' })],
		})

		expect(getNode(store)?.tool_calls).toHaveLength(1)
		expect(getNode(store)?.tool_calls?.[0]).toMatchObject({ id: "real-tool", index: 0 })
		const cards = getAssistantCards(store)
		expect(cards).toHaveLength(1)
		expect(getRenderableToolIds(getCanonicalNodeForCard(store, cards[0]))).toEqual([
			"real-tool",
		])
		expect(getMessageNodeKey(cards[0])).toBe(SUPER_MESSAGE_ID)
	})

	it("tool_calls 包含稀疏数组空洞。", () => {
		const store = createStore()
		const sparseTools = [
			createToolCall({ id: "tool-a", index: 0 }),
			undefined,
			createToolCall({ id: "tool-c", index: 2 }),
		] as unknown as ToolCall[]

		enqueueAssistant(store, { toolCalls: sparseTools })

		expect(getNode(store)?.tool_calls?.map((tool) => tool.id)).toEqual(["tool-a", "tool-c"])
	})

	it("tool_calls 同时存在匿名工具和合法工具。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			toolCalls: [createAnonymousTool(), createToolCall({ id: "valid-tool", index: 1 })],
		})

		expect(getNode(store)?.tool_calls).toEqual([expect.objectContaining({ id: "valid-tool" })])
	})

	it("合法工具已 finished，但匿名工具仍显示 spinner。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			toolCalls: [
				createAnonymousTool(),
				createToolCall({
					id: "finished-tool",
					index: 1,
					tool: { id: "finished-tool", status: "finished" },
				}),
			],
		})

		expect(getNode(store)?.tool_calls).toHaveLength(1)
		expect(getNode(store)?.tool_calls?.[0]).toMatchObject({
			id: "finished-tool",
			tool: { status: "finished" },
		})
	})

	it("toolResponseMap finished 时 UI effective 状态覆盖 embedded running。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			toolCalls: [
				createToolCall({
					tool: { id: "tool-1", status: "running" },
				}),
			],
		})
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "tool-response",
				seqId: "101",
				role: "tool",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished", detail: { type: "text", data: "ok" } },
			}),
		)
		settle()

		expect(getNode(store)?.tool_calls?.[0]?.tool?.status).toBe("running")
		expect(store.toolResponseMap.get(TOPIC_A)?.get("tool-1")?.status).toBe("finished")
		expect(getEffectiveToolStatus(store)).toBe("finished")
	})

	it("tool response 按错误 topicId 查询不到。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			toolCalls: [createToolCall({ tool: { id: "tool-1", status: "running" } })],
		})
		store.enqueueMessage(
			TOPIC_B,
			createEnvelope({
				topicId: TOPIC_B,
				appMessageId: "tool-response-b",
				correlationId: "correlation-b",
				role: "tool",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		settle()

		expect(getNode(store)?.tool_calls?.[0]?.tool?.status).toBe("running")
	})

	it("MessageList 使用 super_message_id 读取 Assistant canonical。", () => {
		const store = createStore()
		enqueueAssistant(store, { appMessageId: "real-app", content: "hello" })

		expect(getNode(store, SUPER_MESSAGE_ID)).toMatchObject({
			app_message_id: "real-app",
			super_message_id: SUPER_MESSAGE_ID,
			correlation_id: CORRELATION_ID,
			content: "hello",
		})
	})

	it("MessageList 卡片保留真实 appMessageId，但逻辑 key 不依赖 app/correlation。", () => {
		const store = createStore()
		enqueueAssistant(store, { appMessageId: "real-app", content: "hello" })

		const [card] = getAssistantCards(store)
		expect(card).toMatchObject({
			app_message_id: "real-app",
			super_message_id: SUPER_MESSAGE_ID,
			correlation_id: CORRELATION_ID,
		})
		expect(getMessageNodeKey(card)).toBe(SUPER_MESSAGE_ID)
	})

	it("`isTopicStreaming()` 因残留 StreamState 永远为 true。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "draft" }))
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)

		enqueueAssistant(store, { content: "final" })
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("`showLoading && !isStreamLoading` 条件导致全局 LoadingMessage 被隐藏。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "draft" }))

		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
		expect(getNode(store)).toMatchObject({ content: expect.stringContaining("d") })

		enqueueAssistant(store, { content: "final" })
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getNode(store)).toMatchObject({ content: "final" })
	})

	it("正文流结束后缺失工具进入弱终态，真实 response 仍可覆盖。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			toolCalls: [createToolCall({ tool: { id: "tool-1", status: "running" } })],
		})

		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getNode(store)?.tool_calls?.[0]?.tool?.status).toBe("running")
		expect(store.toolResponseMap.get(TOPIC_A)?.get("tool-1")?.status).toBe("response_missing")
		expect(getEffectiveToolStatus(store)).toBe("response_missing")

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "tool-done",
				seqId: "101",
				role: "tool",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		settle()

		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getNode(store)?.tool_calls?.[0]?.tool?.status).toBe("running")
		expect(store.toolResponseMap.get(TOPIC_A)?.get("tool-1")?.status).toBe("finished")
		expect(getEffectiveToolStatus(store)).toBe("finished")
	})

	it("tool-role message 因 status 非终态被隐藏。", () => {
		const store = createStore()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "running-tool-message",
				correlationId: "tool-correlation",
				role: "tool",
				nodeStatus: "running",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "running" },
			}),
		)
		settle()

		expect(getNode(store, "super-running-tool-message")).toMatchObject({
			role: "tool",
			tool: { id: "tool-1", status: "running" },
		})
	})

	it("tool-role message 已 finished，但外层消息 status 仍 running。", () => {
		const store = createStore()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "finished-tool-message",
				correlationId: "tool-correlation",
				role: "tool",
				outerStatus: ConversationMessageStatus.Unread,
				nodeStatus: "finished",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		settle()

		expect(getNode(store, "super-finished-tool-message")).toMatchObject({
			tool: { status: "finished" },
		})
	})

	it("工具执行失败但 UI 没有 error 状态。", () => {
		const store = createStore()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "failed-tool",
				correlationId: "failed-tool-correlation",
				role: "tool",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "error", remark: "permission denied" },
			}),
		)
		settle()

		expect(getNode(store, "super-failed-tool")).toMatchObject({
			tool: { status: "error", remark: "permission denied" },
		})
	})

	it.fails("工具名称为空时保留 raw 协议事实，但 canonical/UI 排除并告警。", () => {
		const store = createStore()
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const invalidTool = createToolCall({ name: "" })
		enqueueAssistant(store, { toolCalls: [invalidTool] })

		expect(getStoredAssistantDebugToolCalls(store)).toEqual([invalidTool])
		expect.soft(getNode(store)?.tool_calls ?? []).toEqual([])
		expect(getRenderableToolIds(getNode(store))).toEqual([])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(warn).toHaveBeenCalledWith(
			"[SuperMagicStore] invalid final tool call",
			expect.objectContaining({
				toolCallId: "tool-1",
				incomingIndex: 0,
				reason: "missing-function-name",
				resolution: "exclude-from-canonical-projection",
			}),
		)
	})

	it("工具 action/remark 缺失，只剩 spinner。", () => {
		const store = createStore()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "minimal-tool",
				correlationId: "minimal-tool-correlation",
				role: "tool",
				toolCallId: "tool-1",
				tool: { id: "tool-1", status: "finished" },
			}),
		)
		settle()

		expect(getNode(store, "super-minimal-tool")).toMatchObject({
			tool: { id: "tool-1", status: "finished" },
		})
	})

	it.fails("function 为数组时保留 raw 协议事实，但 canonical/UI 排除并正常结算。", () => {
		const store = createStore()
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const invalidTool = {
			...createToolCall(),
			function: [],
		} as unknown as ToolCall

		enqueueAssistant(store, { toolCalls: [invalidTool] })

		expect(getStoredAssistantDebugToolCalls(store)).toEqual([invalidTool])
		expect.soft(getNode(store)?.tool_calls ?? []).toHaveLength(0)
		expect(getRenderableToolIds(getNode(store))).toEqual([])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(warn).toHaveBeenCalledWith(
			"[SuperMagicStore] invalid final tool call",
			expect.objectContaining({
				toolCallId: "tool-1",
				incomingIndex: 0,
				reason: "invalid-function",
				resolution: "exclude-from-canonical-projection",
			}),
		)
	})

	it("UI 渲染正确，但后台 buffer/content Map 泄漏。", () => {
		const store = createStore()
		const recoveries: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recoveries.push(payload),
		)

		store.receiveChunk(createChunk({ content: "draft" }))
		enqueueAssistant(store, { content: "canonical" })
		vi.advanceTimersByTime(RECOVERY_MS * 2)

		expect(getNode(store)).toMatchObject({ content: "canonical" })
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recoveries).toHaveLength(0)
		unsubscribe()
	})

	it("同一 super_message_id 的 Assistant revision 只投影高 seq 卡片。", () => {
		const store = createStore()
		enqueueAssistant(store, {
			appMessageId: "assistant-old",
			correlationId: "assistant-old-correlation",
			seqId: "100",
			content: "old",
		})
		enqueueAssistant(store, {
			appMessageId: "assistant-new",
			correlationId: "assistant-new-correlation",
			seqId: "101",
			content: "new",
		})

		const canonical = getNode(store, SUPER_MESSAGE_ID)
		expect(canonical).toMatchObject({
			app_message_id: "assistant-new",
			super_message_id: SUPER_MESSAGE_ID,
			correlation_id: "assistant-new-correlation",
			content: "new",
		})
		expect(getAssistantCards(store)).toEqual([
			expect.objectContaining({
				app_message_id: "assistant-new",
				super_message_id: SUPER_MESSAGE_ID,
				correlation_id: "assistant-new-correlation",
			}),
		])
	})

	it("消息排序变化导致 React 卡片重新挂载。", () => {
		const store = createStore()
		const first = createEnvelope({
			appMessageId: "app-1",
			superMessageId: "super-1",
			correlationId: "corr-1",
			seqId: "1",
			content: "one",
		})
		const second = createEnvelope({
			appMessageId: "app-2",
			superMessageId: "super-2",
			correlationId: "corr-2",
			seqId: "2",
			content: "two",
		})

		store.initializeMessages(TOPIC_A, [second, first])
		settle()
		store.initializeMessages(TOPIC_A, [first, second])
		settle()

		expect(getNode(store, "super-1")).toMatchObject({
			app_message_id: "app-1",
			correlation_id: "corr-1",
			content: "one",
		})
		expect(getNode(store, "super-2")).toMatchObject({
			app_message_id: "app-2",
			correlation_id: "corr-2",
			content: "two",
		})
	})

	it("流式过程中 tool_calls 数组被 slice，后续工具短暂消失。", () => {
		const store = createStore()
		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0 }),
					createToolCall({ id: "tool-b", index: 1 }),
				],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				toolCalls: [createAnonymousTool(0, "more")],
			}),
		)

		expect(
			store.getStreamState(TOPIC_A, CORRELATION_ID)?.tool_calls.map((tool) => tool.id),
		).toEqual(["tool-a", "tool-b"])
	})

	it("UI 从两条工具回退到一条工具时组件状态错位。", () => {
		const store = createStore()
		store.receiveChunk(
			createChunk({
				toolCalls: [
					createToolCall({ id: "tool-a", index: 0 }),
					createToolCall({ id: "tool-b", index: 1 }),
				],
			}),
		)
		enqueueAssistant(store, { toolCalls: [createToolCall({ id: "tool-b", index: 0 })] })

		expect(getNode(store)?.tool_calls?.map((tool) => tool.id)).toEqual(["tool-b"])
	})

	it("大型 arguments 在 UI projection 中使用 Final canonical 值。", () => {
		const store = createStore()
		const largeArguments = JSON.stringify({ html: "x".repeat(64 * 1024) })

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ arguments: largeArguments })],
				finishReason: "tool_calls",
			}),
		)
		enqueueAssistant(store, { toolCalls: [createToolCall({ arguments: largeArguments })] })

		expect(getNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(largeArguments)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("自动滚动在永久 streaming 状态下持续触发。", () => {
		const store = createStore()
		const recoveries: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recoveries.push(payload),
		)

		store.receiveChunk(createChunk({ content: "draft" }))
		vi.advanceTimersByTime(RECOVERY_MS)
		expect(recoveries).toHaveLength(1)

		enqueueAssistant(store, { content: "final" })
		vi.advanceTimersByTime(RECOVERY_MS * 2)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recoveries).toHaveLength(1)
		unsubscribe()
	})

	it("用户手动滚动后，幽灵 timer 持续尝试自动滚动。", () => {
		const store = createStore()
		const recoveries: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recoveries.push(payload),
		)

		store.receiveChunk(createChunk({ content: "draft" }))
		enqueueAssistant(store, { content: "final" })
		vi.advanceTimersByTime(60_000)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recoveries).toHaveLength(0)
		unsubscribe()
	})
})
