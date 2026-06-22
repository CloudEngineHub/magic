export const HTML_IFRAME_RENDER_LIFECYCLE_EVENT = "html_iframe_render_lifecycle"
export const IFRAME_RENDER_TIMEOUT_MS = 30_000

export type IframeRenderLifecycleStage =
	| "session_start"
	| "shell_loaded"
	| "shell_load_failed"
	| "iframe_ready"
	| "page_loaded"
	| "set_content_sent"
	| "set_content_failed"
	| "content_injected"
	| "content_inject_failed"
	| "content_loaded"
	| "dom_ready"
	| "render_complete"
	| "page_fully_loaded"
	| "content_metrics_initial"
	| "content_metrics_settled"
	| "scale_ready"
	| "render_ready"
	| "render_success"
	| "nested_iframe_failed"
	| "timeout"

export interface IframeRenderLifecycleSource {
	layer: "top" | "nested"
	depth: number
	fileId?: string
	path?: string
	requesterFileId?: string
	chainFileIds?: string[]
}

export interface IframeRenderLifecycleContext {
	sessionId?: string
	elapsedMs?: number
	sandboxType?: string
	renderMode: "cross-origin" | "same-origin"
	shellUrl: string
	shellOrigin?: string
	targetOrigin?: string
	postMessageTargetStrategy?: string
	source: IframeRenderLifecycleSource
	fileId?: string
	relativeFilePath?: string
	isPptRender?: boolean
	isFullscreen?: boolean
	isEditMode?: boolean
	isPlaybackMode?: boolean
	isVisible?: boolean
	shouldApplyScaling?: boolean
	isScaleReady?: boolean
	iframeLoaded?: boolean
	contentInjected?: boolean
	contentLength?: number
}

export type IframeRenderLifecyclePayload = IframeRenderLifecycleContext & {
	stage: IframeRenderLifecycleStage
	reason?: string
	requestId?: string
	errorType?: unknown
	errorMessage?: unknown
	errorStack?: unknown
	errorSource?: unknown
	errorLineno?: unknown
	errorColno?: unknown
	origin?: string
	isExpectedSource?: boolean
	fullContentLength?: number
	markerId?: string
	dynamicInterceptionEnabled?: boolean
	contentWidth?: number
	contentHeight?: number
	hasHorizontalOverflow?: boolean
	hasVerticalOverflow?: boolean
	verticalScrollbarWidth?: number
	timeoutMs?: number
}

export interface IframeRenderLifecycleState {
	sessionId: string
	startedAt: number
	reportedStages: Set<IframeRenderLifecycleStage>
	timeoutTimer: ReturnType<typeof setTimeout> | null
}

interface IframeRenderLifecycleLogger {
	report: (event: string, data: IframeRenderLifecyclePayload) => void
}

interface MutableRef<T> {
	current: T
}

interface ReportIframeRenderLifecycleStageParams {
	logger: IframeRenderLifecycleLogger
	lifecycle: IframeRenderLifecycleState
	getContext: () => IframeRenderLifecycleContext
	stage: IframeRenderLifecycleStage
	extra?: Partial<IframeRenderLifecyclePayload>
	options?: {
		once?: boolean
	}
}

interface StartIframeRenderLifecycleSessionParams {
	logger: IframeRenderLifecycleLogger
	lifecycleRef: MutableRef<IframeRenderLifecycleState>
	getContext: () => IframeRenderLifecycleContext
	reason: string
	timeoutMs?: number
}

export function createIframeRenderLifecycleState(): IframeRenderLifecycleState {
	return {
		sessionId: `html_iframe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		startedAt: Date.now(),
		reportedStages: new Set<IframeRenderLifecycleStage>(),
		timeoutTimer: null,
	}
}

export function clearIframeRenderLifecycleTimeout(lifecycle: IframeRenderLifecycleState): void {
	if (!lifecycle.timeoutTimer) return

	clearTimeout(lifecycle.timeoutTimer)
	lifecycle.timeoutTimer = null
}

export function reportIframeRenderLifecycleStage({
	logger,
	lifecycle,
	getContext,
	stage,
	extra = {},
	options = { once: true },
}: ReportIframeRenderLifecycleStageParams): void {
	if (options.once !== false && lifecycle.reportedStages.has(stage)) return

	lifecycle.reportedStages.add(stage)
	logger.report(HTML_IFRAME_RENDER_LIFECYCLE_EVENT, {
		...getContext(),
		stage,
		...extra,
	})
}

export function startIframeRenderLifecycleSession({
	logger,
	lifecycleRef,
	getContext,
	reason,
	timeoutMs = IFRAME_RENDER_TIMEOUT_MS,
}: StartIframeRenderLifecycleSessionParams): void {
	clearIframeRenderLifecycleTimeout(lifecycleRef.current)

	lifecycleRef.current = createIframeRenderLifecycleState()
	reportIframeRenderLifecycleStage({
		logger,
		lifecycle: lifecycleRef.current,
		getContext,
		stage: "session_start",
		extra: { reason },
	})

	lifecycleRef.current.timeoutTimer = setTimeout(() => {
		reportIframeRenderLifecycleStage({
			logger,
			lifecycle: lifecycleRef.current,
			getContext,
			stage: "timeout",
			extra: {
				reason: "render_ready_not_received",
				timeoutMs,
			},
		})
	}, timeoutMs)
}
