import { act, renderHook, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import type { ProjectImageUrlResolver } from "../../project-image-node-extension"
import { useImageLoader } from "../useImageLoader"

/** Creates a controllable resolver that mirrors asynchronously restored attachment context. */
function createResolver(initiallyReady: boolean) {
	let ready = initiallyReady
	let listener: (() => void) | undefined
	const resolver = vi.fn(async (src: string) => {
		return ready ? `https://tos.invalid/${src}` : src
	}) as ProjectImageUrlResolver
	resolver.isReady = () => ready
	resolver.subscribe = (nextListener) => {
		listener = nextListener
		return () => {
			listener = undefined
		}
	}

	return {
		resolver,
		/** Marks attachment context ready and notifies the mounted image loader. */
		markReady() {
			ready = true
			listener?.()
		},
	}
}

describe("useImageLoader attachment readiness", () => {
	const retryConfig = {
		MAX_RETRIES: 1,
		INITIAL_DELAY: 0,
		MAX_DELAY: 0,
		TOTAL_TIMEOUT: 1000,
	}

	it("waits for attachment context and retries automatically when it becomes ready", async () => {
		const { resolver, markReady } = createResolver(false)
		const { result } = renderHook(() =>
			useImageLoader({
				src: "./images/mock-photo.png",
				shouldLoad: true,
				urlResolver: resolver,
				retryConfig,
			}),
		)

		expect(result.current.loading).toBe(true)
		expect(resolver).not.toHaveBeenCalled()

		act(() => markReady())

		await waitFor(() => {
			expect(result.current.imageUrl).toBe("https://tos.invalid/./images/mock-photo.png")
		})
		expect(result.current.error).toBeNull()
	})

	it("keeps the real missing-path behavior after attachment context is ready", async () => {
		const resolver = vi.fn(async (src: string) => src) as ProjectImageUrlResolver
		resolver.isReady = () => true

		const { result } = renderHook(() =>
			useImageLoader({
				src: "./images/mock-missing.png",
				shouldLoad: true,
				urlResolver: resolver,
				retryConfig,
			}),
		)

		await waitFor(() => {
			expect(result.current.error?.message).toBe(
				"Image URL not found after multiple attempts",
			)
		})
		expect(result.current.imageUrl).toBeNull()
	})

	it("keeps a loaded image stable when the attachment context refreshes", async () => {
		const { resolver, markReady } = createResolver(true)
		const { result } = renderHook(() =>
			useImageLoader({
				src: "./images/mock-stable.png",
				shouldLoad: true,
				urlResolver: resolver,
				retryConfig,
			}),
		)

		await waitFor(() => expect(result.current.imageUrl).not.toBeNull())
		act(() => markReady())

		expect(resolver).toHaveBeenCalledTimes(1)
		expect(result.current.imageUrl).toBe("https://tos.invalid/./images/mock-stable.png")
	})
})
