import { LogLevel, createScopedLog, log } from "../logger"
import {
	EXTERNAL_RESOURCE_TIMEOUT_MS,
	FONTS_READY_TIMEOUT_MS,
	NATIVE_LOAD_WAIT_MS,
	READY_STATE_POLL_MS,
} from "../shared/constants"
import { createAbortError } from "./abort"
import {
	createHiddenIframe,
	disableStickyPositioning,
	isDocumentReadyForRender,
	measureContentSize,
	normalizeSandboxHtml,
	resolveRenderTimeoutMs,
	unlockViewportLockedContainers,
	waitForFonts,
} from "./renderSandbox.helpers"
import { SandboxReadyController } from "./waitSandboxReady"

export interface SandboxRenderResult {
	iWindow: Window
	iDocument: Document
	totalWidth: number
	totalHeight: number
}

export interface SandboxInstance {
	iframe: HTMLIFrameElement
	window: Window
	document: Document
	resize: (config: { pageWidthPx: number; pageHeightPx: number }) => void
	render: (html: string, options?: { signal?: AbortSignal }) => Promise<SandboxRenderResult>
	destroy: () => void
}

interface RenderLifecycleState {
	settled: boolean
	timeoutId: ReturnType<typeof setTimeout> | null
	pollTimerId: ReturnType<typeof setTimeout> | null
	readyController: SandboxReadyController | null
}

export class RenderSandbox implements SandboxInstance {
	readonly iframe: HTMLIFrameElement
	readonly window: Window
	readonly document: Document

	private rendering = false
	private pageWidthPx: number
	private pageHeightPx: number
	private readonly sandboxLog = createScopedLog("sandbox")

	constructor(config: { pageWidthPx: number; pageHeightPx: number }) {
		const { pageWidthPx, pageHeightPx } = config
		this.pageWidthPx = pageWidthPx
		this.pageHeightPx = pageHeightPx
		this.iframe = createHiddenIframe({ pageWidthPx, pageHeightPx })

		document.body.appendChild(this.iframe)

		this.window = this.iframe.contentWindow as Window
		this.document = this.iframe.contentDocument as Document

		this.iframe.addEventListener("error", (event) => {
			this.sandboxLog(LogLevel.L4, "iframe error", { error: String(event) })
		})
	}

	render(html: string, options?: { signal?: AbortSignal }): Promise<SandboxRenderResult> {
		if (this.rendering) {
			return Promise.reject(new Error("[Sandbox] concurrent render is not supported"))
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

			const cleanup = () => {
				iframeDocument.removeEventListener("DOMContentLoaded", onDomReady)
				if (signal) signal.removeEventListener("abort", onAbort)
				lifecycleState.readyController?.restore()
				lifecycleState.readyController = null
				if (lifecycleState.timeoutId) clearTimeout(lifecycleState.timeoutId)
				if (lifecycleState.pollTimerId) clearTimeout(lifecycleState.pollTimerId)
				lifecycleState.timeoutId = null
				lifecycleState.pollTimerId = null
			}

			const finish = (type: "resolve" | "reject", payload: SandboxRenderResult | unknown) => {
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

			try {
				if (signal?.aborted) {
					finish("reject", createAbortError())
					return
				}
				signal?.addEventListener("abort", onAbort, { once: true })
				const normalizedHtml = normalizeSandboxHtml(html)

				iframeDocument.open()
				lifecycleState.readyController = new SandboxReadyController({
					iframeWindow,
					iframeDocument,
					nativeLoadWaitMs: NATIVE_LOAD_WAIT_MS,
					externalResourceTimeoutMs: EXTERNAL_RESOURCE_TIMEOUT_MS,
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
									// 等待字体加载完成，避免截图时 fallback 到系统字体
									await waitForFonts(iframeDocument, FONTS_READY_TIMEOUT_MS)
									// 在业务 JS 跑完、虚拟滚动表渲染完毕后、测量尺寸之前，把 sticky 降级为 static，
									// 避免 snapdom 无法呈现 sticky 表头。同步调用，与后续截图零竞争。
									disableStickyPositioning(iframeDocument)
									// 启发式解锁 viewport-locked 容器（height≈100vh + 内部 overflow 不为 visible），
									// 让 dashboard 类布局在离屏场景下能伸展出真实内容高。
									unlockViewportLockedContainers(iframeDocument)
									const measured = measureContentSize({
										iframeDocument,
										fallbackWidth: this.pageWidthPx,
										fallbackHeight: this.pageHeightPx,
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

				const renderTimeoutMs = resolveRenderTimeoutMs()
				lifecycleState.timeoutId = setTimeout(() => {
					this.sandboxLog(LogLevel.L4, `render timeout after ${renderTimeoutMs}ms`)
					finish(
						"reject",
						new Error(`[Sandbox] render timeout after ${renderTimeoutMs}ms`),
					)
				}, renderTimeoutMs)

				checkLoaded()
				iframeDocument.addEventListener("DOMContentLoaded", onDomReady, { once: true })
			} catch (error) {
				finish("reject", error)
			}
		})
	}

	resize(config: { pageWidthPx: number; pageHeightPx: number }): void {
		this.pageWidthPx = config.pageWidthPx
		this.pageHeightPx = config.pageHeightPx
		this.iframe.style.width = `${config.pageWidthPx}px`
		this.iframe.style.height = `${config.pageHeightPx}px`
	}

	/**
	 * resize 后不重新 document.write，仅触发 reflow 并重新测量尺寸。
	 * 避免破坏已渲染的 DOM（如 React 异步应用）。
	 */
	async reflow(options?: { signal?: AbortSignal }): Promise<SandboxRenderResult> {
		const iframeWindow = this.window
		const iframeDocument = this.document
		const signal = options?.signal

		if (signal?.aborted) {
			throw createAbortError()
		}

		iframeWindow.dispatchEvent(new Event("resize"))

		await new Promise<void>((resolve) => {
			iframeWindow.requestAnimationFrame(() => {
				setTimeout(resolve, 100)
			})
		})

		// reflow 后业务可能重新挂载 sticky 节点（虚拟列表等），再次降级一次。
		disableStickyPositioning(iframeDocument)
		// 同样重新解锁 viewport-locked 容器（reflow 可能重新设置内联 style）。
		unlockViewportLockedContainers(iframeDocument)

		const measured = measureContentSize({
			iframeDocument,
			fallbackWidth: this.pageWidthPx,
			fallbackHeight: this.pageHeightPx,
		})

		return {
			iWindow: iframeWindow,
			iDocument: iframeDocument,
			totalWidth: measured.width,
			totalHeight: measured.height,
		}
	}

	destroy(): void {
		if (this.iframe.parentNode) {
			this.iframe.parentNode.removeChild(this.iframe)
		}
	}
}
