import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	DomainEventPayload,
	RawSuperMagicMessageEnvelope,
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

const TOPIC_A = "topic-buffer-a"
const TOPIC_B = "topic-buffer-b"
const RENDER_SETTLE_MS = 3_000

interface ProjectedNode {
	role?: string
	status?: string
	content?: string | null
	correlation_id?: string
	tool_call_id?: string
	tool?: {
		id?: string
		status?: string
	}
}

interface EnvelopeOptions {
	topicId?: string
	appMessageId: string
	correlationId: string
	seqId: string
	content?: string
	role?: "assistant" | "tool" | "user"
	status?: string
	event?: string
	toolCallId?: string
}

interface MutableEnvelope {
	type?: unknown
	seq: Record<string, unknown>
}

function createEnvelope({
	topicId = TOPIC_A,
	appMessageId,
	correlationId,
	seqId,
	content = "message",
	role = "assistant",
	status = "finished",
	event,
	toolCallId = "tool-1",
}: EnvelopeOptions): RawSuperMagicMessageEnvelope {
	const node: SuperMagicNode = {
		role,
		topic_id: topicId,
		message_id: `node-${appMessageId}`,
		correlation_id: correlationId,
		content,
		reasoning_content: "",
		status,
		event,
		send_timestamp: Number(seqId.replace(/\D/g, "")) || 1,
	}
	if (role === "tool") {
		node.tool_call_id = toolCallId
		node.tool = {
			id: toolCallId,
			name: "read_file",
			status: "finished",
			detail: { type: "json", data: { ok: true } },
			attachments: [],
		}
	}

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
				sender_id: role === "tool" ? "tool-runner" : "assistant-1",
				send_time: Number(seqId.replace(/\D/g, "")) || 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function cloneEnvelope(envelope: RawSuperMagicMessageEnvelope): RawSuperMagicMessageEnvelope {
	return JSON.parse(JSON.stringify(envelope)) as RawSuperMagicMessageEnvelope
}

function mutateEnvelope(
	envelope: RawSuperMagicMessageEnvelope,
	mutate: (draft: MutableEnvelope) => void,
): RawSuperMagicMessageEnvelope {
	const draft = cloneEnvelope(envelope) as unknown as MutableEnvelope
	mutate(draft)
	return draft as unknown as RawSuperMagicMessageEnvelope
}

function createStore(activeTopicId = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(activeTopicId)
	return store
}

function settleRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function getNode(store: SuperMagicStore, messageId: string): ProjectedNode | undefined {
	const node = store.getMessageNode(messageId)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function collectArrivals(
	store: SuperMagicStore,
	topicId = TOPIC_A,
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

function collectDomainEvents(store: SuperMagicStore): {
	events: DomainEventPayload[]
	unsubscribe: () => void
} {
	const events: DomainEventPayload[] = []
	const unsubscribe = store.registerDomainEventListener({
		callback: (payload) => events.push(payload),
	})
	return { events, unsubscribe }
}

function createFinalOnlyAssistant({
	topicId = TOPIC_A,
	appMessageId = "blocking-assistant",
	correlationId = "blocking-correlation",
	seqId = "1",
}: {
	topicId?: string
	appMessageId?: string
	correlationId?: string
	seqId?: string
} = {}): RawSuperMagicMessageEnvelope {
	return createEnvelope({
		topicId,
		appMessageId,
		correlationId,
		seqId,
		content: "x".repeat(50_000),
		status: "finished",
	})
}

function startBlockingAssistantStream(
	store: SuperMagicStore,
	{
		topicId = TOPIC_A,
		appMessageId = "blocking-assistant",
		correlationId = "blocking-correlation",
		seqId = "1",
		event,
	}: {
		topicId?: string
		appMessageId?: string
		correlationId?: string
		seqId?: string
		event?: string
	} = {},
): void {
	const content = "x".repeat(50_000)
	const createBlockingChunk = (chunkCorrelationId: string): SuperMagicChunkMessage => ({
		magic_message_id: `magic-chunk-${chunkCorrelationId}`,
		app_message_id: `app-chunk-${chunkCorrelationId}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${chunkCorrelationId}`,
		super_magic_chunk: {
			i: 0,
			usage: null,
			correlation_id: chunkCorrelationId,
			choices: [
				{
					finish_reason: null,
					delta: {
						content,
						role: "assistant",
						tool_calls: [],
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	})

	// 第一个真实流持有 topic timer；第二个真实流因 timer 已存在而只建立 StreamState，
	// 它的 Final 才会真实进入 buffer 等待，避免用旧版 Final-only 伪流式制造假阻塞。
	store.receiveChunk(createBlockingChunk(`${correlationId}-timer-owner`))
	store.receiveChunk(createBlockingChunk(correlationId))
	store.enqueueMessage(
		topicId,
		createEnvelope({
			topicId,
			appMessageId,
			correlationId,
			seqId,
			content,
			status: "finished",
			event,
		}),
	)
}

function arrivalSeqIds(
	events: TopicMessageListenerPayload[],
	ignoredAppMessageIds: string[] = [],
): string[] {
	return events
		.filter((event) => !ignoredAppMessageIds.includes(event.message.app_message_id))
		.map((event) => event.message.seq_id)
}

describe("SuperMagicStore / Message Buffer", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("buffer 中同一个 appMessageId 重复入队。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const envelope = createEnvelope({
			appMessageId: "duplicate-app",
			correlationId: "duplicate-correlation",
			seqId: "100",
			content: "canonical",
		})

		store.enqueueMessage(TOPIC_A, envelope)
		store.enqueueMessage(TOPIC_A, cloneEnvelope(envelope))
		settleRendering()

		expect(
			arrivals.events.filter((event) => event.message.app_message_id === "duplicate-app"),
		).toHaveLength(1)
		expect(getNode(store, "duplicate-correlation")?.content).toBe("canonical")
		arrivals.unsubscribe()
	})

	it("buffer 中同一个 correlation 的不同 appMessageId 重复入队。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "app-old",
				correlationId: "shared-correlation",
				seqId: "100",
				content: "old",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "app-new",
				correlationId: "shared-correlation",
				seqId: "101",
				content: "new",
			}),
		)
		settleRendering()

		expect(getNode(store, "shared-correlation")?.content).toBe("new")
		expect(getNode(store, "app-old")).toBe(getNode(store, "app-new"))
	})

	it("`isProcessing=true` 后异常返回，未恢复为 false。", () => {
		const store = createStore()
		const throwingEnvelope = createEnvelope({
			appMessageId: "throwing-message",
			correlationId: "throwing-correlation",
			seqId: "100",
		})
		const message = (throwingEnvelope as unknown as MutableEnvelope).seq.message
		if (!message || typeof message !== "object") throw new Error("invalid fixture")
		Object.defineProperty(message, "super_magic_message", {
			configurable: true,
			get() {
				throw new Error("fixture processing failure")
			},
		})

		try {
			store.enqueueMessage(TOPIC_A, throwingEnvelope)
		} catch (error) {
			expect(error).toBeInstanceOf(Error)
		}

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "after-error",
				correlationId: "after-error-correlation",
				seqId: "101",
				content: "still processed",
			}),
		)
		settleRendering()

		expect(getNode(store, "after-error-correlation")?.content).toBe("still processed")
	})

	it("Final-only 不创建 timer，也不进入 streaming。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const finalOnly = createFinalOnlyAssistant()

		store.enqueueMessage(TOPIC_A, finalOnly)

		expect(getNode(store, "blocking-correlation")?.content).toBe("x".repeat(50_000))
		expect(store.getStreamState(TOPIC_A, "blocking-correlation")).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
		settleRendering(500)

		expect(
			arrivals.events.filter(
				(event) => event.message.app_message_id === "blocking-assistant",
			),
		).toHaveLength(1)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		arrivals.unsubscribe()
	})

	it("队头 assistant 永不完成，后续消息永久阻塞。", () => {
		const store = createStore()

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "message-after-blocker",
				correlationId: "correlation-after-blocker",
				seqId: "2",
				content: "must not starve",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "correlation-after-blocker")?.content).toBe("must not starve")
	})

	it("tool response 被排在永不完成的 assistant 后面。", () => {
		const store = createStore()

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "tool-after-blocker",
				correlationId: "blocking-correlation",
				seqId: "2",
				role: "tool",
				toolCallId: "tool-after-blocker",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "tool-after-blocker")?.tool).toMatchObject({
			id: "tool-after-blocker",
			status: "finished",
		})
	})

	it("tool response 已写入 toolResponseMap，但消息列表迟迟没有该 tool message。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "visible-tool-message",
				correlationId: "blocking-correlation",
				seqId: "2",
				role: "tool",
				toolCallId: "visible-tool",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "visible-tool-message")?.role).toBe("tool")
		expect(
			arrivals.events.some(
				(event) => event.message.app_message_id === "visible-tool-message",
			),
		).toBe(true)
		arrivals.unsubscribe()
	})

	it("buffer 中消息顺序与 seqId 顺序不一致。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)

		for (const seqId of ["30", "10", "20"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `message-${seqId}`,
					correlationId: `correlation-${seqId}`,
					seqId,
					role: "tool",
					toolCallId: `tool-${seqId}`,
				}),
			)
		}
		settleRendering(100)

		expect(arrivalSeqIds(arrivals.events, ["blocking-assistant"])).toEqual(["10", "20", "30"])
		arrivals.unsubscribe()
	})

	it("buffer 到达顺序正确，但 `sortMessages()` 重排错误。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)

		for (const seqId of ["2", "10", "11"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `sorted-${seqId}`,
					correlationId: `sorted-correlation-${seqId}`,
					seqId,
					role: "tool",
					toolCallId: `sorted-tool-${seqId}`,
				}),
			)
		}
		settleRendering(100)

		expect(arrivalSeqIds(arrivals.events, ["blocking-assistant"])).toEqual(["2", "10", "11"])
		arrivals.unsubscribe()
	})

	it("seqId 缺失。", () => {
		const store = createStore()
		const missingSeq = mutateEnvelope(
			createEnvelope({
				appMessageId: "missing-seq",
				correlationId: "missing-seq-correlation",
				seqId: "100",
			}),
			(draft) => {
				delete draft.seq.seq_id
			},
		)

		expect(() => store.enqueueMessage(TOPIC_A, missingSeq)).not.toThrow()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "valid-after-missing-seq",
				correlationId: "valid-after-missing-seq-correlation",
				seqId: "101",
				content: "valid",
			}),
		)
		settleRendering()

		expect(getNode(store, "valid-after-missing-seq-correlation")?.content).toBe("valid")
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
	})

	it("seqId 重复。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "same-seq-a",
				correlationId: "same-seq-correlation-a",
				seqId: "100",
				content: "A",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "same-seq-b",
				correlationId: "same-seq-correlation-b",
				seqId: "100",
				content: "B",
			}),
		)
		settleRendering()

		expect(getNode(store, "same-seq-correlation-a")?.content).toBe("A")
		expect(getNode(store, "same-seq-correlation-b")?.content).toBe("B")
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
	})

	it("seqId 是超大数字字符串。", () => {
		const store = createStore()
		const hugeSeqId = "900719925474099312345678901234567890"

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "huge-seq",
				correlationId: "huge-seq-correlation",
				seqId: hugeSeqId,
			}),
		)
		settleRendering()

		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe(hugeSeqId)
		expect(getNode(store, "huge-seq-correlation")).toBeDefined()
	})

	it("seqId 带本地后缀，例如 `_timestamp`。", () => {
		const store = createStore()
		const localSeqId = "101_1700000000000"

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "server-seq",
				correlationId: "server-seq-correlation",
				seqId: "100",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "local-seq",
				correlationId: "local-seq-correlation",
				seqId: localSeqId,
			}),
		)
		settleRendering()

		expect(getNode(store, "local-seq-correlation")).toBeDefined()
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe(localSeqId)
	})

	it("使用字符串 `localeCompare()` 导致数字顺序异常。", () => {
		const store = createStore()

		for (const seqId of ["2", "10", "9"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `numeric-${seqId}`,
					correlationId: `numeric-correlation-${seqId}`,
					seqId,
				}),
			)
		}
		settleRendering()

		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("10")
	})

	it("finalized assistant 的 buffer 副本未被丢弃。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const finalEnvelope = createEnvelope({
			appMessageId: "finalized-app",
			correlationId: "finalized-correlation",
			seqId: "100",
			content: "canonical final",
		})

		store.enqueueMessage(TOPIC_A, finalEnvelope)
		store.enqueueMessage(TOPIC_A, cloneEnvelope(finalEnvelope))
		store.enqueueMessage(TOPIC_A, cloneEnvelope(finalEnvelope))
		settleRendering()

		expect(
			arrivals.events.filter(
				(event) => event.message.correlation_id === "finalized-correlation",
			),
		).toHaveLength(1)
		expect(getNode(store, "finalized-correlation")?.content).toBe("canonical final")
		arrivals.unsubscribe()
	})

	it("finalizedCorrelationIds 错误导致合法 assistant 被丢弃。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "first-final",
				correlationId: "reused-final-correlation",
				seqId: "100",
				content: "first final",
			}),
		)
		settleRendering()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "corrected-final",
				correlationId: "reused-final-correlation",
				seqId: "101",
				content: "corrected authoritative final",
			}),
		)
		settleRendering()

		expect(getNode(store, "reused-final-correlation")?.content).toBe(
			"corrected authoritative final",
		)
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
	})

	it("processMessageBuffer 递归处理大量消息造成长任务。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const messageCount = 300

		expect(() => {
			for (let index = 1; index <= messageCount; index += 1) {
				store.enqueueMessage(
					TOPIC_A,
					createEnvelope({
						appMessageId: `bulk-tool-${index}`,
						correlationId: "bulk-correlation",
						seqId: String(index),
						role: "tool",
						toolCallId: `bulk-tool-${index}`,
					}),
				)
			}
		}).not.toThrow()
		settleRendering(1_000)

		expect(arrivals.events).toHaveLength(messageCount)
		expect(getNode(store, `bulk-tool-${messageCount}`)).toBeDefined()
		arrivals.unsubscribe()
	})

	it("buffer 长期增长而没有清理。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)

		for (let index = 1; index <= 100; index += 1) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `cleanup-${index}`,
					correlationId: "cleanup-correlation",
					seqId: String(index),
					role: "tool",
					toolCallId: `cleanup-tool-${index}`,
				}),
			)
		}
		settleRendering(1_000)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "cleanup-sentinel",
				correlationId: "cleanup-sentinel-correlation",
				seqId: "101",
				content: "sentinel",
			}),
		)
		settleRendering()

		expect(arrivals.events).toHaveLength(101)
		expect(getNode(store, "cleanup-sentinel-correlation")?.content).toBe("sentinel")
		arrivals.unsubscribe()
	})

	it("topic 被删除后 buffer 仍保留。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "",
			}),
		).toBe(true)
		store.setActiveTopicId(null)
		settleRendering()

		expect(getNode(store, "blocking-correlation")).toBeUndefined()
		expect(arrivals.events).toHaveLength(0)
		arrivals.unsubscribe()
	})

	it("切换 topic 时旧 buffer 继续产生领域事件。", () => {
		const store = createStore()
		const domainEvents = collectDomainEvents(store)

		startBlockingAssistantStream(store, {
			appMessageId: "old-topic-task",
			correlationId: "old-topic-correlation",
			seqId: "100",
			event: "task_finished",
		})
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(
			TOPIC_B,
			createEnvelope({
				topicId: TOPIC_B,
				appMessageId: "active-topic-message",
				correlationId: "active-topic-correlation",
				seqId: "101",
				content: "active",
			}),
		)
		settleRendering()

		expect(domainEvents.events.some((event) => event.topicId === TOPIC_A)).toBe(false)
		expect(getNode(store, "active-topic-correlation")?.content).toBe("active")
		domainEvents.unsubscribe()
	})
})
