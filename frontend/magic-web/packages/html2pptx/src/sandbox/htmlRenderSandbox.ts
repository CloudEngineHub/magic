import type { SlideConfig } from "../api/options"
import { LogLevel, createScopedLog } from "../logger"
import { NATIVE_LOAD_WAIT_MS, READY_STATE_POLL_MS } from "../shared/constants"
import { DEFAULT_CONFIG } from "../shared/unit"
import { createAbortError } from "./abort"
import {
	createHiddenIframe,
	isDocumentReadyForRender,
	measureContentSize,
	normalizeSandboxHtml,
} from "./htmlRenderSandbox.helpers"
import {
	SandboxReadyController,
	type SandboxReadyControllerInput,
} from "./waitSandboxReady"
import type { ResourceLoadError } from "../api/options"

/** Sandbox render result */
export interface SandboxRenderResult {
	iWindow: Window
	iDocument: Document
	/** Measured content width in px, including horizontal overflow */
	totalWidth: number
	/** Measured content height in px, including vertical overflow for automatic pagination */
	totalHeight: number
}

/** Sandbox instance interface */
export interface SandboxInstance {
	/** iframe element */
	iframe: HTMLIFrameElement
	/** iframe window object */
	window: Window
	/** iframe document object */
	document: Document
	/** Render HTML content */
	render: (
		html: string,
		options?: { signal?: AbortSignal; onResourceError?: (error: ResourceLoadError) => void },
	) => Promise<SandboxRenderResult>
	/** Destroy the sandbox */
	destroy: () => void
}

interface RenderLifecycleState {
	settled: boolean
	readyStarted: boolean
	timeoutId: ReturnType<typeof setTimeout> | null
	pollTimerId: ReturnType<typeof setTimeout> | null
	readyController: SandboxReadyControllerLike | null
}

interface SandboxReadyControllerLike {
	waitForReady: (options?: { signal?: AbortSignal }) => Promise<void>
	restore: () => void
}

export type SandboxReadyControllerConstructor = new (
	input: SandboxReadyControllerInput,
) => SandboxReadyControllerLike

export interface HtmlRenderSandboxOptions {
	ReadyController?: SandboxReadyControllerConstructor
}

/**
 * One HTML render sandbox instance backed by a hidden iframe.
 * Multi-page export reuses the same instance for serial rendering; one instance does not support concurrent render calls.
 */
export class HtmlRenderSandbox implements SandboxInstance {
	readonly iframe: HTMLIFrameElement
	readonly window: Window
	readonly document: Document

	private rendering = false
	private readonly htmlWidth: number
	private readonly htmlHeight: number
	private readonly sandboxLog = createScopedLog("sandbox")
	private readonly ReadyController: SandboxReadyControllerConstructor

	constructor(config: SlideConfig = DEFAULT_CONFIG, options?: HtmlRenderSandboxOptions) {
		const { htmlWidth, htmlHeight } = config
		this.htmlWidth = htmlWidth
		this.htmlHeight = htmlHeight
		this.ReadyController = options?.ReadyController ?? SandboxReadyController
		this.iframe = createHiddenIframe({ htmlWidth, htmlHeight })

		document.body.appendChild(this.iframe)

		this.window = this.iframe.contentWindow as Window
		this.document = this.iframe.contentDocument as Document

		this.iframe.addEventListener("error", (event) => {
			this.sandboxLog(LogLevel.L4, "iframe error", { error: String(event) })
		})
	}

	render(
		html: string,
		options?: { signal?: AbortSignal; onResourceError?: (error: ResourceLoadError) => void },
	): Promise<SandboxRenderResult> {
		if (this.rendering) {
			return Promise.reject(
				new Error("[Sandbox] concurrent render is not supported"),
			)
		}
		this.rendering = true

		return new Promise((resolve, reject) => {
			const signal = options?.signal
			const iframeWindow = this.window
			const iframeDocument = this.document
			const lifecycleState: RenderLifecycleState = {
				settled: false,
				readyStarted: false,
				timeoutId: null,
				pollTimerId: null,
				readyController: null,
			}
			let checkLoaded: () => void = () => {}
			const renderStartedAt = Date.now()

			const finish = (
				type: "resolve" | "reject",
				payload: SandboxRenderResult | unknown,
			) => {
				if (lifecycleState.settled) return
				lifecycleState.settled = true
				try {
					cleanup()
				} finally {
					this.rendering = false
				}
				if (type === "resolve") {
					resolve(payload as SandboxRenderResult)
					return
				}
				reject(payload)
			}

			const onDomReady = () => checkLoaded()
			const onAbort = () => {
				finish("reject", createAbortError())
			}

			const cleanup = () => {
				iframeDocument.removeEventListener("DOMContentLoaded", onDomReady)
				if (signal) signal.removeEventListener("abort", onAbort)
				lifecycleState.readyController?.restore()
				lifecycleState.readyController = null
				if (lifecycleState.timeoutId)
					clearTimeout(lifecycleState.timeoutId)
				if (lifecycleState.pollTimerId)
					clearTimeout(lifecycleState.pollTimerId)
				lifecycleState.timeoutId = null
				lifecycleState.pollTimerId = null
			}

			try {
				if (signal?.aborted) {
					finish("reject", createAbortError())
					return
				}
				signal?.addEventListener("abort", onAbort, { once: true })
				const normalizedHtml = normalizeSandboxHtml(html)

				// Explicitly clear the previous page document before installing the ready controller so this page's load and resource events are not missed.
				iframeDocument.open()
				lifecycleState.readyController = new this.ReadyController({
					iframeWindow,
					iframeDocument,
					nativeLoadWaitMs: NATIVE_LOAD_WAIT_MS,
					onResourceError: options?.onResourceError,
				})

				iframeDocument.write(normalizedHtml)
				iframeDocument.close()

				checkLoaded = () => {
					if (lifecycleState.settled) return
					if (isDocumentReadyForRender({ iframeDocument, renderStartedAt })) {
						if (lifecycleState.readyStarted) return
						lifecycleState.readyStarted = true
						if (lifecycleState.pollTimerId) {
							clearTimeout(lifecycleState.pollTimerId)
							lifecycleState.pollTimerId = null
						}
						iframeWindow.requestAnimationFrame(() => {
							if (lifecycleState.settled) return

							Promise.resolve()
								.then(async () => {
									await lifecycleState.readyController?.waitForReady({ signal })
									const measured = measureContentSize({
										iframeDocument,
										fallbackWidth: this.htmlWidth,
										fallbackHeight: this.htmlHeight,
									})
									finish("resolve", {
										iWindow: iframeWindow,
										iDocument: iframeDocument,
										totalWidth: measured.width,
										totalHeight: measured.height,
									})
								})
								.catch((error) => {
									finish("reject", error)
								})
						})
					} else {
						lifecycleState.pollTimerId = setTimeout(checkLoaded, READY_STATE_POLL_MS)
					}
				}

				checkLoaded()
				iframeDocument.addEventListener("DOMContentLoaded", onDomReady, { once: true })
			} catch (error) {
				finish("reject", error)
			}
		})
	}

	destroy(): void {
		if (this.iframe.parentNode) {
			this.iframe.parentNode.removeChild(this.iframe)
		}
	}
}
