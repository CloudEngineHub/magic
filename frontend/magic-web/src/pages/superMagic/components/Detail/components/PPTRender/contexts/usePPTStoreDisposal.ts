import { useEffect, useRef } from "react"
import type { PPTStore } from "../stores"

/**
 * Dispose the store after a real unmount without breaking React StrictMode's effect replay.
 * StrictMode runs setup -> cleanup -> setup for the same mounted instance in development;
 * the generation check lets the replayed setup invalidate the cleanup microtask.
 */
export function usePPTStoreDisposal(store: Pick<PPTStore, "dispose">): void {
	const lifecycleRef = useRef({ generation: 0 })

	useEffect(() => {
		const lifecycle = lifecycleRef.current
		const effectGeneration = ++lifecycle.generation

		return () => {
			queueMicrotask(() => {
				if (lifecycle.generation === effectGeneration) {
					store.dispose()
				}
			})
		}
	}, [store])
}
