import {
	isWidgetProtocolMessage,
	WIDGET_PROTOCOL,
	WIDGET_PROTOCOL_VERSION,
	type WidgetCommandName,
	type WidgetCommandMessage,
	type WidgetResponseMessage,
} from "./protocol"
import type { MagicWidget } from "./types"

const DEFAULT_IFRAME_LOAD_TIMEOUT_MS = 10_000
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000
const NEW_CONVERSATION_COMMAND_TIMEOUT_MS = 30_000

type WidgetCommandResult = WidgetResponseMessage["result"]

interface PendingRequest {
	resolve: (result?: WidgetCommandResult) => void
	reject: (error: Error) => void
	timer: number
}

/** Creates a public error with a stable machine-readable SDK code. */
export function createWidgetCommandError(
	code: MagicWidget.CommandErrorCode,
	message: string,
): MagicWidget.CommandError {
	const error = new Error(message) as MagicWidget.CommandError
	error.code = code
	return error
}

/** Generates identifiers without exposing host business data in protocol metadata. */
export function createWidgetId(prefix: string): string {
	const randomValue =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	return `${prefix}-${randomValue}`
}

/** Coordinates READY handshakes, public ready events, and request/response commands. */
export class WidgetBridge {
	private ready = false
	private iframeLoaded = false
	private destroyed = false
	private loadWaiters = new Set<{
		resolve: () => void
		reject: (error: Error) => void
		timer: number
	}>()
	private pendingRequests = new Map<string, PendingRequest>()
	private agentReadyListeners = new Set<() => void>()

	constructor(
		private readonly iframe: HTMLIFrameElement,
		private readonly targetOrigin: string,
		private readonly instanceId: string,
	) {
		window.addEventListener("message", this.handleMessage)
		this.iframe.addEventListener("load", this.handleIframeLoad)
	}

	/** Reports whether the iframe has announced that its agent editor is ready. */
	isReady(): boolean {
		return this.ready && !this.destroyed
	}

	/** Registers one listener for the public agent_ready lifecycle event. */
	onAgentReady(listener: () => void): () => void {
		this.agentReadyListeners.add(listener)
		return () => this.agentReadyListeners.delete(listener)
	}

	/** Marks a reloaded iframe as unavailable until it announces READY again. */
	reset(): void {
		this.resetTransport()
	}

	/** Records agent readiness and optionally emits the public lifecycle event. */
	private markReady(notifyListeners: boolean): void {
		this.ready = true
		if (!notifyListeners) return
		this.agentReadyListeners.forEach((listener) => {
			try {
				listener()
			} catch (error) {
				console.error("Magic widget agent_ready listener failed", error)
			}
		})
	}

	/** Marks the iframe transport unavailable before a new document starts loading. */
	private resetTransport = (): void => {
		this.iframeLoaded = false
		this.ready = false
	}

	/** Releases transport waiters once the iframe document can receive commands. */
	private handleIframeLoad = (): void => {
		this.iframeLoaded = true
		this.ready = false
		this.loadWaiters.forEach((waiter) => {
			window.clearTimeout(waiter.timer)
			waiter.resolve()
		})
		this.loadWaiters.clear()
	}

	/** Waits only for iframe transport readiness, keeping agent_ready informational. */
	private waitUntilIframeLoaded(): Promise<void> {
		if (this.destroyed) {
			return Promise.reject(
				createWidgetCommandError("DESTROYED", "Magic widget was destroyed"),
			)
		}
		if (this.iframeLoaded) return Promise.resolve()

		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, timer: 0 }
			waiter.timer = window.setTimeout(() => {
				this.loadWaiters.delete(waiter)
				reject(
					createWidgetCommandError(
						"IFRAME_NOT_READY",
						"Magic widget iframe did not finish loading",
					),
				)
			}, DEFAULT_IFRAME_LOAD_TIMEOUT_MS)
			this.loadWaiters.add(waiter)
		})
	}

	/** Sends a validated command and resolves only after the iframe acknowledges it. */
	async send(
		command: WidgetCommandName,
		payload?: WidgetCommandMessage["payload"],
	): Promise<WidgetCommandResult> {
		await this.waitUntilIframeLoaded()
		if (!this.iframe.contentWindow) {
			throw createWidgetCommandError("IFRAME_NOT_READY", "Magic widget iframe is unavailable")
		}

		const requestId = createWidgetId("request")
		const message: WidgetCommandMessage = {
			protocol: WIDGET_PROTOCOL,
			version: WIDGET_PROTOCOL_VERSION,
			instanceId: this.instanceId,
			requestId,
			type: "command",
			command,
			...(payload ? { payload } : {}),
		}

		return new Promise((resolve, reject) => {
			const timeoutMs =
				command === "newConversation"
					? NEW_CONVERSATION_COMMAND_TIMEOUT_MS
					: DEFAULT_COMMAND_TIMEOUT_MS
			const timer = window.setTimeout(() => {
				this.pendingRequests.delete(requestId)
				reject(createWidgetCommandError("COMMAND_FAILED", "Magic widget command timed out"))
			}, timeoutMs)
			this.pendingRequests.set(requestId, { resolve, reject, timer })
			this.iframe.contentWindow?.postMessage(message, this.targetOrigin)
		})
	}

	/** Accepts messages only from the bound iframe, origin, protocol, and instance. */
	private handleMessage = (event: MessageEvent): void => {
		if (
			this.destroyed ||
			event.origin !== this.targetOrigin ||
			event.source !== this.iframe.contentWindow ||
			!isWidgetProtocolMessage(event.data) ||
			event.data.instanceId !== this.instanceId
		) {
			return
		}

		if (event.data.type === "ready") {
			this.markReady(true)
			return
		}

		if (event.data.type !== "response") return
		const pending = this.pendingRequests.get(event.data.requestId)
		if (!pending) return
		if (event.data.ok) {
			window.clearTimeout(pending.timer)
			this.pendingRequests.delete(event.data.requestId)
			pending.resolve(event.data.result)
			return
		}

		window.clearTimeout(pending.timer)
		this.pendingRequests.delete(event.data.requestId)
		pending.reject(
			createWidgetCommandError(
				"COMMAND_FAILED",
				event.data.error?.message ?? "Magic widget command failed",
			),
		)
	}

	/** Removes listeners and rejects all work owned by this instance. */
	destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		window.removeEventListener("message", this.handleMessage)
		this.iframe.removeEventListener("load", this.handleIframeLoad)
		const error = createWidgetCommandError("DESTROYED", "Magic widget was destroyed")
		this.loadWaiters.forEach((waiter) => {
			window.clearTimeout(waiter.timer)
			waiter.reject(error)
		})
		this.loadWaiters.clear()
		this.pendingRequests.forEach((pending) => {
			window.clearTimeout(pending.timer)
			pending.reject(error)
		})
		this.pendingRequests.clear()
		this.agentReadyListeners.clear()
	}
}
