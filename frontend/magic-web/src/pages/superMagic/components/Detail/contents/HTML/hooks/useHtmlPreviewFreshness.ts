import { useCallback, useEffect, useRef, useState } from "react"

export type HtmlPreviewPhase = "idle" | "updating" | "rendering" | "failed"
export const HTML_PREVIEW_READY_TIMEOUT = 15_000

/** A generation spans fetch, processing and the iframe acknowledgement. */
export function useHtmlPreviewFreshness(fileId: string | undefined) {
	const generation = useRef(0)
	const timer = useRef<ReturnType<typeof setTimeout>>()
	const mounted = useRef(true)
	const [phase, setPhase] = useState<HtmlPreviewPhase>("idle")
	const [hasRendered, setHasRendered] = useState(false)
	const clearTimer = useCallback(() => clearTimeout(timer.current), [])
	const isCurrent = useCallback(
		(request: number) => mounted.current && generation.current === request,
		[],
	)
	const begin = useCallback(
		(track = true) => {
			const request = ++generation.current
			clearTimer()
			if (!track) return request
			setPhase("updating")
			timer.current = setTimeout(() => {
				if (isCurrent(request)) setPhase("failed")
			}, HTML_PREVIEW_READY_TIMEOUT)
			return request
		},
		[clearTimer, isCurrent],
	)
	const ready = useCallback(
		(request: number) => {
			if (!isCurrent(request)) return
			clearTimer()
			setPhase("idle")
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
				if (isCurrent(request)) setPhase("failed")
			}, HTML_PREVIEW_READY_TIMEOUT)
		},
		[clearTimer, isCurrent],
	)
	const fail = useCallback(
		(request: number) => {
			if (!isCurrent(request)) return
			clearTimer()
			setPhase("failed")
		},
		[clearTimer, isCurrent],
	)
	useEffect(() => {
		mounted.current = true
		generation.current += 1
		setPhase("idle")
		setHasRendered(false)
		return () => {
			mounted.current = false
			generation.current += 1
			clearTimer()
		}
	}, [fileId, clearTimer])
	return { phase, hasRendered, begin, ready, rendering, fail, isCurrent }
}
