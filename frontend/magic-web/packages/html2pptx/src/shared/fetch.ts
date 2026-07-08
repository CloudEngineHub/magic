import { createAbortError } from "../sandbox/abort"
import { RESOURCE_LOAD_TIMEOUT_MS } from "./constants"

export interface FetchArrayBufferResult {
	response: Response
	buffer: ArrayBuffer
}

export interface FetchBlobResult {
	response: Response
	blob: Blob
}

export async function fetchArrayBufferWithLimit(
	src: string,
	signal?: AbortSignal,
): Promise<FetchArrayBufferResult> {
	return withResourceFetchLimit(src, signal, async (fetchSignal) => {
		const response = await fetch(src, { signal: fetchSignal })
		const buffer = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0)
		return { response, buffer }
	})
}

export async function fetchBlobWithLimit(
	src: string,
	signal?: AbortSignal,
): Promise<FetchBlobResult> {
	return withResourceFetchLimit(src, signal, async (fetchSignal) => {
		const response = await fetch(src, { signal: fetchSignal })
		const blob = response.ok ? await response.blob() : new Blob()
		return { response, blob }
	})
}

async function withResourceFetchLimit<T>(
	src: string,
	signal: AbortSignal | undefined,
	task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController()
	const timeout = setTimeout(() => {
		controller.abort(new Error(`fetch timeout(${RESOURCE_LOAD_TIMEOUT_MS}ms): ${src}`))
	}, RESOURCE_LOAD_TIMEOUT_MS)
	const onAbort = () => controller.abort(createAbortError())
	signal?.addEventListener("abort", onAbort, { once: true })
	if (signal?.aborted) onAbort()
	try {
		return await task(controller.signal)
	} finally {
		clearTimeout(timeout)
		signal?.removeEventListener("abort", onAbort)
	}
}
