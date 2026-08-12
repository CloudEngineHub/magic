import { beforeEach, describe, expect, it, vi } from "vitest"
import { WidgetBridge } from "../src/bridge"
import { WIDGET_PROTOCOL, WIDGET_PROTOCOL_VERSION } from "../src/protocol"
import type { MagicWidget } from "../src/types"

const TEST_ORIGIN = "https://magic.example.invalid"
const TEST_INSTANCE_ID = "widget-mock-instance"

/** Creates an iframe whose postMessage calls can be inspected without a network request. */
function createTestIframe() {
	const iframe = document.createElement("iframe")
	document.body.append(iframe)
	const frameWindow = iframe.contentWindow
	if (!frameWindow) throw new Error("Mock iframe window is required")
	const postMessage = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined)
	return { iframe, postMessage }
}

/** Delivers a protocol READY message from the bound iframe window. */
function dispatchReady(iframe: HTMLIFrameElement) {
	window.dispatchEvent(
		new MessageEvent("message", {
			origin: TEST_ORIGIN,
			source: iframe.contentWindow,
			data: {
				protocol: WIDGET_PROTOCOL,
				version: WIDGET_PROTOCOL_VERSION,
				instanceId: TEST_INSTANCE_ID,
				type: "ready",
				capabilities: ["getInput", "newConversation"],
			},
		}),
	)
}

/** Simulates the iframe document becoming able to receive protocol commands. */
function dispatchLoad(iframe: HTMLIFrameElement) {
	iframe.dispatchEvent(new Event("load"))
}

/** Announces that the embedded provider has installed its validated config listener. */
function dispatchConfigReady(iframe: HTMLIFrameElement) {
	window.dispatchEvent(
		new MessageEvent("message", {
			origin: TEST_ORIGIN,
			source: iframe.contentWindow,
			data: {
				protocol: WIDGET_PROTOCOL,
				version: WIDGET_PROTOCOL_VERSION,
				instanceId: TEST_INSTANCE_ID,
				type: "config_ready",
			},
		}),
	)
}

/** Delivers one fictional preview state from the bound iframe window. */
function dispatchPreviewFullscreen(
	iframe: HTMLIFrameElement,
	isFullscreen: unknown,
	origin = TEST_ORIGIN,
) {
	window.dispatchEvent(
		new MessageEvent("message", {
			origin,
			source: iframe.contentWindow,
			data: {
				protocol: WIDGET_PROTOCOL,
				version: WIDGET_PROTOCOL_VERSION,
				instanceId: TEST_INSTANCE_ID,
				type: "ui_state",
				state: { previewFullscreen: isFullscreen },
			},
		}),
	)
}

/** Delivers one fictional runtime result through the bound iframe identity. */
function dispatchRuntimeEvent(
	iframe: HTMLIFrameElement,
	event: MagicWidget.RuntimeEvent,
	options?: { origin?: string; instanceId?: string },
) {
	window.dispatchEvent(
		new MessageEvent("message", {
			origin: options?.origin ?? TEST_ORIGIN,
			source: iframe.contentWindow,
			data: {
				protocol: WIDGET_PROTOCOL,
				version: WIDGET_PROTOCOL_VERSION,
				instanceId: options?.instanceId ?? TEST_INSTANCE_ID,
				type: "event",
				event,
			},
		}),
	)
}

describe("WidgetBridge", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	it("notifies agent_ready listeners and returns command results", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const onReady = vi.fn()
		bridge.onAgentReady(onReady)

		dispatchLoad(iframe)
		dispatchReady(iframe)
		expect(onReady).toHaveBeenCalledTimes(1)
		expect(bridge.isReady()).toBe(true)

		const inputPromise = bridge.send("getInput")
		await Promise.resolve()
		const command = postMessage.mock.calls[0]?.[0] as { requestId: string }
		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: command.requestId,
					type: "response",
					ok: true,
					result: { content: "mock input" },
				},
			}),
		)

		expect(await inputPromise).toEqual({ content: "mock input" })
	})

	it("resolves newConversation from its response without a newer READY", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchLoad(iframe)
		dispatchReady(iframe)

		const conversationPromise = bridge.send("newConversation")
		await Promise.resolve()
		const command = postMessage.mock.calls[0]?.[0] as { requestId: string }

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: command.requestId,
					type: "response",
					ok: true,
				},
			}),
		)

		await expect(conversationPromise).resolves.toBeUndefined()
	})

	it("invalidates readiness when the iframe document reloads", () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchReady(iframe)
		expect(bridge.isReady()).toBe(true)

		iframe.dispatchEvent(new Event("load"))

		expect(bridge.isReady()).toBe(false)

		dispatchReady(iframe)
		expect(bridge.isReady()).toBe(true)
	})

	it("waits for the response when the new READY arrives first", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchLoad(iframe)
		dispatchReady(iframe)

		const conversationPromise = bridge.send("newConversation")
		await Promise.resolve()
		const command = postMessage.mock.calls[0]?.[0] as { requestId: string }
		dispatchReady(iframe)

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: command.requestId,
					type: "response",
					ok: true,
				},
			}),
		)

		await expect(conversationPromise).resolves.toBeUndefined()
	})

	it("sends commands after iframe load without waiting for agent_ready", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchLoad(iframe)

		const inputPromise = bridge.send("getInput")
		await Promise.resolve()
		const command = postMessage.mock.calls[0]?.[0] as { requestId: string }
		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: command.requestId,
					type: "response",
					ok: true,
					result: { content: "mock input" },
				},
			}),
		)

		expect(await inputPromise).toEqual({ content: "mock input" })
	})

	it("sends a complete config snapshot and resolves its correlated response", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchLoad(iframe)

		const configPromise = bridge.sendConfig({
			layout: "desktop",
			shell: { appSidebar: false },
			responsive: { mobileDetection: "device-and-viewport" },
			conversation: { projectFiles: false, topicHistory: true },
		})
		await Promise.resolve()
		expect(postMessage).not.toHaveBeenCalled()

		dispatchConfigReady(iframe)
		await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1))
		const message = postMessage.mock.calls[0]?.[0] as {
			requestId: string
			type: string
			config: unknown
		}
		expect(message).toMatchObject({
			type: "config",
			config: {
				layout: "desktop",
				shell: { appSidebar: false },
				responsive: { mobileDetection: "device-and-viewport" },
				conversation: { projectFiles: false, topicHistory: true },
			},
		})

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: message.requestId,
					type: "response",
					ok: true,
				},
			}),
		)

		await expect(configPromise).resolves.toBeUndefined()
	})

	it("preserves config readiness when the child handshake arrives before iframe load", async () => {
		const { iframe, postMessage } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		dispatchConfigReady(iframe)

		const configPromise = bridge.sendConfig({ layout: "mobile" })
		await Promise.resolve()
		expect(postMessage).not.toHaveBeenCalled()

		dispatchLoad(iframe)
		await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1))
		const message = postMessage.mock.calls[0]?.[0] as { requestId: string }
		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					requestId: message.requestId,
					type: "response",
					ok: true,
				},
			}),
		)

		await expect(configPromise).resolves.toBeUndefined()
	})

	it("rejects pending work after destroy", async () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const promise = bridge.send("getInput")

		bridge.destroy()

		await expect(promise).rejects.toMatchObject({ code: "DESTROYED" })
	})

	it("forwards only validated preview fullscreen snapshots from the bound iframe", () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const listener = vi.fn()
		bridge.onPreviewFullscreenChange(listener)

		dispatchPreviewFullscreen(iframe, true)
		dispatchPreviewFullscreen(iframe, "true")
		dispatchPreviewFullscreen(iframe, false, "https://untrusted-widget.example.invalid")

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(true)
	})

	it("restores the host preview state when the iframe document reloads", () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const listener = vi.fn()
		bridge.onPreviewFullscreenChange(listener)

		dispatchPreviewFullscreen(iframe, true)
		iframe.dispatchEvent(new Event("load"))

		expect(listener).toHaveBeenNthCalledWith(1, true)
		expect(listener).toHaveBeenNthCalledWith(2, false)
	})

	it("forwards only validated runtime result events from the bound iframe", () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const listener = vi.fn()
		bridge.onRuntimeEvent(listener)
		const event: MagicWidget.ToolCallSettledEvent = {
			type: "toolCall.settled",
			meta: {
				sequence: 3,
				revision: 1,
				occurredAt: 1_700_000_000_000,
				source: "im",
				topicId: "topic-mock-bridge",
				toolCallId: "tool-mock-bridge",
			},
			payload: {
				toolCall: { id: "tool-mock-bridge", name: "mock_tool" },
				response: { status: "response_missing" },
				strength: "weak",
				replaceable: true,
			},
		}
		const streamStartedEvent: MagicWidget.MessageStreamStartedEvent = {
			type: "message.stream.started",
			meta: {
				sequence: 4,
				revision: 1,
				occurredAt: 1_700_000_000_100,
				source: "stream",
				topicId: "topic-mock-bridge",
				correlationId: "correlation-mock-bridge",
				streamGeneration: 1,
			},
			payload: {
				chunkIndex: 0,
				startsWith: "metadata",
			},
		}

		dispatchRuntimeEvent(iframe, event)
		dispatchRuntimeEvent(iframe, streamStartedEvent)
		dispatchRuntimeEvent(iframe, event, {
			origin: "https://untrusted-widget.example.invalid",
		})
		dispatchRuntimeEvent(iframe, event, { instanceId: "widget-wrong-instance" })

		expect(listener).toHaveBeenCalledTimes(2)
		expect(listener).toHaveBeenNthCalledWith(1, event)
		expect(listener).toHaveBeenNthCalledWith(2, streamStartedEvent)
	})

	it("ignores runtime messages whose nested event name is not public", () => {
		const { iframe } = createTestIframe()
		const bridge = new WidgetBridge(iframe, TEST_ORIGIN, TEST_INSTANCE_ID)
		const listener = vi.fn()
		bridge.onRuntimeEvent(listener)

		window.dispatchEvent(
			new MessageEvent("message", {
				origin: TEST_ORIGIN,
				source: iframe.contentWindow,
				data: {
					protocol: WIDGET_PROTOCOL,
					version: WIDGET_PROTOCOL_VERSION,
					instanceId: TEST_INSTANCE_ID,
					type: "event",
					event: { type: "message.stream.delta" },
				},
			}),
		)

		expect(listener).not.toHaveBeenCalled()
	})
})
