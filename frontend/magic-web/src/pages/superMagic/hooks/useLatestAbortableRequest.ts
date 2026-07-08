import { useCallback, useEffect, useRef } from "react"

export interface LatestAbortableRequest {
	signal: AbortSignal
	isCurrent: () => boolean
	release: () => void
}

export function isAbortError(error: unknown) {
	return (error as { name?: string } | null | undefined)?.name === "AbortError"
}

export function useLatestAbortableRequest() {
	const abortControllerRef = useRef<AbortController | null>(null)
	const requestSeqRef = useRef(0)

	const cancelCurrent = useCallback(() => {
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
		requestSeqRef.current += 1
	}, [])

	const startRequest = useCallback((): LatestAbortableRequest => {
		abortControllerRef.current?.abort()
		const abortController = new AbortController()
		const requestSeq = requestSeqRef.current + 1
		requestSeqRef.current = requestSeq
		abortControllerRef.current = abortController

		return {
			signal: abortController.signal,
			isCurrent: () =>
				requestSeqRef.current === requestSeq && !abortController.signal.aborted,
			release: () => {
				if (abortControllerRef.current === abortController) {
					abortControllerRef.current = null
				}
			},
		}
	}, [])

	useEffect(() => cancelCurrent, [cancelCurrent])

	return {
		startRequest,
		cancelCurrent,
	}
}
