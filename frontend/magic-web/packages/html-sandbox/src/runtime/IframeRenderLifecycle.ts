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
	| "timeout"

export interface IframeRenderLifecycleState {
	sessionId: string
	startedAt: number
	reportedStages: Set<IframeRenderLifecycleStage>
	timeoutTimer: ReturnType<typeof setTimeout> | null
}

interface IframeRenderLifecycleLogger {
	report: (event: string, data: Record<string, unknown>) => void
}

interface MutableRef<T> {
	current: T
}

interface ReportIframeRenderLifecycleStageParams {
	logger: IframeRenderLifecycleLogger
	lifecycle: IframeRenderLifecycleState
	getContext: () => Record<string, unknown>
	stage: IframeRenderLifecycleStage
	extra?: Record<string, unknown>
	options?: {
		once?: boolean
	}
}

interface StartIframeRenderLifecycleSessionParams {
	logger: IframeRenderLifecycleLogger
	lifecycleRef: MutableRef<IframeRenderLifecycleState>
	getContext: () => Record<string, unknown>
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
