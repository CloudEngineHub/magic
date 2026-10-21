import { useCallback, useEffect, useRef, useState } from "react"

export type HtmlPreviewPhase = "idle" | "updating" | "rendering" | "failed"
export const HTML_PREVIEW_READY_TIMEOUT = 15_000

/**
 * Why a preview generation ended in `failed`. The notice itself is generic, so the
 * reason is the only way to tell apart the stages that otherwise look identical:
 * - `update_timeout`: no document reached the iframe (fetch/processing never finished).
 * - `render_timeout`: a document was sent but the iframe never acknowledged it.
 * - `load_failed`: the remote file could not be downloaded.
 * - `process_failed`: resource processing of the downloaded file threw.
 */
export type HtmlPreviewFailureReason =
	"update_timeout" | "render_timeout" | "load_failed" | "process_failed"

export interface HtmlPreviewFailure {
	reason: HtmlPreviewFailureReason
	/** Wall-clock time since the generation began, to separate slow from broken. */
	elapsedMs: number
	/** False means the user saw nothing yet: a blank area, not just a stale preview. */
	hasRendered: boolean
	/** Only set for `load_failed` / `process_failed`; timeouts have no underlying error. */
	error?: unknown
}

/** A generation spans fetch, processing and the iframe acknowledgement. */
export function useHtmlPreviewFreshness(
	fileId: string | undefined,
	onFailed?: (failure: HtmlPreviewFailure) => void,
) {
	const generation = useRef(0)
	const startedAt = useRef(0)
	// Latest callback via ref: timers are armed once and must not report through a stale closure.
	const onFailedRef = useRef(onFailed)
	onFailedRef.current = onFailed
	const timer = useRef<ReturnType<typeof setTimeout>>()
	const mounted = useRef(true)
	const [phase, setPhase] = useState<HtmlPreviewPhase>("idle")
	const [hasRendered, setHasRendered] = useState(false)
	const hasRenderedRef = useRef(false)
	const clearTimer = useCallback(() => clearTimeout(timer.current), [])
	const isCurrent = useCallback(
		(request: number) => mounted.current && generation.current === request,
		[],
	)
	const markFailed = useCallback((reason: HtmlPreviewFailureReason, error?: unknown) => {
		setPhase("failed")
		onFailedRef.current?.({
			reason,
			elapsedMs: Date.now() - startedAt.current,
			hasRendered: hasRenderedRef.current,
			error,
		})
	}, [])
	const begin = useCallback(
		(track = true) => {
			const request = ++generation.current
			clearTimer()
			startedAt.current = Date.now()
			if (!track) return request
			setPhase("updating")
			timer.current = setTimeout(() => {
				if (isCurrent(request)) markFailed("update_timeout")
			}, HTML_PREVIEW_READY_TIMEOUT)
			return request
		},
		[clearTimer, isCurrent, markFailed],
	)
	const ready = useCallback(
		(request: number) => {
			if (!isCurrent(request)) return
			clearTimer()
			setPhase("idle")
			hasRenderedRef.current = true
			setHasRendered(true)
		},
		[clearTimer, isCurrent],
	)
	const rendering = useCallback(
		(request: number) => {
			if (!isCurrent(request)) return
			clearTimer()
			setPhase("rendering")
			// Background resource checks only start a timeout once a new document is sent.
			timer.current = setTimeout(() => {
				if (isCurrent(request)) markFailed("render_timeout")
			}, HTML_PREVIEW_READY_TIMEOUT)
		},
		[clearTimer, isCurrent, markFailed],
	)
	const fail = useCallback(
		(
			request: number,
			reason: Extract<HtmlPreviewFailureReason, "load_failed" | "process_failed">,
			error?: unknown,
		) => {
			if (!isCurrent(request)) return
			clearTimer()
			markFailed(reason, error)
		},
		[clearTimer, isCurrent, markFailed],
	)
	useEffect(() => {
		mounted.current = true
		generation.current += 1
		setPhase("idle")
		hasRenderedRef.current = false
		setHasRendered(false)
		return () => {
			mounted.current = false
			generation.current += 1
			clearTimer()
		}
	}, [fileId, clearTimer])
	return { phase, hasRendered, begin, ready, rendering, fail, isCurrent }
}
