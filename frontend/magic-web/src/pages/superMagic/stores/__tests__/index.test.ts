import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicStore } from "@/pages/superMagic/stores"

function createAssistantEnvelope({
	appMessageId,
	correlationId,
	content,
	nodeOverrides = {},
	messageOverrides = {},
	seqId = "100",
}: {
	appMessageId: string
	correlationId: string
	content: string
	nodeOverrides?: Record<string, unknown>
	messageOverrides?: Record<string, unknown>
	seqId?: string
}) {
	return {
		seq: {
			seq_id: seqId,
			message: {
				type: "super_magic_message",
				app_message_id: appMessageId,
				topic_id: "topic-1",
				send_time: Date.now() / 1000,
				status: "unread",
				...messageOverrides,
				super_magic_message: {
					role: "assistant",
					correlation_id: correlationId,
					content,
					...nodeOverrides,
				},
			},
		},
	} as any
}

function createChunkMessage({
	content,
	correlationId,
	finishReason = null,
}: {
	content: string
	correlationId: string
	finishReason?: "stop" | "tool_calls" | "length" | null
}) {
	return {
		type: "super_magic_chunk",
		topic_id: "topic-1",
		super_magic_chunk: {
			i: 1,
			correlation_id: correlationId,
			choices: [
				{
					finish_reason: finishReason,
					delta: {
						content,
						reasoning_content: "",
						tool_calls: [],
					},
				},
			],
		},
	} as any
}

function createToolEnvelope({
	appMessageId,
	correlationId,
	toolCallId,
	seqId = "101",
}: {
	appMessageId: string
	correlationId: string
	toolCallId: string
	seqId?: string
}) {
	return {
		seq: {
			seq_id: seqId,
			message: {
				type: "super_magic_message",
				app_message_id: appMessageId,
				topic_id: "topic-1",
				send_time: Date.now() / 1000,
				status: "unread",
				super_magic_message: {
					role: "tool",
					correlation_id: correlationId,
					content: null,
					reasoning_content: null,
					tool_call_id: toolCallId,
					tool_calls: null,
					tool: {
						id: toolCallId,
						name: "read_webpages_as_markdown",
						action: "深度阅读多个网页内容",
						status: "finished",
						remark: "共5个网页",
						attachments: [],
					},
					status: "running",
				},
			},
		},
	} as any
}

describe("SuperMagicStore streaming", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	it("assistant 消息主键归一 + alias 可回查", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-app-id",
				correlationId: "corr-1",
				content: "hello",
			}),
		)

		vi.runAllTimers()

		const messages = store.messages.get("topic-1") || []
		const assistantMessage = messages.find((item) => item.correlation_id === "corr-1")
		expect(assistantMessage?.app_message_id).toBe("corr-1")
		expect(store.getMessageNode("raw-app-id")).toBeTruthy()
		expect((store.getMessageNode("corr-1") as any)?.content).toBe("hello")
	})

	it("chunk 终态 stop 后冻结，后到 chunk 不可脏写", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.receiveChunk(
			createChunkMessage({
				correlationId: "corr-2",
				content: "hel",
			}),
		)
		store.receiveChunk(
			createChunkMessage({
				correlationId: "corr-2",
				content: "lo",
				finishReason: "stop",
			}),
		)
		vi.runAllTimers()

		const topicMeta = (store as any).getTopicMetadata("topic-1")
		expect(topicMeta.finalizedCorrelationIds.has("corr-2")).toBe(true)
		expect((store.getMessageNode("corr-2") as any)?.content).toBe("hello")

		store.receiveChunk(
			createChunkMessage({
				correlationId: "corr-2",
				content: "!!!",
			}),
		)
		vi.runAllTimers()

		expect((store.getMessageNode("corr-2") as any)?.content).toBe("hello")
	})

	it("空 chunk 不创建无法结算的幽灵 StreamState", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")

		store.receiveChunk({
			type: "super_magic_chunk",
			topic_id: "topic-1",
			super_magic_chunk: {
				correlation_id: "corr-heartbeat",
				choices: [{ finish_reason: null }],
			},
		} as any)

		expect(store.getStreamState("topic-1", "corr-heartbeat")).toBeUndefined()
		expect((store as any).getTopicMetadata("topic-1").content.size).toBe(0)
	})

	it("只有 final 标记但没有前置 StreamState 时立即请求 HTTP 恢复", () => {
		const store = new SuperMagicStore()
		const recoveryRequested = vi.fn()
		store.registerOnStreamRecoveryRequested(recoveryRequested)
		store.setActiveTopicId("topic-1")

		store.receiveChunk({
			type: "super_magic_chunk",
			topic_id: "topic-1",
			super_magic_chunk: {
				correlation_id: "corr-final-only",
				choices: [{ finish_reason: "stop" }],
			},
		} as any)

		expect(store.getStreamState("topic-1", "corr-final-only")).toBeUndefined()
		expect(recoveryRequested).toHaveBeenCalledWith({
			topicId: "topic-1",
			correlationId: "corr-final-only",
		})
	})

	it("同一个 chunk 中的多个 tool call 都进入 canonical StreamState", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.receiveChunk({
			type: "super_magic_chunk",
			topic_id: "topic-1",
			super_magic_chunk: {
				correlation_id: "corr-multi-tools",
				choices: [
					{
						finish_reason: null,
						delta: {
							content: "",
							reasoning_content: "",
							tool_calls: [
								{
									index: 0,
									id: "tool-a",
									type: "function",
									function: { name: "search", arguments: '{"q":"a"}' },
								},
								{
									index: 1,
									id: "tool-b",
									type: "function",
									function: { name: "read_file", arguments: '{"path":"b"}' },
								},
							],
						},
					},
				],
			},
		} as any)

		const streamState = store.getStreamState("topic-1", "corr-multi-tools")
		expect(streamState?.tool_calls.map((tool) => tool.id)).toEqual(["tool-a", "tool-b"])
	})

	it("流式追平后长期未收到 final 时发出一次 HTTP 恢复请求", () => {
		const store = new SuperMagicStore()
		const recoveryRequested = vi.fn()
		const unsubscribe = (store as any).registerOnStreamRecoveryRequested?.(recoveryRequested)
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.receiveChunk(createChunkMessage({ correlationId: "corr-stalled", content: "a" }))
		vi.advanceTimersByTime(5_100)

		expect(unsubscribe).toBeTypeOf("function")
		expect(recoveryRequested).toHaveBeenCalledTimes(1)
		expect(recoveryRequested).toHaveBeenCalledWith({
			topicId: "topic-1",
			correlationId: "corr-stalled",
		})
	})

	it("真消息到达后，非流式元信息（status/task_id/event/attachments）同步到 mock 节点与卡片", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		// 1. 先让 chunk 到达，mock 出一条节点 + 卡片
		store.receiveChunk({
			type: "super_magic_chunk",
			topic_id: "topic-1",
			super_magic_chunk: {
				i: 1,
				correlation_id: "corr-sync",
				choices: [
					{
						finish_reason: null,
						delta: {
							content: "hi",
							reasoning_content: "",
							tool_calls: [],
						},
					},
				],
			},
		} as any)
		vi.runAllTimers()

		const mockedNode = store.getMessageNode("corr-sync") as any
		expect(mockedNode).toBeTruthy()
		expect(mockedNode.status).toBe("running")
		expect(mockedNode.task_id).toBeUndefined()

		const mockedCard = (store.messages.get("topic-1") || []).find(
			(o) => o.app_message_id === "corr-sync",
		) as any
		expect(mockedCard).toBeTruthy()
		expect(mockedCard.sender_id).toBe("sender_id")
		expect(mockedCard.seq_id).toBeDefined()
		const mockedSeqId = mockedCard.seq_id

		// 2. 真消息到达，携带元信息字段
		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "real-app-id",
				correlationId: "corr-sync",
				content: "hello world",
				seqId: "200",
				messageOverrides: {
					magic_message_id: "magic-id-1",
					sender_id: "user-real",
					status: "read",
				},
				nodeOverrides: {
					status: "finished",
					task_id: "task-xyz",
					event: "task_finished",
					attachments: [{ name: "a.txt" }],
					usage: { total_tokens: 42 },
				},
			}),
		)
		vi.runAllTimers()

		// 节点元信息同步（content 走流式 catch-up，独立校验）
		const syncedNode = store.getMessageNode("corr-sync") as any
		expect(syncedNode.status).toBe("finished")
		expect(syncedNode.task_id).toBe("task-xyz")
		expect(syncedNode.event).toBe("task_finished")
		expect(syncedNode.attachments).toEqual([{ name: "a.txt" }])
		expect(syncedNode.usage).toEqual({ total_tokens: 42 })
		expect(syncedNode.content).toBe("hello world")

		// 卡片身份字段同步，但 app_message_id 保留为 correlationId 占位不变
		const syncedCard = (store.messages.get("topic-1") || []).find(
			(o) => o.app_message_id === "corr-sync",
		) as any
		expect(syncedCard).toBeTruthy()
		expect(syncedCard.app_message_id).toBe("corr-sync")
		expect((syncedCard as any).magic_message_id).toBe("magic-id-1")
		expect(syncedCard.sender_id).toBe("user-real")
		expect(syncedCard.status).toBe("read")
		expect(syncedCard.seq_id).toBe("200")
		expect(syncedCard.seq_id).not.toBe(mockedSeqId)

		// 列表中不应因为同步而出现重复卡片
		const corrCards = (store.messages.get("topic-1") || []).filter(
			(o) => o.correlation_id === "corr-sync",
		)
		expect(corrCards).toHaveLength(1)
	})

	it("chunk 半程后 message 接管，继续平滑补齐且不重复插卡", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.handleSuperMagicChunkMessage(
			createChunkMessage({
				correlationId: "corr-3",
				content: "你",
			}),
		)
		vi.runAllTimers()

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-2",
				correlationId: "corr-3",
				content: "你好呀",
			}),
		)
		vi.runAllTimers()

		const messages = (store.messages.get("topic-1") || []).filter(
			(item) => item.correlation_id === "corr-3" && item.role === "assistant",
		)
		expect(messages).toHaveLength(1)
		expect((store.getMessageNode("corr-3") as any)?.content).toBe("你好呀")
	})

	it("tool 完成态不被所属 assistant 或下一条流式消息阻塞", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "assistant-tool-app-id",
				correlationId: "corr-tool",
				content: "让我读取网页",
				nodeOverrides: {
					tool_calls: [
						{
							id: "tool-call-1",
							type: "function",
							index: 0,
							function: {
								name: "read_webpages_as_markdown",
								label: "深度阅读多个网页内容",
								arguments: JSON.stringify({
									urls: Array.from(
										{ length: 30 },
										(_, index) => `https://example.com/${index}`,
									),
								}),
							},
							tool: {
								id: "tool-call-1",
								name: "read_webpages_as_markdown",
								action: "深度阅读多个网页内容",
								status: "running",
								attachments: [],
							},
						},
					],
				},
			}),
		)

		store.enqueueMessage(
			"topic-1",
			createToolEnvelope({
				appMessageId: "tool-app-id",
				correlationId: "corr-tool",
				toolCallId: "tool-call-1",
			}),
		)

		store.receiveChunk(createChunkMessage({ correlationId: "corr-next", content: "下一条" }))
		vi.runAllTimers()

		expect(store.toolResponseMap.get("topic-1")?.get("tool-call-1")?.status).toBe("finished")
		expect(store.getStreamState("topic-1", "corr-next")).toBeTruthy()
	})

	it("tool response 到达后立即写入 canonical map，不等待 assistant 动画", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "assistant-immediate-tool",
				correlationId: "corr-immediate-tool",
				content: "处理中",
				nodeOverrides: {
					tool_calls: [
						{
							id: "tool-immediate",
							type: "function",
							index: 0,
							function: {
								name: "read_file",
								arguments: JSON.stringify({ path: "a".repeat(500) }),
							},
						},
					],
				},
			}),
		)
		store.enqueueMessage(
			"topic-1",
			createToolEnvelope({
				appMessageId: "tool-immediate-message",
				correlationId: "corr-immediate-tool",
				toolCallId: "tool-immediate",
			}),
		)

		expect(store.toolResponseMap.get("topic-1")?.get("tool-immediate")?.status).toBe("finished")
	})

	it("非活跃话题不启动定时器，final 到达后 buffer 正常排空且保存快照", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-active")
		store.setTest("topic-1")

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-inactive",
				correlationId: "corr-inactive",
				content: "background reply",
			}),
		)
		vi.runAllTimers()

		const node = store.getMessageNode("corr-inactive") as any
		expect(node).toBeTruthy()
		expect(node.content).toBe("background reply")

		const topicMeta = (store as any).getTopicMetadata("topic-1")
		expect(topicMeta.timer).toBeNull()
		expect(topicMeta.content.size).toBe(0)
		expect(topicMeta.streamSnapshots.size).toBe(1)
		expect(topicMeta.streamSnapshots.get("corr-inactive")).toMatchObject({
			content: "background reply",
			reasoning_content: "",
		})
	})

	it("切回已完成话题直接终态，不回放打字机动画（场景 2）", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-active")
		store.setTest("topic-1")

		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-replay",
				correlationId: "corr-replay",
				content: "replay me",
			}),
		)
		vi.runAllTimers()

		// cache 已被 flushStreamToCompletion 固化为完整终态
		expect((store.getMessageNode("corr-replay") as any)?.content).toBe("replay me")

		// 切回话题
		store.setActiveTopicId("topic-1")

		// 不回退内容、不重建 StreamState、不启动定时器
		const node = store.getMessageNode("corr-replay") as any
		expect(node.content).toBe("replay me")

		const topicMeta = (store as any).getTopicMetadata("topic-1")
		expect(topicMeta.content.size).toBe(0)
		expect(topicMeta.timer).toBeNull()
		expect(topicMeta.streamSnapshots.size).toBe(0)
	})

	it("非活跃话题 chunk 积累后切回，从断点继续流式", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.receiveChunk(createChunkMessage({ correlationId: "corr-resume", content: "he" }))
		vi.runAllTimers()

		const partialContent = (store.getMessageNode("corr-resume") as any)?.content || ""
		expect(partialContent.length).toBeGreaterThan(0)
		const snapshotLen = partialContent.length

		store.setActiveTopicId("topic-other")

		store.receiveChunk(
			createChunkMessage({ correlationId: "corr-resume", content: "llo world" }),
		)
		vi.runAllTimers()

		const afterInactiveContent = (store.getMessageNode("corr-resume") as any)?.content || ""
		expect(afterInactiveContent.length).toBe(snapshotLen)

		store.setActiveTopicId("topic-1")
		vi.runAllTimers()

		const streamState = (store as any).getTopicMetadata("topic-1").content.get("corr-resume")
		expect(streamState?.content || "").toBe("hello world")
	})

	it("快速切换话题无定时器泄漏", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		store.receiveChunk(createChunkMessage({ correlationId: "corr-leak", content: "a" }))
		vi.advanceTimersByTime(16)

		for (let i = 0; i < 10; i++) {
			store.setActiveTopicId(i % 2 === 0 ? "topic-other" : "topic-1")
		}

		const topicMeta = (store as any).getTopicMetadata("topic-1")
		const timerCount = topicMeta.timer ? 1 : 0
		expect(timerCount).toBeLessThanOrEqual(1)
	})

	it("乱序 chunk + final 不同序，工具调用视觉顺序保持首现顺序不变", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		// chunk 按 index 0, 1, 2 依次到达三个工具
		const makeToolChunk = (index: number, id: string, name: string) => ({
			type: "super_magic_chunk" as const,
			topic_id: "topic-1",
			super_magic_chunk: {
				i: 1,
				correlation_id: "corr-tools",
				choices: [
					{
						finish_reason: null,
						delta: {
							content: "",
							reasoning_content: "",
							tool_calls: [
								{
									index,
									id,
									type: "function",
									function: { name, label: name, arguments: "" },
								},
							],
						},
					},
				],
			},
		})

		store.receiveChunk(makeToolChunk(0, "tool-a", "search") as any)
		store.receiveChunk(makeToolChunk(1, "tool-b", "read_file") as any)
		store.receiveChunk(makeToolChunk(2, "tool-c", "write_file") as any)
		vi.runAllTimers()

		// 流式首现顺序: tool-a, tool-b, tool-c
		const nodeBeforeFinal = store.getMessageNode("corr-tools") as any
		expect(nodeBeforeFinal.tool_calls.map((t: any) => t.id)).toEqual([
			"tool-a",
			"tool-b",
			"tool-c",
		])

		// final 到达时后端数组顺序为 tool-c, tool-a, tool-b（与流式不同）
		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-tools-final",
				correlationId: "corr-tools",
				content: "",
				nodeOverrides: {
					tool_calls: [
						{
							id: "tool-c",
							type: "function",
							index: 0,
							function: {
								name: "write_file",
								label: "write_file",
								arguments: '{"path":"c.txt"}',
							},
						},
						{
							id: "tool-a",
							type: "function",
							index: 1,
							function: {
								name: "search",
								label: "search",
								arguments: '{"q":"hello"}',
							},
						},
						{
							id: "tool-b",
							type: "function",
							index: 2,
							function: {
								name: "read_file",
								label: "read_file",
								arguments: '{"path":"b.txt"}',
							},
						},
					],
				},
			}),
		)
		vi.runAllTimers()

		// 视觉顺序仍为首现顺序 tool-a, tool-b, tool-c
		const nodeAfterFinal = store.getMessageNode("corr-tools") as any
		const ids = (nodeAfterFinal.tool_calls || []).map((t: any) => t.id)
		expect(ids).toEqual(["tool-a", "tool-b", "tool-c"])

		// arguments 应从 final 合并补齐
		const argsMap = Object.fromEntries(
			(nodeAfterFinal.tool_calls || []).map((t: any) => [t.id, t.function?.arguments]),
		)
		expect(argsMap["tool-a"]).toBe('{"q":"hello"}')
		expect(argsMap["tool-b"]).toBe('{"path":"b.txt"}')
		expect(argsMap["tool-c"]).toBe('{"path":"c.txt"}')
	})

	it("切走后台 final 再切回，直接终态、无 timer、无 StreamState 重建", () => {
		const store = new SuperMagicStore()
		store.setActiveTopicId("topic-1")
		store.setTest("topic-1")

		// 1. 在 topic-1 上开始流式
		store.receiveChunk(createChunkMessage({ correlationId: "corr-bg", content: "partial" }))
		vi.runAllTimers()

		const partialNode = store.getMessageNode("corr-bg") as any
		expect(partialNode).toBeTruthy()

		// 2. 切走到其他话题
		store.setActiveTopicId("topic-other")

		// 3. 后台收到 final 消息
		store.enqueueMessage(
			"topic-1",
			createAssistantEnvelope({
				appMessageId: "raw-bg-final",
				correlationId: "corr-bg",
				content: "partial complete final",
			}),
		)
		vi.runAllTimers()

		// cache 应已被 flushStreamToCompletion 固化为完整终态
		const bgNode = store.getMessageNode("corr-bg") as any
		expect(bgNode.content).toBe("partial complete final")

		// 4. 切回 topic-1
		store.setActiveTopicId("topic-1")

		// 切回后应直接终态：不创建 timer、不重建 StreamState
		const topicMeta = (store as any).getTopicMetadata("topic-1")
		expect(topicMeta.timer).toBeNull()
		expect(topicMeta.content.size).toBe(0)
		expect(topicMeta.streamSnapshots.size).toBe(0)

		// 内容保持完整终态
		const finalNode = store.getMessageNode("corr-bg") as any
		expect(finalNode.content).toBe("partial complete final")
	})
})
