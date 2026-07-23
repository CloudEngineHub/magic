import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useMagicWidgetBridge } from "../useMagicWidgetBridge"

const HOST_ORIGIN = "https://host.example.invalid"
const INSTANCE_ID = "widget-mock-instance"

/** Builds one protocol command with fictional identifiers and payload data. */
function createCommand(requestId: string, command: string, content?: string) {
	return {
		protocol: "magic-widget",
		version: 1,
		instanceId: INSTANCE_ID,
		requestId,
		type: "command",
		command,
		...(content === undefined ? {} : { payload: { content } }),
	}
}

describe("useMagicWidgetBridge", () => {
	let parentWindow: Window
	let postMessage: ReturnType<typeof vi.fn>

	beforeEach(() => {
		postMessage = vi.fn()
		parentWindow = { postMessage } as unknown as Window
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: parentWindow,
		})
	})

	afterEach(() => {
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: window,
		})
	})

	it("emits agent_ready and accepts setInput after the caller observes readiness", async () => {
		const createNewConversation = vi.fn()
		const setInputListener = vi.fn((payload) => payload.respond())
		pubsub.subscribe(PubSubEvents.Magic_Widget_Editor_Command, setInputListener)
		const { result, unmount } = renderHook(() =>
			useMagicWidgetBridge({
				context: { instanceId: INSTANCE_ID, hostOrigin: HOST_ORIGIN },
				createNewConversation,
			}),
		)
		act(() => result.current.notifyAgentReady())
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ type: "ready", instanceId: INSTANCE_ID }),
			HOST_ORIGIN,
		)

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: HOST_ORIGIN,
				source: parentWindow,
				data: createCommand("request-mock-set", "setInput", "mock input"),
			}),
		)

		await waitFor(() => expect(setInputListener).toHaveBeenCalledTimes(1))
		expect(setInputListener).toHaveBeenCalledWith(
			expect.objectContaining({ command: "setInput", content: "mock input" }),
		)
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "request-mock-set",
				type: "response",
				ok: true,
			}),
			HOST_ORIGIN,
		)

		pubsub.unsubscribe(PubSubEvents.Magic_Widget_Editor_Command, setInputListener)
		unmount()
	})

	it("does not gate setInput on agent_ready", async () => {
		const setInputListener = vi.fn((payload) => payload.respond())
		pubsub.subscribe(PubSubEvents.Magic_Widget_Editor_Command, setInputListener)
		const { unmount } = renderHook(() =>
			useMagicWidgetBridge({
				context: { instanceId: INSTANCE_ID, hostOrigin: HOST_ORIGIN },
				createNewConversation: vi.fn(),
			}),
		)

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: HOST_ORIGIN,
				source: parentWindow,
				data: createCommand("request-before-ready", "setInput", "early input"),
			}),
		)

		await waitFor(() => expect(setInputListener).toHaveBeenCalledTimes(1))
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "request-before-ready",
				type: "response",
				ok: true,
			}),
			HOST_ORIGIN,
		)

		pubsub.unsubscribe(PubSubEvents.Magic_Widget_Editor_Command, setInputListener)
		unmount()
	})

	it("resolves newConversation only after the new editor reports agent_ready", async () => {
		const newTopic = { id: "topic-mock-new" } as Topic
		const createNewConversation = vi.fn().mockResolvedValue(newTopic)
		const { result } = renderHook(() =>
			useMagicWidgetBridge({
				context: { instanceId: INSTANCE_ID, hostOrigin: HOST_ORIGIN },
				createNewConversation,
			}),
		)

		act(() => result.current.notifyAgentReady())
		postMessage.mockClear()

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: HOST_ORIGIN,
				source: parentWindow,
				data: createCommand("request-mock-conversation", "newConversation"),
			}),
		)

		await waitFor(() => expect(createNewConversation).toHaveBeenCalledTimes(1))
		expect(
			postMessage.mock.calls.some(
				([message]) => message.requestId === "request-mock-conversation",
			),
		).toBe(false)

		act(() => result.current.notifyAgentReady())

		await waitFor(() =>
			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					requestId: "request-mock-conversation",
					type: "response",
					ok: true,
				}),
				HOST_ORIGIN,
			),
		)
	})

	it("returns an explicit error when message sending is unavailable", async () => {
		const { result } = renderHook(() =>
			useMagicWidgetBridge({
				context: { instanceId: INSTANCE_ID, hostOrigin: HOST_ORIGIN },
				createNewConversation: vi.fn(),
			}),
		)
		act(() => result.current.notifyAgentReady())

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: HOST_ORIGIN,
				source: parentWindow,
				data: createCommand("request-mock-send", "sendMessage", "mock message"),
			}),
		)

		await waitFor(() =>
			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					requestId: "request-mock-send",
					type: "response",
					ok: false,
					error: expect.objectContaining({
						message: "Magic widget message sending is not available",
					}),
				}),
				HOST_ORIGIN,
			),
		)
	})
})
