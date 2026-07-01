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

/** 沙箱渲染结果 */
export interface SandboxRenderResult {
	iWindow: Window
	iDocument: Document
	/** 实测内容宽度（px），含横向溢出部分 */
	totalWidth: number
	/** 实测内容高度（px），含纵向溢出部分（用于自动分页） */
	totalHeight: number
}

/** 沙箱实例接口 */
export interface SandboxInstance {
	/** iframe 元素 */
	iframe: HTMLIFrameElement
	/** iframe window 对象 */
	window: Window
	/** iframe document 对象 */
	document: Document
	/** 渲染 HTML 内容 */
	render: (
		html: string,
		options?: { signal?: AbortSignal; onResourceError?: (error: ResourceLoadError) => void },
	) => Promise<SandboxRenderResult>
	/** 销毁沙箱 */
	destroy: () => void
}

interface RenderLifecycleState {
	settled: boolean
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
 * 一个 HTML 渲染沙箱实例，对应一个隐藏 iframe。
 * 多页导出会复用同一个实例串行渲染；同一实例不支持并发 render。
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

				// 显式清空上一页文档，再安装 ready controller，确保不漏掉本页 load 与资源事件。
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
